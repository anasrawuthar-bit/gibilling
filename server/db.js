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
`);

// Seed default Super Admin if not present
const existingAdmin = masterDb.prepare('SELECT id FROM admins WHERE email = ?').get('admin@zynbill.com');
if (!existingAdmin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync('admin123', salt, 1000, 32, 'sha256').toString('hex');
  masterDb.prepare(`
    INSERT INTO admins (id, email, password_hash, password_salt, name, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('admin_master', 'admin@zynbill.com', hash, salt, 'Super Administrator', new Date().toISOString());
  console.log('[MasterDB] Initialized default Super Admin (admin@zynbill.com / admin123)');
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
  getTenantDbPath
};
