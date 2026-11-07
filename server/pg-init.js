/**
 * ZynBill Cloud PostgreSQL Database Initialization & Health Check Script
 * Reads credentials from .env and sets up production PostgreSQL tables,
 * indexes, subscription plans, and Super Admin user.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client, Pool } = require('pg');

// 1. Load .env
function loadEnv() {
  const envCandidates = [
    path.join(__dirname, '.env'),
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), 'server', '.env')
  ];
  for (const p of envCandidates) {
    if (fs.existsSync(p)) {
      const lines = fs.readFileSync(p, 'utf8').split('\n');
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
          if (!process.env[key]) process.env[key] = val;
        }
      }
    }
  }
}
loadEnv();

const config = {
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '',
  database: process.env.PG_DATABASE || 'zynbill_cloud',
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false
};

console.log('\n======================================================');
console.log('🐘 ZynBill Cloud PostgreSQL Initialization');
console.log('======================================================');
console.log(`Host:     ${config.host}:${config.port}`);
console.log(`User:     ${config.user}`);
console.log(`Database: ${config.database}`);
console.log('Connecting to PostgreSQL...\n');

async function initializePostgres() {
  // Step A: Connect to default postgres DB to check/create target database
  const maintenanceClient = new Client({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: 'postgres',
    ssl: config.ssl
  });

  try {
    await maintenanceClient.connect();
    console.log('✓ Successfully connected to PostgreSQL server.');

    const checkDb = await maintenanceClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [config.database]
    );

    if (checkDb.rowCount === 0) {
      console.log(`Creating database "${config.database}"...`);
      await maintenanceClient.query(`CREATE DATABASE "${config.database}"`);
      console.log(`✓ Database "${config.database}" created.`);
    } else {
      console.log(`✓ Database "${config.database}" already exists.`);
    }
  } catch (err) {
    console.error('⚠️ Could not connect to default maintenance database:', err.message);
    console.log('Attempting direct connection to target database...');
  } finally {
    try { await maintenanceClient.end(); } catch (_) {}
  }

  // Step B: Connect to target database
  const targetPool = new Pool(config);
  try {
    const client = await targetPool.connect();
    console.log(`✓ Connected to target database "${config.database}". Setting up tables...`);

    // 1. Customers Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id VARCHAR(64) PRIMARY KEY,
        company_name VARCHAR(255) NOT NULL,
        owner_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(50),
        state VARCHAR(100),
        gstin VARCHAR(50),
        password_hash VARCHAR(255) NOT NULL,
        password_salt VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending_verification',
        plan VARCHAR(50) NOT NULL DEFAULT 'Professional',
        valid_until TIMESTAMP WITH TIME ZONE,
        rejection_reason TEXT,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        approved_at TIMESTAMP WITH TIME ZONE,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Admins Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id VARCHAR(64) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        password_salt VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);

    // 3. Plans Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS plans (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        code VARCHAR(50) UNIQUE NOT NULL,
        description TEXT,
        price NUMERIC(12,2) NOT NULL DEFAULT 0,
        billing_cycle VARCHAR(50) NOT NULL DEFAULT 'yearly',
        duration_days INT NOT NULL DEFAULT 365,
        max_devices INT NOT NULL DEFAULT 1,
        features JSONB NOT NULL DEFAULT '[]'::jsonb,
        is_active INT NOT NULL DEFAULT 1,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);

    // 4. Device Tokens Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS device_tokens (
        token VARCHAR(128) PRIMARY KEY,
        customer_id VARCHAR(64) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        machine_name VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        last_active_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);

    // 5. OTPs Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS otps (
        id VARCHAR(64) PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        code VARCHAR(20) NOT NULL,
        purpose VARCHAR(50) NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        verified INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);

    // 6. System Settings Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);

    // 7. Sync Events Table (for multi-device cloud sync)
    await client.query(`
      CREATE TABLE IF NOT EXISTS sync_events (
        id VARCHAR(128) PRIMARY KEY,
        customer_id VARCHAR(64) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        entity_type VARCHAR(100) NOT NULL,
        entity_id VARCHAR(128) NOT NULL,
        operation VARCHAR(50) NOT NULL DEFAULT 'upsert',
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        idempotency_key VARCHAR(128) UNIQUE,
        client_timestamp TIMESTAMP WITH TIME ZONE,
        server_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_sync_events_server_time ON sync_events (customer_id, server_timestamp);
    `);

    // 8. Sync Audit Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sync_audit (
        id VARCHAR(128) PRIMARY KEY,
        customer_id VARCHAR(64) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        batch_size INT NOT NULL DEFAULT 0,
        synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);

    console.log('✓ All 8 core PostgreSQL tables created/verified successfully.');

    // Seed default subscription plans
    const planCheck = await client.query('SELECT COUNT(*) as c FROM plans');
    if (parseInt(planCheck.rows[0].c, 10) === 0) {
      const plans = [
        {
          id: 'plan_starter',
          name: 'Starter Plan',
          code: 'starter',
          description: 'Single-Terminal Desktop Billing for Small Retailers',
          price: 2999,
          billing_cycle: 'yearly',
          duration_days: 365,
          max_devices: 1,
          features: JSON.stringify(['1 Windows PC', 'GST Invoicing', 'Stock Ledger', 'WhatsApp Sharing', 'Thermal Print'])
        },
        {
          id: 'plan_professional',
          name: 'Professional Plan',
          code: 'professional',
          description: 'Multi-Terminal Store System with Real-Time Cloud Sync',
          price: 5999,
          billing_cycle: 'yearly',
          duration_days: 365,
          max_devices: 3,
          features: JSON.stringify(['Up to 3 Windows PCs', 'Real-time Cloud Sync', 'Customer Web Portal', 'Barcode Scanning', 'Automated Daily Backups'])
        },
        {
          id: 'plan_enterprise',
          name: 'Enterprise Plan',
          code: 'enterprise',
          description: 'Unlimited Terminals, Custom Tax Logic & Multi-Branch Support',
          price: 9999,
          billing_cycle: 'yearly',
          duration_days: 365,
          max_devices: 10,
          features: JSON.stringify(['Up to 10 Terminals', 'Priority Cloud Sync', 'Unlimited Multi-User Roles', 'Full Audit Trail', 'Dedicated Support'])
        }
      ];

      for (const p of plans) {
        await client.query(`
          INSERT INTO plans (id, name, code, description, price, billing_cycle, duration_days, max_devices, features, is_active)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1)
        `, [p.id, p.name, p.code, p.description, p.price, p.billing_cycle, p.duration_days, p.max_devices, p.features]);
      }
      console.log('✓ Seeded Starter, Professional, and Enterprise plans into PostgreSQL.');
    }

    // Seed Super Admin from .env credentials
    const adminEmail = String(process.env.SUPER_ADMIN_EMAIL || 'admin@yourdomain.in').trim().toLowerCase();
    const adminPass = String(process.env.SUPER_ADMIN_PASSWORD || 'Admin@123456');
    const adminName = String(process.env.SUPER_ADMIN_NAME || 'Super Administrator');

    const adminCheck = await client.query('SELECT id FROM admins WHERE email = $1', [adminEmail]);
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(adminPass, salt, 1000, 32, 'sha256').toString('hex');

    if (adminCheck.rowCount === 0) {
      await client.query(`
        INSERT INTO admins (id, email, password_hash, password_salt, name)
        VALUES ($1, $2, $3, $4, $5)
      `, ['admin_master', adminEmail, hash, salt, adminName]);
      console.log(`✓ Seeded Super Admin (${adminEmail}) into PostgreSQL.`);
    } else {
      await client.query(`
        UPDATE admins SET password_hash = $1, password_salt = $2, name = $3 WHERE email = $4
      `, [hash, salt, adminName, adminEmail]);
      console.log(`✓ Synchronized Super Admin (${adminEmail}) credentials in PostgreSQL.`);
    }

    client.release();
    console.log('\n======================================================');
    console.log('🎉 PostgreSQL Database is 100% Configured & Ready!');
    console.log('To run server in PostgreSQL mode, set DB_TYPE=postgres in .env');
    console.log('======================================================\n');
  } catch (err) {
    console.error('\n❌ PostgreSQL Setup Error:', err.message);
    console.log('\nPlease check your PG_USER, PG_PASSWORD, PG_HOST, and PG_PORT in server/.env\n');
  } finally {
    await targetPool.end();
  }
}

initializePostgres();
