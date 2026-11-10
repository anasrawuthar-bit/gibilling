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

// Enable WAL mode & concurrency timeout
try {
  masterDb.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
  `);
} catch (pragmaErr) {
  console.warn('[MasterDB Pragma Warning]:', pragmaErr.message);
}

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
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS web_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_type TEXT NOT NULL, -- 'admin' or 'customer'
    email TEXT NOT NULL,
    name TEXT,
    data TEXT,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_active_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON web_sessions (expires_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON web_sessions (user_id);

  CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    reset_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON rate_limits (reset_at);

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

  CREATE TABLE IF NOT EXISTS error_logs (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,         -- 'server', 'desktop_client', 'sync_engine', 'auth', 'database'
    level TEXT NOT NULL,          -- 'CRITICAL', 'ERROR', 'WARN', 'INFO'
    message TEXT NOT NULL,
    stack TEXT,
    endpoint TEXT,
    customer_id TEXT,
    client_version TEXT,
    ip_address TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs (created_at DESC);
`);

// Add pin columns to customers if not present
try {
  masterDb.exec(`ALTER TABLE customers ADD COLUMN pin_hash TEXT;`);
} catch (_) {}
try {
  masterDb.exec(`ALTER TABLE customers ADD COLUMN pin_salt TEXT;`);
} catch (_) {}
try {
  masterDb.exec(`ALTER TABLE otps ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;`);
} catch (_) {}

// Migration: Safe upgrade of web_sessions from raw tokens to SHA-256 token hashes
try {
  const sessionCols = masterDb.prepare("PRAGMA table_info(web_sessions);").all();
  const hasTokenCol = sessionCols.some(c => c.name === 'token');
  const hasTokenHashCol = sessionCols.some(c => c.name === 'token_hash');

  if (hasTokenCol && !hasTokenHashCol) {
    const existingSessions = masterDb.prepare("SELECT * FROM web_sessions;").all();
    masterDb.exec("ALTER TABLE web_sessions RENAME COLUMN token TO token_hash;");
    for (const s of existingSessions) {
      if (s.token && !/^[0-9a-f]{64}$/i.test(s.token)) {
        const hashed = crypto.createHash('sha256').update(s.token).digest('hex');
        masterDb.prepare("UPDATE web_sessions SET token_hash = ? WHERE token_hash = ?").run(hashed, s.token);
      }
    }
  }
} catch (migErr) {
  console.warn('[Session Migration Note]:', migErr.message);
}

// ── Persistent Web Session Management (SHA-256 Token Hashing) ─────────
function hashSessionToken(token) {
  if (!token || typeof token !== 'string') return '';
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

function saveSession(rawToken, userType, userId, email, name = '', data = {}, ttlMs = 7 * 24 * 60 * 60 * 1000) {
  const tokenHash = hashSessionToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
  const nowIso = now.toISOString();
  masterDb.prepare(`
    INSERT INTO web_sessions (token_hash, user_id, user_type, email, name, data, expires_at, created_at, last_active_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(token_hash) DO UPDATE SET last_active_at = excluded.last_active_at, expires_at = excluded.expires_at
  `).run(tokenHash, userId, userType, email, name || '', JSON.stringify(data), expiresAt, nowIso, nowIso);
  return { token: rawToken, tokenHash, expiresAt };
}

function getSession(rawToken) {
  if (!rawToken) return null;
  const tokenHash = hashSessionToken(rawToken);
  try {
    const row = masterDb.prepare(`
      SELECT * FROM web_sessions WHERE token_hash = ?
    `).get(tokenHash);
    if (!row) return null;

    if (new Date(row.expires_at).getTime() < Date.now()) {
      masterDb.prepare('DELETE FROM web_sessions WHERE token_hash = ?').run(tokenHash);
      return null;
    }

    try {
      masterDb.prepare('UPDATE web_sessions SET last_active_at = ? WHERE token_hash = ?').run(new Date().toISOString(), tokenHash);
    } catch (_) {}

    let parsedData = {};
    try { parsedData = JSON.parse(row.data); } catch (_) {}
    return {
      tokenHash: row.token_hash,
      userId: row.user_id,
      userType: row.user_type,
      email: row.email,
      name: row.name,
      ...parsedData
    };
  } catch (_) {
    return null;
  }
}

function deleteSession(rawToken) {
  if (!rawToken) return false;
  const tokenHash = hashSessionToken(rawToken);
  try {
    const res = masterDb.prepare('DELETE FROM web_sessions WHERE token_hash = ?').run(tokenHash);
    return res.changes > 0;
  } catch (_) {
    return false;
  }
}

function cleanupExpiredSessions() {
  try {
    masterDb.prepare('DELETE FROM web_sessions WHERE expires_at < ?').run(new Date().toISOString());
  } catch (_) {}
}

// ── Persistent Rate Limiting Engine (SQLite-Backed) ───────────────────
function checkRateLimit(key, maxAttempts = 5, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  try {
    const row = masterDb.prepare('SELECT count, reset_at FROM rate_limits WHERE key = ?').get(key);
    if (!row || now > row.reset_at) {
      const resetAt = now + windowMs;
      masterDb.prepare(`
        INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
        ON CONFLICT(key) DO UPDATE SET count = 1, reset_at = excluded.reset_at
      `).run(key, resetAt);
      return { allowed: true, remaining: maxAttempts - 1, retryAfterSec: 0, isDbError: false };
    }

    if (row.count >= maxAttempts) {
      const retryAfterSec = Math.ceil((row.reset_at - now) / 1000);
      return { allowed: false, remaining: 0, retryAfterSec, isDbError: false };
    }

    const newCount = row.count + 1;
    masterDb.prepare('UPDATE rate_limits SET count = ? WHERE key = ?').run(newCount, key);
    return { allowed: true, remaining: maxAttempts - newCount, retryAfterSec: 0, isDbError: false };
  } catch (err) {
    console.error('[RateLimit DB Error - Failing Closed]:', err.message);
    return {
      allowed: false,
      isDbError: true,
      error: 'Security verification service temporarily unavailable.',
      remaining: 0,
      retryAfterSec: 60
    };
  }
}

function resetRateLimit(key) {
  try {
    masterDb.prepare('DELETE FROM rate_limits WHERE key = ?').run(key);
  } catch (_) {}
}

function cleanupRateLimits() {
  try {
    masterDb.prepare('DELETE FROM rate_limits WHERE reset_at < ?').run(Date.now());
  } catch (_) {}
}

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

function setSettingsTransaction(settingsMap) {
  const now = new Date().toISOString();
  masterDb.exec('BEGIN TRANSACTION;');
  try {
    const stmt = masterDb.prepare(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);
    for (const [key, value] of Object.entries(settingsMap)) {
      if (value !== undefined && value !== null) {
        stmt.run(key, String(value), now);
      }
    }
    masterDb.exec('COMMIT;');
  } catch (err) {
    try { masterDb.exec('ROLLBACK;'); } catch (_) {}
    throw err;
  }
}

function restoreSettingsTransaction(settingsMap) {
  const now = new Date().toISOString();
  masterDb.exec('BEGIN TRANSACTION;');
  try {
    const upsertStmt = masterDb.prepare(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);
    const deleteStmt = masterDb.prepare('DELETE FROM system_settings WHERE key = ?');

    for (const [key, value] of Object.entries(settingsMap)) {
      if (value === null || value === undefined) {
        deleteStmt.run(key);
      } else {
        upsertStmt.run(key, String(value), now);
      }
    }
    masterDb.exec('COMMIT;');
  } catch (err) {
    try { masterDb.exec('ROLLBACK;'); } catch (_) {}
    throw err;
  }
}

// Error Logging Helpers
function logSystemError({
  source = 'server',
  level = 'ERROR',
  message,
  stack = '',
  endpoint = '',
  customerId = '',
  clientVersion = '',
  ipAddress = ''
}) {
  try {
    const id = 'err_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const stmt = masterDb.prepare(`
      INSERT INTO error_logs (id, source, level, message, stack, endpoint, customer_id, client_version, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      String(source).slice(0, 32),
      String(level).toUpperCase().slice(0, 16),
      String(message || 'Unknown error').slice(0, 1000),
      String(stack || '').slice(0, 5000),
      String(endpoint || '').slice(0, 255),
      String(customerId || '').slice(0, 64),
      String(clientVersion || '').slice(0, 32),
      String(ipAddress || '').slice(0, 64),
      new Date().toISOString()
    );
    return id;
  } catch (err) {
    console.error('[Failed to insert error log]:', err);
    return null;
  }
}

function getErrorLogs({ limit = 100, level = '', source = '' } = {}) {
  try {
    let query = 'SELECT * FROM error_logs WHERE 1=1';
    const params = [];
    if (level) {
      query += ' AND level = ?';
      params.push(level.toUpperCase());
    }
    if (source) {
      query += ' AND source = ?';
      params.push(source);
    }
    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(Math.min(parseInt(limit, 10) || 100, 500));

    const rows = masterDb.prepare(query).all(...params);

    const today = new Date().toISOString().slice(0, 10);
    const totalToday = masterDb.prepare("SELECT COUNT(*) as c FROM error_logs WHERE created_at LIKE ?").get(`${today}%`)?.c || 0;
    const criticalCount = masterDb.prepare("SELECT COUNT(*) as c FROM error_logs WHERE level = 'CRITICAL'").get()?.c || 0;
    const clientCount = masterDb.prepare("SELECT COUNT(*) as c FROM error_logs WHERE source = 'desktop_client'").get()?.c || 0;
    const serverCount = masterDb.prepare("SELECT COUNT(*) as c FROM error_logs WHERE source = 'server'").get()?.c || 0;

    return {
      logs: rows,
      stats: { totalToday, criticalCount, clientCount, serverCount }
    };
  } catch (err) {
    console.error('[Failed to retrieve error logs]:', err);
    return { logs: [], stats: { totalToday: 0, criticalCount: 0, clientCount: 0, serverCount: 0 } };
  }
}

function clearErrorLogs() {
  try {
    masterDb.prepare('DELETE FROM error_logs').run();
    return true;
  } catch (err) {
    console.error('[Failed to clear error logs]:', err);
    return false;
  }
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

// ── Password Helper Functions (OWASP 600,000 Rounds Migration) ─────────
const PBKDF2_ROUNDS_MODERN = 600000;
const PBKDF2_ROUNDS_PHASE1 = 100000;
const PBKDF2_ROUNDS_LEGACY = 1000;

function hashPassword(password, salt = null) {
  if (!salt) {
    salt = 'pbkdf2_600k$' + crypto.randomBytes(16).toString('hex');
  }
  let iterations = PBKDF2_ROUNDS_LEGACY;
  if (salt.startsWith('pbkdf2_600k$')) {
    iterations = PBKDF2_ROUNDS_MODERN;
  } else if (salt.startsWith('pbkdf2_100k$')) {
    iterations = PBKDF2_ROUNDS_PHASE1;
  }
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
  return { hash, salt };
}

function verifyPassword(password, storedHash, salt) {
  if (!password || !storedHash || !salt) return false;
  let iterations = PBKDF2_ROUNDS_LEGACY;
  if (salt.startsWith('pbkdf2_600k$')) {
    iterations = PBKDF2_ROUNDS_MODERN;
  } else if (salt.startsWith('pbkdf2_100k$')) {
    iterations = PBKDF2_ROUNDS_PHASE1;
  }
  const testHash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
  return testHash === storedHash;
}

function checkPasswordNeedsRehash(salt) {
  return !String(salt || '').startsWith('pbkdf2_600k$');
}

// Seed or synchronize Super Admin from .env credentials
const targetAdminEmail = String(process.env.SUPER_ADMIN_EMAIL || 'admin@zynbill.com').trim().toLowerCase();
const envAdminPass = process.env.SUPER_ADMIN_PASSWORD ? String(process.env.SUPER_ADMIN_PASSWORD).trim() : '';
const targetAdminName = String(process.env.SUPER_ADMIN_NAME || 'Super Administrator');

const existingAdmin = masterDb.prepare('SELECT id, email, password_salt FROM admins WHERE id = ? OR email = ?').get('admin_master', targetAdminEmail);
if (!existingAdmin) {
  if (!envAdminPass || envAdminPass.length < 8) {
    throw new Error(
      '[Security Exception] Super Admin account does not exist and SUPER_ADMIN_PASSWORD environment variable is missing or shorter than 8 characters. Administrator initialization refused.'
    );
  }
  const { hash, salt } = hashPassword(envAdminPass);
  masterDb.prepare(`
    INSERT INTO admins (id, email, password_hash, password_salt, name, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('admin_master', targetAdminEmail, hash, salt, targetAdminName, new Date().toISOString());
  console.log(`[MasterDB] Initialized Super Admin (${targetAdminEmail}) with OWASP 600k PBKDF2 hashing`);
} else {
  // Existing administrator found: preserve credentials unless explicitly configured with valid strong password
  if (envAdminPass && envAdminPass.length >= 8) {
    const { hash, salt } = hashPassword(envAdminPass);
    masterDb.prepare(`
      UPDATE admins SET email = ?, password_hash = ?, password_salt = ?, name = ? WHERE id = ?
    `).run(targetAdminEmail, hash, salt, targetAdminName, existingAdmin.id);
    console.log(`[MasterDB] Synchronized Super Admin (${targetAdminEmail}) credentials with OWASP 600k PBKDF2 hashing`);
  } else if (envAdminPass && envAdminPass.length < 8) {
    console.warn(`[MasterDB Security Warning] Provided SUPER_ADMIN_PASSWORD is shorter than 8 characters. Preserved existing credentials for (${existingAdmin.email || targetAdminEmail}).`);
  } else {
    console.log(`[MasterDB] Preserved existing Super Admin account (${existingAdmin.email || targetAdminEmail}).`);
  }
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

  // Enable WAL mode & concurrency timeout for tenant database
  try {
    tenantDb.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
    `);
  } catch (tPragmaErr) {
    console.warn(`[TenantDB Pragma Warning for ${customerId}]:`, tPragmaErr.message);
  }

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
      server_timestamp TEXT NOT NULL,
      server_version INTEGER DEFAULT 1,
      device_id TEXT
    );
  `);

  // Safe backward-compatible column upgrades for existing tenant DBs
  try { tenantDb.exec("ALTER TABLE sync_events ADD COLUMN server_version INTEGER DEFAULT 1;"); } catch (_) {}
  try { tenantDb.exec("ALTER TABLE sync_events ADD COLUMN device_id TEXT;"); } catch (_) {}
  try { tenantDb.exec("CREATE INDEX IF NOT EXISTS idx_sync_events_ts_id ON sync_events(server_timestamp, id);"); } catch (_) {}

  tenantDbCache.set(customerId, tenantDb);
  return tenantDb;
}

// ── Cloud Database Backup Subsystem (WAL-Safe VACUUM INTO) ─────────────
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

function backupDatabaseHandle(dbHandle, prefix = 'master') {
  if (!dbHandle) return null;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const destName = `${prefix}_backup_${ts}.sqlite`;
  const destPath = path.join(BACKUPS_DIR, destName);
  const tempPath = path.join(BACKUPS_DIR, `${destName}.tmp`);

  try {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    if (fs.existsSync(destPath)) fs.unlinkSync(destPath);

    // Run SQLite VACUUM INTO for point-in-time, WAL-checkpointed atomic snapshot
    const escapedTempPath = tempPath.replace(/'/g, "''");
    dbHandle.exec(`VACUUM INTO '${escapedTempPath}';`);

    // Verify snapshot integrity before finalizing
    const verifyDb = new DatabaseSync(tempPath, { readOnly: true });
    const check = verifyDb.prepare('PRAGMA quick_check;').get();
    verifyDb.close();

    if (!check || check.quick_check !== 'ok') {
      throw new Error(`Integrity verification failed on snapshot: ${check ? check.quick_check : 'null'}`);
    }

    // Atomically move verified snapshot to final destination
    fs.renameSync(tempPath, destPath);

    // Prune backups beyond last 7 for this prefix
    const backups = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.startsWith(`${prefix}_backup_`) && f.endsWith('.sqlite'))
      .map(f => ({ name: f, time: fs.statSync(path.join(BACKUPS_DIR, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);

    if (backups.length > 7) {
      for (let i = 7; i < backups.length; i++) {
        try { fs.unlinkSync(path.join(BACKUPS_DIR, backups[i].name)); } catch (_) {}
      }
    }

    const stat = fs.statSync(destPath);
    return {
      name: destName,
      path: destPath,
      size: stat.size,
      sizeKb: (stat.size / 1024).toFixed(1) + ' KB',
      createdAt: new Date().toISOString()
    };
  } catch (err) {
    console.error(`[Backup Error for ${prefix}]:`, err.message);
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
    return null;
  }
}

function backupMasterDb() {
  return backupDatabaseHandle(masterDb, 'master');
}

function backupAllTenantDbs() {
  if (!fs.existsSync(TENANTS_DIR)) return [];
  const files = fs.readdirSync(TENANTS_DIR).filter(f => f.endsWith('.sqlite'));
  const results = [];
  for (const f of files) {
    const customerId = f.replace(/\.sqlite$/, '');
    try {
      const tenantDb = getTenantDb(customerId);
      const b = backupDatabaseHandle(tenantDb, `tenant_${customerId}`);
      if (b) results.push(b);
    } catch (tErr) {
      console.error(`[Tenant Backup Error for ${customerId}]:`, tErr.message);
    }
  }
  return results;
}

function listCloudBackups() {
  if (!fs.existsSync(BACKUPS_DIR)) return [];
  return fs.readdirSync(BACKUPS_DIR)
    .filter(f => f.endsWith('.sqlite'))
    .map(f => {
      const stat = fs.statSync(path.join(BACKUPS_DIR, f));
      return {
        filename: f,
        sizeBytes: stat.size,
        sizeKb: (stat.size / 1024).toFixed(1) + ' KB',
        createdAt: stat.mtime.toISOString()
      };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// ── Backup Restore & Integrity Verification Helper (Development & Disaster Recovery) ──
function verifyAndInspectBackup(backupFilePath) {
  if (!fs.existsSync(backupFilePath)) {
    return { ok: false, error: 'Backup file does not exist on disk.' };
  }
  try {
    const testDb = new DatabaseSync(backupFilePath, { readOnly: true });
    const quickCheck = testDb.prepare('PRAGMA quick_check;').get();
    const fkCheck = testDb.prepare('PRAGMA foreign_key_check;').all();
    const tables = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';").all().map(t => t.name);
    testDb.close();

    const isHealthy = quickCheck && quickCheck.quick_check === 'ok' && fkCheck.length === 0;
    return {
      ok: isHealthy,
      integrity: quickCheck ? quickCheck.quick_check : 'failed',
      foreignKeyViolations: fkCheck.length,
      tables,
      sizeBytes: fs.statSync(backupFilePath).size
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function getCanonicalPath(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') {
    throw new Error('Target path must be a valid non-empty string');
  }

  let current = path.resolve(targetPath);
  let hops = 0;
  const maxHops = 40;

  while (hops < maxHops) {
    hops++;
    const parsed = path.parse(current);
    const root = parsed.root;
    const segments = current.slice(root.length).split(path.sep).filter(Boolean);

    let accumulated = root;
    let symlinkFound = false;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const checkPath = path.join(accumulated, seg);

      let lstat;
      try {
        lstat = fs.lstatSync(checkPath);
      } catch (err) {
        if (err.code === 'ENOENT') {
          accumulated = checkPath;
          continue;
        }
        throw new Error(`Canonical path resolution failed at '${checkPath}': ${err.message}`);
      }

      if (lstat.isSymbolicLink()) {
        symlinkFound = true;
        let linkTarget;
        try {
          linkTarget = fs.readlinkSync(checkPath);
        } catch (readErr) {
          throw new Error(`Failed to read symbolic link at '${checkPath}': ${readErr.message}`);
        }

        const resolvedLinkTarget = path.isAbsolute(linkTarget)
          ? path.resolve(linkTarget)
          : path.resolve(path.dirname(checkPath), linkTarget);

        let targetExists = false;
        try {
          fs.statSync(resolvedLinkTarget);
          targetExists = true;
        } catch (_) {
          targetExists = false;
        }

        const remainingSegments = segments.slice(i + 1);
        const nextResolved = remainingSegments.length > 0
          ? path.resolve(resolvedLinkTarget, ...remainingSegments)
          : resolvedLinkTarget;

        if (!targetExists) {
          const err = new Error(
            `Security Exception: Dangling symbolic link detected at '${checkPath}' pointing to non-existent target '${resolvedLinkTarget}'`
          );
          err.code = 'EDANGLING_SYMLINK';
          err.danglingSource = checkPath;
          err.danglingTarget = nextResolved;
          throw err;
        }

        current = nextResolved;
        break;
      } else {
        accumulated = checkPath;
      }
    }

    if (!symlinkFound) break;
  }

  if (hops >= maxHops) {
    throw new Error('Security Exception: Too many symbolic link levels (circular symlink detected)');
  }

  if (fs.existsSync(current)) {
    try {
      current = fs.realpathSync.native ? fs.realpathSync.native(current) : fs.realpathSync(current);
    } catch (realErr) {
      throw new Error(`Canonical path resolution failed for '${current}': ${realErr.message}`);
    }
  }

  return current;
}

function restoreBackupToSandbox(backupFilePath, targetSandboxPath, options = {}) {
  if (!targetSandboxPath || typeof targetSandboxPath !== 'string') {
    return { ok: false, error: 'Target sandbox path must be a valid non-empty string.' };
  }

  let canonicalMaster;
  let canonicalTenantsDir;
  let canonicalDataDir;

  try {
    canonicalMaster = getCanonicalPath(MASTER_DB_PATH);
    canonicalTenantsDir = getCanonicalPath(TENANTS_DIR);
    canonicalDataDir = getCanonicalPath(DATA_DIR);
  } catch (initErr) {
    return { ok: false, error: 'Security Exception: Failed to resolve protected paths: ' + initErr.message };
  }

  function isProtectedPath(testPath) {
    if (!testPath || typeof testPath !== 'string') return false;
    const normP = testPath.toLowerCase();
    const normMaster = canonicalMaster.toLowerCase();
    const normTenants = canonicalTenantsDir.toLowerCase();
    const normData = canonicalDataDir.toLowerCase();

    if (normP === normMaster) return true;
    if (normP === normTenants || normP.startsWith(normTenants + path.sep.toLowerCase())) return true;
    if (normP.startsWith(normData + path.sep.toLowerCase())) {
      const base = path.basename(testPath).toLowerCase();
      if (base === 'master.sqlite' || base.startsWith('tenant_') || base.includes('master')) return true;
    }
    return false;
  }

  // 1. Validate canonical filesystem path and symbolic links BEFORE performing any file operations
  let canonicalTarget;
  try {
    canonicalTarget = getCanonicalPath(targetSandboxPath);
  } catch (canonErr) {
    if (canonErr.danglingTarget && isProtectedPath(canonErr.danglingTarget)) {
      return {
        ok: false,
        error: 'Security Exception: Cannot restore backup directly over active live database. Restore target must be an isolated sandbox directory.'
      };
    }
    return {
      ok: false,
      error: 'Security Exception: ' + canonErr.message
    };
  }

  if (isProtectedPath(canonicalTarget)) {
    return {
      ok: false,
      error: 'Security Exception: Cannot restore backup directly over active live database. Restore target must be an isolated sandbox directory.'
    };
  }

  // Ensure target destination is not a symbolic link itself (prevent symlink overwrite attacks)
  try {
    const lstat = fs.lstatSync(targetSandboxPath);
    if (lstat.isSymbolicLink()) {
      return {
        ok: false,
        error: 'Security Exception: Target sandbox path is a symbolic link. Target must be a regular file path.'
      };
    }
  } catch (lstatErr) {
    if (lstatErr.code !== 'ENOENT') {
      return { ok: false, error: 'Security Exception: Unable to inspect target path: ' + lstatErr.message };
    }
  }

  // 2. Validate backup file existence and integrity BEFORE modifying target file
  if (!fs.existsSync(backupFilePath)) {
    return { ok: false, error: 'Backup file not found.' };
  }

  const inspection = verifyAndInspectBackup(backupFilePath);
  if (!inspection.ok) {
    return { ok: false, error: 'Cannot restore corrupted backup: ' + inspection.integrity };
  }

  // 3. Perform sandbox restoration in isolated target using temporary file and atomic rename
  const targetDir = path.dirname(canonicalTarget);
  if (!fs.existsSync(targetDir)) {
    try {
      fs.mkdirSync(targetDir, { recursive: true });
    } catch (mkdirErr) {
      return { ok: false, error: 'Failed to create sandbox directory: ' + mkdirErr.message };
    }
  }

  const tempSandboxPath = path.join(
    targetDir,
    `.restore_tmp_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.sqlite`
  );

  let tempVerified = false;

  try {
    fs.copyFileSync(backupFilePath, tempSandboxPath);

    // Verify restored database can be opened and queried in temporary location
    const restoredDb = new DatabaseSync(tempSandboxPath);
    const tableCounts = {};
    for (const t of inspection.tables) {
      try {
        const c = restoredDb.prepare(`SELECT COUNT(*) as count FROM "${t}"`).get();
        tableCounts[t] = c.count;
      } catch (_) {}
    }
    restoredDb.close();
    tempVerified = true;

    // Optional test hook executed immediately before pre-replacement revalidation
    if (typeof options._beforeReplaceHook === 'function') {
      options._beforeReplaceHook();
    }

    // 4. TOCTOU Mitigation & Pre-Replacement Revalidation
    // Note on residual race conditions:
    // In cross-platform Node.js without native file-descriptor-bound atomic renames
    // (such as renameat2 with RENAME_NOREPLACE/O_NOFOLLOW), user-space path resolution
    // has a sub-millisecond gap between pre-replacement inspection and fs.renameSync().
    // We narrow this window by performing immediate lstat rechecks adjacent to the rename,
    // verifying that neither the destination nor its parent was swapped into a symlink/junction,
    // and taking a safety backup of existing data to guarantee rollback if rename fails.
    let revalTarget;
    try {
      revalTarget = getCanonicalPath(targetSandboxPath);
    } catch (revalErr) {
      // Revalidation failed (e.g. dangling symlink or unresolvable path introduced)
      return {
        ok: false,
        error: 'Security Exception: Pre-replacement destination revalidation failed: ' + revalErr.message,
        preservedTempPath: tempSandboxPath
      };
    }

    if (revalTarget.toLowerCase() !== canonicalTarget.toLowerCase() || isProtectedPath(revalTarget)) {
      return {
        ok: false,
        error: 'Security Exception: Destination path changed or was redirected to a protected location before replacement.',
        preservedTempPath: tempSandboxPath
      };
    }

    // Check if target path turned into a symbolic link
    try {
      const destLstat = fs.lstatSync(targetSandboxPath);
      if (destLstat.isSymbolicLink()) {
        return {
          ok: false,
          error: 'Security Exception: Target sandbox path was replaced with a symbolic link before replacement.',
          preservedTempPath: tempSandboxPath
        };
      }
    } catch (lsErr) {
      if (lsErr.code !== 'ENOENT') {
        return {
          ok: false,
          error: 'Security Exception: Unable to inspect target path before replacement: ' + lsErr.message,
          preservedTempPath: tempSandboxPath
        };
      }
    }

    // Check if parent directory was replaced with a symlink/junction to protected location
    try {
      const parentDir = path.dirname(targetSandboxPath);
      const parentLstat = fs.lstatSync(parentDir);
      if (parentLstat.isSymbolicLink()) {
        const canonicalParent = getCanonicalPath(parentDir);
        if (canonicalParent.toLowerCase() !== targetDir.toLowerCase() || isProtectedPath(canonicalParent)) {
          return {
            ok: false,
            error: 'Security Exception: Parent sandbox directory was replaced with a symbolic link pointing to protected location.',
            preservedTempPath: tempSandboxPath
          };
        }
      }
    } catch (pErr) {
      return {
        ok: false,
        error: 'Security Exception: Unable to inspect parent sandbox directory: ' + pErr.message,
        preservedTempPath: tempSandboxPath
      };
    }

    // 5. Safe platform-specific destination replacement strategy
    // If destination exists, snapshot it and verify backup hash before replacement
    const existingExisted = fs.existsSync(canonicalTarget);
    let existingBackupPath = null;
    let existingContentHash = null;

    if (existingExisted) {
      existingBackupPath = path.join(
        targetDir,
        `.target_bak_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.sqlite`
      );
      try {
        fs.copyFileSync(canonicalTarget, existingBackupPath);
        existingContentHash = crypto.createHash('sha256').update(fs.readFileSync(canonicalTarget)).digest('hex');
        const backupHash = crypto.createHash('sha256').update(fs.readFileSync(existingBackupPath)).digest('hex');
        if (backupHash !== existingContentHash) {
          throw new Error('Safety backup verification failed (SHA-256 hash mismatch)');
        }
      } catch (backupErr) {
        if (existingBackupPath && fs.existsSync(existingBackupPath)) {
          try { fs.unlinkSync(existingBackupPath); } catch (_) {}
        }
        return {
          ok: false,
          error: 'Failed to create verified safety backup of existing destination before replacement: ' + backupErr.message,
          preservedTempPath: tempSandboxPath,
          destinationPreserved: true,
          requiresManualRecovery: false
        };
      }
    }

    // Perform replacement using atomic rename
    try {
      if (options && options._testFailReplacement) {
        throw new Error('Injected failure during destination replacement');
      }

      fs.renameSync(tempSandboxPath, canonicalTarget);

      // Verify that canonicalTarget now exists
      if (!fs.existsSync(canonicalTarget)) {
        throw new Error('Target destination does not exist after renameSync');
      }

      // Replacement succeeded! Clean up existing file backup
      if (existingBackupPath && fs.existsSync(existingBackupPath)) {
        try {
          if (options && options._testFailBackupCleanup) {
            throw new Error('Injected failure during safety backup cleanup');
          }
          fs.unlinkSync(existingBackupPath);
        } catch (cleanupErr) {
          console.warn('[Sandbox Restore Notice]: Safety backup cleanup failed: ' + cleanupErr.message);
          return {
            ok: true,
            warning: 'Restore succeeded but safety backup cleanup failed: ' + cleanupErr.message,
            safetyBackupPath: existingBackupPath,
            targetSandboxPath: canonicalTarget,
            inspection,
            tableCounts
          };
        }
      }
    } catch (replaceErr) {
      // Safe replacement could not be completed.
      let destinationRestored = false;
      let destinationPreserved = false;
      let restorationError = null;

      if (existingExisted && existingBackupPath && fs.existsSync(existingBackupPath)) {
        try {
          if (options && options._testFailDestinationRestore) {
            throw new Error('Injected failure during destination restoration');
          }

          // Restore existing destination from safety backup
          fs.copyFileSync(existingBackupPath, canonicalTarget);

          // VERIFY restored content against original SHA-256 hash
          const restoredHash = crypto.createHash('sha256').update(fs.readFileSync(canonicalTarget)).digest('hex');
          if (restoredHash === existingContentHash) {
            destinationRestored = true;
            destinationPreserved = true;
          } else {
            throw new Error(`Restored destination hash mismatch (expected: ${existingContentHash}, got: ${restoredHash})`);
          }

          // Only delete safety backup if restoration was 100% verified!
          try {
            if (options && options._testFailBackupCleanup) {
              throw new Error('Injected failure during safety backup cleanup');
            }
            fs.unlinkSync(existingBackupPath);
          } catch (cleanErr) {
            console.warn('[Sandbox Restore Notice]: Safety backup cleanup failed after verified restoration: ' + cleanErr.message);
          }
        } catch (restoreErr) {
          destinationRestored = false;
          destinationPreserved = false;
          restorationError = restoreErr.message;
          console.error(`[CRITICAL SANDBOX RESTORE FAILURE]: Could not restore destination '${canonicalTarget}'. Safety backup preserved in: '${existingBackupPath}'. Error: ${restoreErr.message}`);
        }
      } else if (!existingExisted) {
        if (fs.existsSync(canonicalTarget)) {
          try { fs.unlinkSync(canonicalTarget); } catch (_) {}
        }
        destinationPreserved = true; // Destination state (non-existent) preserved
      }

      // If restoration failed, safety backup MUST be preserved on disk for manual recovery!
      const safetyBackupPreserved = existingBackupPath ? fs.existsSync(existingBackupPath) : false;
      const requiresManualRecovery = existingExisted && !destinationRestored;

      return {
        ok: false,
        error: requiresManualRecovery
          ? `CRITICAL: Destination replacement failed and restoration of the original file FAILED: ${restorationError || replaceErr.message}. Manual recovery required.`
          : `Safe replacement could not be guaranteed: ${replaceErr.message}`,
        destinationPreserved,
        destinationRestored,
        requiresManualRecovery,
        safetyBackupPath: safetyBackupPreserved ? existingBackupPath : null,
        preservedTempPath: tempSandboxPath,
        restorationError
      };
    }

    return {
      ok: true,
      message: 'Backup successfully restored and verified in sandbox environment.',
      targetSandboxPath: canonicalTarget,
      inspection,
      tableCounts
    };
  } catch (err) {
    // Only clean up tempSandboxPath if it was not verified or if it failed before the replacement step
    if (!tempVerified && fs.existsSync(tempSandboxPath)) {
      try { fs.unlinkSync(tempSandboxPath); } catch (_) {}
    }
    return {
      ok: false,
      error: 'Restore failed: ' + err.message,
      preservedTempPath: tempVerified ? tempSandboxPath : null
    };
  }
}

module.exports = {
  masterDb,
  hashPassword,
  verifyPassword,
  checkPasswordNeedsRehash,
  hashSessionToken,
  saveSession,
  getSession,
  deleteSession,
  cleanupExpiredSessions,
  checkRateLimit,
  resetRateLimit,
  cleanupRateLimits,
  getTenantDb,
  getTenantDbPath,
  tenantDbCache,
  getSetting,
  setSetting,
  setSettingsTransaction,
  restoreSettingsTransaction,
  logSystemError,
  getErrorLogs,
  clearErrorLogs,
  backupMasterDb,
  backupAllTenantDbs,
  listCloudBackups,
  verifyAndInspectBackup,
  restoreBackupToSandbox,
  getCanonicalPath
};
