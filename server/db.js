/**
 * ZynBill Cloud Database Module
 * Uses Node.js native DatabaseSync (node:sqlite)
 * Provides:
 * 1. Master Database (Customers, Super Admins, OTPs, Device Activations, Sync Audit)
 * 2. Multi-Tenant Database Provisioning (Isolated database file per customer)
 */

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');

// Load environment variables from .env if present
function loadEnv() {
  const envCandidates = [
    path.join(__dirname, '.env'),
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), 'server', '.env')
  ];
  for (const envPath of envCandidates) {
    if (fs.existsSync(envPath)) {
      try {
        const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      } catch (_) {}
    }
  }
}
loadEnv();

const DATA_DIR = path.join(__dirname, 'data');
const TENANTS_DIR = path.join(DATA_DIR, 'tenants');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(TENANTS_DIR)) fs.mkdirSync(TENANTS_DIR, { recursive: true });

const MASTER_DB_PATH = path.join(DATA_DIR, 'master.sqlite');
const masterDb = new DatabaseSync(MASTER_DB_PATH);

// Initialize Master Tables
masterDb.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    company_name TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    state TEXT,
    gstin TEXT,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_approval', -- 'pending_approval', 'active', 'suspended', 'rejected'
    plan TEXT NOT NULL DEFAULT 'Professional',       -- 'Starter', 'Professional', 'Enterprise'
    valid_until TEXT,
    rejection_reason TEXT,
    created_at TEXT NOT NULL,
    approved_at TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admins (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS otps (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    purpose TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    verified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS device_tokens (
    token TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    machine_name TEXT,
    created_at TEXT NOT NULL,
    last_active_at TEXT NOT NULL,
    FOREIGN KEY(customer_id) REFERENCES customers(id)
  );

  CREATE TABLE IF NOT EXISTS sync_audit (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    batch_size INTEGER NOT NULL,
    synced_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    description TEXT,
    price REAL DEFAULT 0,
    billing_cycle TEXT DEFAULT 'yearly', -- 'monthly', 'yearly', 'lifetime'
    duration_days INTEGER DEFAULT 365,
    max_devices INTEGER DEFAULT 2,
    features TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// Add pin columns to customers if not present
try {
  masterDb.exec(`ALTER TABLE customers ADD COLUMN pin_hash TEXT;`);
} catch (_) {}
try {
  masterDb.exec(`ALTER TABLE customers ADD COLUMN pin_salt TEXT;`);
} catch (_) {}

// Helper methods for system settings
function getSetting(key, defaultValue = '') {
  try {
    const row = masterDb.prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
    return row ? row.value : defaultValue;
  } catch (_) {
    return defaultValue;
  }
}

function setSetting(key, value) {
  const now = new Date().toISOString();
  masterDb.prepare(`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, String(value), now);
}

// Seed default plans if empty
const planCount = masterDb.prepare('SELECT COUNT(*) as c FROM plans').get().c;
if (planCount === 0) {
  const now = new Date().toISOString();
  const defaultPlans = [
    {
      id: 'plan_starter',
      name: 'Starter Free Trial',
      code: 'Starter',
      description: 'Ideal for trial evaluations and single-counter billing stores.',
      price: 0,
      billing_cycle: 'monthly',
      duration_days: 30,
      max_devices: 1,
      features: JSON.stringify(['Local SQLite Database', 'GST & Non-GST Billing', 'Item & Party Master', 'Thermal & A4 Invoicing', '1 Authorized PC'])
    },
    {
      id: 'plan_professional',
      name: 'Professional Business',
      code: 'Professional',
      description: 'Complete billing, multi-device cloud synchronization, WhatsApp connect & offline grace period.',
      price: 4999,
      billing_cycle: 'yearly',
      duration_days: 365,
      max_devices: 3,
      features: JSON.stringify(['All Starter Features', 'Automatic Background Cloud Sync', '14-Day Offline Grace Period', 'WhatsApp Connect Integration', 'Automated Daily Backups', 'Up to 3 Authorized PCs', 'Priority Support'])
    },
    {
      id: 'plan_enterprise',
      name: 'Enterprise Multi-Store',
      code: 'Enterprise',
      description: 'Unlimited multi-counter terminals, multi-branch synchronization and advanced reporting.',
      price: 9999,
      billing_cycle: 'yearly',
      duration_days: 365,
      max_devices: 10,
      features: JSON.stringify(['All Professional Features', 'Up to 10 Authorized Terminals', 'Dedicated Isolated Tenant Database', 'Custom Invoice Templates', 'Unlimited Multi-Store Sync', '24/7 Dedicated Support'])
    }
  ];

  for (const p of defaultPlans) {
    masterDb.prepare(`
      INSERT INTO plans (id, name, code, description, price, billing_cycle, duration_days, max_devices, features, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(p.id, p.name, p.code, p.description, p.price, p.billing_cycle, p.duration_days, p.max_devices, p.features, now, now);
  }
  console.log('[MasterDB] Seeded 3 default subscription plans (Starter, Professional, Enterprise)');
}

// Seed or synchronize Super Admin from .env credentials
const targetAdminEmail = String(process.env.SUPER_ADMIN_EMAIL || 'admin@zynbill.com').trim().toLowerCase();
const targetAdminPass = String(process.env.SUPER_ADMIN_PASSWORD || 'admin123');
const targetAdminName = String(process.env.SUPER_ADMIN_NAME || 'Super Administrator');

const existingAdmin = masterDb.prepare('SELECT id FROM admins WHERE id = ? OR email = ?').get('admin_master', targetAdminEmail);
if (!existingAdmin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(targetAdminPass, salt, 1000, 32, 'sha256').toString('hex');
  masterDb.prepare(`
    INSERT INTO admins (id, email, password_hash, password_salt, name, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('admin_master', targetAdminEmail, hash, salt, targetAdminName, new Date().toISOString());
  console.log(`[MasterDB] Initialized Super Admin (${targetAdminEmail}) from .env configuration`);
} else {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(targetAdminPass, salt, 1000, 32, 'sha256').toString('hex');
  masterDb.prepare(`
    UPDATE admins SET email = ?, password_hash = ?, password_salt = ?, name = ? WHERE id = ?
  `).run(targetAdminEmail, hash, salt, targetAdminName, existingAdmin.id);
  console.log(`[MasterDB] Synchronized Super Admin (${targetAdminEmail}) from .env`);
}

// ── Password Helper Functions ──────────────────────────────────────────
function hashPassword(password, salt = null) {
  if (!salt) salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 32, 'sha256').toString('hex');
  return { hash, salt };
}

function verifyPassword(password, storedHash, salt) {
  const testHash = crypto.pbkdf2Sync(password, salt, 1000, 32, 'sha256').toString('hex');
  return testHash === storedHash;
}

// ── Multi-Tenant Database Helper ────────────────────────────────────────
const tenantDbCache = new Map();

function getTenantDbPath(customerId) {
  const sanitized = customerId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(TENANTS_DIR, `tenant_${sanitized}.sqlite`);
}

function getTenantDb(customerId) {
  if (tenantDbCache.has(customerId)) {
    return tenantDbCache.get(customerId);
  }

  const tenantPath = getTenantDbPath(customerId);
  const tenantDb = new DatabaseSync(tenantPath);

  // Initialize tenant tables
  tenantDb.exec(`
    CREATE TABLE IF NOT EXISTS tenant_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS parties (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      party_type TEXT,
      gstin TEXT,
      state TEXT,
      balance REAL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sku TEXT,
      category TEXT,
      sale_price REAL DEFAULT 0,
      purchase_price REAL DEFAULT 0,
      tax_rate REAL DEFAULT 0,
      stock_qty REAL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      invoice_no TEXT,
      party_id TEXT,
      party_name TEXT,
      total_amount REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      status TEXT,
      transaction_date TEXT NOT NULL,
      raw_payload TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_events (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload TEXT,
      idempotency_key TEXT UNIQUE,
      client_timestamp TEXT,
      server_timestamp TEXT NOT NULL
    );
  `);

  tenantDbCache.set(customerId, tenantDb);
  return tenantDb;
}

module.exports = {
  masterDb,
  hashPassword,
  verifyPassword,
  getTenantDb,
  getTenantDbPath,
  getSetting,
  setSetting
};
