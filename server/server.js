/**
 * ZynBill Multi-Tenant Cloud Ecosystem & Customer Management Server
 * Port: 4000 (configurable via PORT env var)
 * Zero external dependencies: uses Node 24 native http, crypto & sqlite!
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const crypto = require('node:crypto');

const { masterDb, hashPassword, verifyPassword, getTenantDb } = require('./db');
const smtp = require('./smtp');

const PORT = parseInt(process.env.PORT || '4000', 10);
const PUBLIC_DIR = path.join(__dirname, 'public');

// ── In-Memory Token Sessions ──────────────────────────────────────────
const adminSessions = new Map();

function generateToken(prefix = 'tok_') {
  return prefix + crypto.randomBytes(24).toString('hex');
}

// ── HTTP Helper Functions ─────────────────────────────────────────────
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function sendHtml(res, filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(content);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Page not found');
  }
}

async function parseJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk.toString()));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (_) {
        resolve({});
      }
    });
  });
}

function getBearerToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  return null;
}

// ── Request Handler ───────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname.replace(/\/$/, '') || '/';
  const query = parsedUrl.query;

  // ── Static Web Pages ──────────────────────────────────────────────
  if (req.method === 'GET') {
    if (pathname === '' || pathname === '/' || pathname === '/register') {
      return sendHtml(res, path.join(PUBLIC_DIR, 'register.html'));
    }
    if (pathname === '/admin') {
      return sendHtml(res, path.join(PUBLIC_DIR, 'admin.html'));
    }
  }

  // ── Health Check ──────────────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/api/v1/system/health') {
    const customerCount = masterDb.prepare('SELECT COUNT(*) as count FROM customers').get().count;
    return sendJson(res, 200, {
      ok: true,
      service: 'ZynBill Cloud Ecosystem',
      version: '1.1.0',
      status: 'operational',
      registeredCustomers: customerCount,
      timestamp: new Date().toISOString()
    });
  }

  // ── Auth & Registration Endpoints ─────────────────────────────────

  // 1. Customer Registration (Step 1)
  if (req.method === 'POST' && pathname === '/api/v1/auth/register') {
    const body = await parseJsonBody(req);
    const { companyName, ownerName, email, phone, state, gstin, password } = body;

    if (!companyName || !ownerName || !email || !password) {
      return sendJson(res, 400, { ok: false, error: 'Company Name, Owner Name, Email, and Password are required.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const existing = masterDb.prepare('SELECT id, status FROM customers WHERE email = ?').get(cleanEmail);

    if (existing) {
      if (existing.status === 'pending_approval') {
        return sendJson(res, 400, { ok: false, error: 'An account with this email is already registered and awaiting Super Admin review.' });
      } else if (existing.status === 'active') {
        return sendJson(res, 400, { ok: false, error: 'An active account already exists with this email. Please log in on the Windows app.' });
      }
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpId = 'otp_' + crypto.randomBytes(8).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    // Save or replace OTP
    masterDb.prepare('DELETE FROM otps WHERE email = ? AND purpose = ?').run(cleanEmail, 'registration');
    masterDb.prepare(`
      INSERT INTO otps (id, email, code, purpose, expires_at, verified, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `).run(otpId, cleanEmail, otp, 'registration', expiresAt, new Date().toISOString());

    // Hash Password
    const { hash, salt } = hashPassword(password);
    const customerId = existing ? existing.id : 'cust_' + crypto.randomBytes(8).toString('hex');
    const now = new Date().toISOString();

    if (existing) {
      masterDb.prepare(`
        UPDATE customers SET
          company_name = ?, owner_name = ?, phone = ?, state = ?, gstin = ?,
          password_hash = ?, password_salt = ?, status = 'pending_verification', updated_at = ?
        WHERE id = ?
      `).run(companyName, ownerName, phone || '', state || 'Kerala', gstin || '', hash, salt, now, customerId);
    } else {
      masterDb.prepare(`
        INSERT INTO customers (
          id, company_name, owner_name, email, phone, state, gstin,
          password_hash, password_salt, status, plan, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_verification', 'Professional', ?, ?)
      `).run(customerId, companyName, ownerName, cleanEmail, phone || '', state || 'Kerala', gstin || '', hash, salt, now, now);
    }

    // Send OTP via SMTP
    await smtp.sendOtpEmail(cleanEmail, otp, companyName);

    return sendJson(res, 200, {
      ok: true,
      message: 'Verification OTP sent to your registered email.',
      email: cleanEmail,
      customerId,
      // In dev/simulated environments, expose code for easy manual or automated test entry
      devOtp: process.env.NODE_ENV === 'production' ? undefined : otp
    });
  }

  // 2. OTP Verification (Step 2)
  if (req.method === 'POST' && pathname === '/api/v1/auth/verify-otp') {
    const body = await parseJsonBody(req);
    const { email, otp } = body;

    if (!email || !otp) {
      return sendJson(res, 400, { ok: false, error: 'Email and OTP are required.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanOtp = String(otp).trim();

    const otpRecord = masterDb.prepare(`
      SELECT * FROM otps
      WHERE email = ? AND purpose = 'registration' AND verified = 0
      ORDER BY created_at DESC LIMIT 1
    `).get(cleanEmail);

    if (!otpRecord) {
      return sendJson(res, 400, { ok: false, error: 'No pending verification OTP found for this email.' });
    }

    if (new Date(otpRecord.expires_at).getTime() < Date.now()) {
      return sendJson(res, 400, { ok: false, error: 'The verification code has expired. Please request a new code.' });
    }

    if (otpRecord.code !== cleanOtp) {
      return sendJson(res, 400, { ok: false, error: 'Incorrect verification code. Please check and try again.' });
    }

    // Mark OTP as verified
    masterDb.prepare('UPDATE otps SET verified = 1 WHERE id = ?').run(otpRecord.id);

    // Update customer status to pending_approval
    masterDb.prepare(`
      UPDATE customers SET status = 'pending_approval', updated_at = ? WHERE email = ?
    `).run(new Date().toISOString(), cleanEmail);

    return sendJson(res, 200, {
      ok: true,
      message: 'Email successfully verified! Your registration has been submitted for Super Admin approval.',
      status: 'pending_approval'
    });
  }

  // 3. Customer Status Check (Public Tracker)
  if (req.method === 'GET' && pathname === '/api/v1/auth/status') {
    const cleanEmail = String(query.email || '').trim().toLowerCase();
    if (!cleanEmail) {
      return sendJson(res, 400, { ok: false, error: 'Email parameter is required.' });
    }

    const customer = masterDb.prepare(`
      SELECT id, company_name, owner_name, email, status, plan, valid_until, created_at, approved_at, rejection_reason
      FROM customers WHERE email = ?
    `).get(cleanEmail);

    if (!customer) {
      return sendJson(res, 404, { ok: false, error: 'No account found with this email address.' });
    }

    return sendJson(res, 200, { ok: true, customer });
  }

  // 4. Desktop Online Activation & Login
  if (req.method === 'POST' && pathname === '/api/v1/auth/desktop-activate') {
    const body = await parseJsonBody(req);
    const { email, password, machineName } = body;

    if (!email || !password) {
      return sendJson(res, 400, { ok: false, error: 'Email and password are required.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const customer = masterDb.prepare(`
      SELECT * FROM customers WHERE email = ?
    `).get(cleanEmail);

    if (!customer) {
      return sendJson(res, 401, { ok: false, error: 'Account not found. Please register on the web portal first.' });
    }

    const isValidPassword = verifyPassword(password, customer.password_hash, customer.password_salt);
    if (!isValidPassword) {
      return sendJson(res, 401, { ok: false, error: 'Invalid password. Please verify your credentials.' });
    }

    // Check Approval Status
    if (customer.status === 'pending_approval' || customer.status === 'pending_verification') {
      return sendJson(res, 403, {
        ok: false,
        status: customer.status,
        error: 'Your account is pending Super Admin review and approval. You will receive an email once approved.'
      });
    }

    if (customer.status === 'rejected') {
      return sendJson(res, 403, {
        ok: false,
        status: 'rejected',
        error: `Your account request was rejected. Reason: ${customer.rejection_reason || 'Policy requirements not met.'}`
      });
    }

    if (customer.status === 'suspended') {
      return sendJson(res, 403, {
        ok: false,
        status: 'suspended',
        error: 'This account has been suspended by the Super Admin. Please contact support.'
      });
    }

    // Check validity date & grace period
    const now = Date.now();
    const expiry = customer.valid_until ? new Date(customer.valid_until).getTime() : now + 365 * 86400000;
    const graceMs = 14 * 24 * 60 * 60 * 1000;

    if (now > expiry + graceMs) {
      return sendJson(res, 403, {
        ok: false,
        status: 'expired',
        error: 'Your subscription license and 14-day offline grace period have expired. Please renew your plan.'
      });
    }

    // Generate Device Token
    const token = generateToken('zyndev_');
    const nowIso = new Date().toISOString();

    masterDb.prepare(`
      INSERT INTO device_tokens (token, customer_id, machine_name, created_at, last_active_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(token, customer.id, machineName || 'Windows Desktop', nowIso, nowIso);

    // Initialize tenant database if not already
    getTenantDb(customer.id);

    return sendJson(res, 200, {
      ok: true,
      token,
      customer: {
        id: customer.id,
        companyName: customer.company_name,
        ownerName: customer.owner_name,
        email: customer.email,
        plan: customer.plan,
        status: customer.status,
        validUntil: customer.valid_until,
        gracePeriodDays: 14,
        inGracePeriod: now > expiry
      }
    });
  }

  // 5. Desktop Validate License
  if (req.method === 'GET' && pathname === '/api/v1/auth/validate-license') {
    const token = getBearerToken(req);
    if (!token) return sendJson(res, 401, { ok: false, error: 'Missing authorization token.' });

    const device = masterDb.prepare('SELECT customer_id FROM device_tokens WHERE token = ?').get(token);
    if (!device) return sendJson(res, 401, { ok: false, error: 'Invalid or revoked device token.' });

    const customer = masterDb.prepare(`
      SELECT id, company_name, email, plan, status, valid_until FROM customers WHERE id = ?
    `).get(device.customer_id);

    if (!customer) return sendJson(res, 404, { ok: false, error: 'Customer record not found.' });

    const now = Date.now();
    const expiry = customer.valid_until ? new Date(customer.valid_until).getTime() : now + 365 * 86400000;

    return sendJson(res, 200, {
      ok: true,
      license: {
        activated: true,
        companyId: customer.id,
        companyName: customer.company_name,
        email: customer.email,
        plan: customer.plan,
        validUntil: customer.valid_until,
        status: customer.status,
        gracePeriodDays: 14,
        isOverdue: now > expiry,
        inGracePeriod: now > expiry && now <= (expiry + 14 * 86400000)
      }
    });
  }

  // ── Super Admin Endpoints ─────────────────────────────────────────

  // Admin Login
  if (req.method === 'POST' && pathname === '/api/v1/admin/login') {
    const body = await parseJsonBody(req);
    const { email, password } = body;

    const admin = masterDb.prepare('SELECT * FROM admins WHERE email = ?').get(String(email).trim().toLowerCase());
    if (!admin || !verifyPassword(password, admin.password_hash, admin.password_salt)) {
      return sendJson(res, 401, { ok: false, error: 'Invalid admin credentials.' });
    }

    const sessionToken = generateToken('adm_');
    adminSessions.set(sessionToken, { id: admin.id, email: admin.email, name: admin.name });

    return sendJson(res, 200, {
      ok: true,
      token: sessionToken,
      admin: { id: admin.id, email: admin.email, name: admin.name }
    });
  }

  // Admin Check Session
  function verifyAdmin(req, res) {
    const token = getBearerToken(req);
    if (!token || !adminSessions.has(token)) {
      sendJson(res, 401, { ok: false, error: 'Unauthorized Super Admin access.' });
      return null;
    }
    return adminSessions.get(token);
  }

  // List Customers with Filter & Stats
  if (req.method === 'GET' && pathname === '/api/v1/admin/customers') {
    if (!verifyAdmin(req, res)) return;

    const statusFilter = query.status || '';
    let sql = `
      SELECT id, company_name, owner_name, email, phone, state, gstin, status, plan, valid_until, rejection_reason, created_at, approved_at
      FROM customers
    `;
    const params = [];

    if (statusFilter && statusFilter !== 'all') {
      sql += ' WHERE status = ?';
      params.push(statusFilter);
    }
    sql += ' ORDER BY created_at DESC';

    const customers = masterDb.prepare(sql).all(...params);

    // Compute Summary Stats
    const stats = {
      total: masterDb.prepare('SELECT COUNT(*) as c FROM customers').get().c,
      pending: masterDb.prepare("SELECT COUNT(*) as c FROM customers WHERE status = 'pending_approval'").get().c,
      active: masterDb.prepare("SELECT COUNT(*) as c FROM customers WHERE status = 'active'").get().c,
      suspended: masterDb.prepare("SELECT COUNT(*) as c FROM customers WHERE status = 'suspended'").get().c,
      rejected: masterDb.prepare("SELECT COUNT(*) as c FROM customers WHERE status = 'rejected'").get().c
    };

    return sendJson(res, 200, { ok: true, stats, customers });
  }

  // Approve Customer Account & Assign Plan + Validity
  const approveMatch = pathname.match(/^\/api\/v1\/admin\/customers\/([^\/]+)\/approve$/);
  if (req.method === 'POST' && approveMatch) {
    if (!verifyAdmin(req, res)) return;
    const customerId = approveMatch[1];
    const body = await parseJsonBody(req);
    const { plan, durationDays, customDate } = body;

    const customer = masterDb.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
    if (!customer) return sendJson(res, 404, { ok: false, error: 'Customer not found.' });

    const selectedPlan = plan || customer.plan || 'Professional';
    let validUntilDate;

    if (customDate) {
      validUntilDate = new Date(customDate).toISOString();
    } else {
      const days = parseInt(durationDays || '365', 10);
      validUntilDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    }

    const now = new Date().toISOString();
    masterDb.prepare(`
      UPDATE customers SET
        status = 'active',
        plan = ?,
        valid_until = ?,
        approved_at = ?,
        rejection_reason = NULL,
        updated_at = ?
      WHERE id = ?
    `).run(selectedPlan, validUntilDate, now, now, customerId);

    // Provision isolated tenant database
    getTenantDb(customerId);

    // Send Approval Email Notification via SMTP
    await smtp.sendApprovalEmail(customer.email, customer.company_name, selectedPlan, validUntilDate);

    return sendJson(res, 200, {
      ok: true,
      message: `Account approved and activated under ${selectedPlan} plan.`,
      customer: { id: customerId, status: 'active', plan: selectedPlan, validUntil: validUntilDate }
    });
  }

  // Reject Customer Account
  const rejectMatch = pathname.match(/^\/api\/v1\/admin\/customers\/([^\/]+)\/reject$/);
  if (req.method === 'POST' && rejectMatch) {
    if (!verifyAdmin(req, res)) return;
    const customerId = rejectMatch[1];
    const body = await parseJsonBody(req);
    const reason = body.reason || 'Verification criteria not met';

    const customer = masterDb.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
    if (!customer) return sendJson(res, 404, { ok: false, error: 'Customer not found.' });

    const now = new Date().toISOString();
    masterDb.prepare(`
      UPDATE customers SET
        status = 'rejected',
        rejection_reason = ?,
        updated_at = ?
      WHERE id = ?
    `).run(reason, now, customerId);

    // Send Rejection Email
    await smtp.sendRejectionEmail(customer.email, customer.company_name, reason);

    return sendJson(res, 200, { ok: true, message: 'Account registration rejected.', customerId });
  }

  // Toggle Customer Status (Active <-> Suspended)
  const statusMatch = pathname.match(/^\/api\/v1\/admin\/customers\/([^\/]+)\/status$/);
  if (req.method === 'POST' && statusMatch) {
    if (!verifyAdmin(req, res)) return;
    const customerId = statusMatch[1];
    const body = await parseJsonBody(req);
    const newStatus = body.status;

    if (!['active', 'suspended'].includes(newStatus)) {
      return sendJson(res, 400, { ok: false, error: 'Status must be active or suspended.' });
    }

    masterDb.prepare(`
      UPDATE customers SET status = ?, updated_at = ? WHERE id = ?
    `).run(newStatus, new Date().toISOString(), customerId);

    return sendJson(res, 200, { ok: true, message: `Status updated to ${newStatus}.`, customerId, status: newStatus });
  }

  // Update Plan and Expiration
  const planMatch = pathname.match(/^\/api\/v1\/admin\/customers\/([^\/]+)\/plan$/);
  if (req.method === 'POST' && planMatch) {
    if (!verifyAdmin(req, res)) return;
    const customerId = planMatch[1];
    const body = await parseJsonBody(req);
    const { plan, validUntil } = body;

    masterDb.prepare(`
      UPDATE customers SET plan = COALESCE(?, plan), valid_until = COALESCE(?, valid_until), updated_at = ? WHERE id = ?
    `).run(plan, validUntil, new Date().toISOString(), customerId);

    return sendJson(res, 200, { ok: true, message: 'Subscription updated successfully.', customerId });
  }

  // ── Multi-Tenant Cloud Synchronization Endpoints ──────────────────

  // Push Changes from Desktop Client to Cloud Tenant Database
  if (req.method === 'POST' && pathname === '/api/v1/sync/push') {
    const token = getBearerToken(req);
    if (!token) return sendJson(res, 401, { ok: false, error: 'Missing device token.' });

    const device = masterDb.prepare('SELECT customer_id FROM device_tokens WHERE token = ?').get(token);
    if (!device) return sendJson(res, 401, { ok: false, error: 'Unauthorized device token.' });

    const customer = masterDb.prepare('SELECT id, status FROM customers WHERE id = ?').get(device.customer_id);
    if (!customer || customer.status !== 'active') {
      return sendJson(res, 403, { ok: false, error: 'Account is not in active status.' });
    }

    const body = await parseJsonBody(req);
    const events = Array.isArray(body.events) ? body.events : [];
    const tenantDb = getTenantDb(customer.id);

    const acknowledgedIds = [];
    const nowIso = new Date().toISOString();

    for (const ev of events) {
      const eventId = ev.id || generateToken('ev_');
      const idemKey = ev.idempotency_key || eventId;

      try {
        // Record sync event with idempotency check
        tenantDb.prepare(`
          INSERT INTO sync_events (id, entity_type, entity_id, operation, payload, idempotency_key, client_timestamp, server_timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(idempotency_key) DO NOTHING
        `).run(
          eventId,
          ev.entity_type || 'generic',
          ev.entity_id || '0',
          ev.operation || 'upsert',
          JSON.stringify(ev.payload || {}),
          idemKey,
          ev.client_timestamp || nowIso,
          nowIso
        );

        // Apply entity update to isolated tenant database tables if applicable
        if (ev.entity_type === 'parties' && ev.payload) {
          const p = ev.payload;
          tenantDb.prepare(`
            INSERT INTO parties (id, name, phone, email, party_type, gstin, state, balance, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              phone = excluded.phone,
              email = excluded.email,
              balance = excluded.balance,
              updated_at = excluded.updated_at
          `).run(p.id, p.name || 'Unnamed', p.phone || '', p.email || '', p.party_type || 'Customer', p.gstin || '', p.state || '', p.balance || 0, nowIso);
        } else if (ev.entity_type === 'items' && ev.payload) {
          const item = ev.payload;
          tenantDb.prepare(`
            INSERT INTO items (id, name, sku, category, sale_price, purchase_price, tax_rate, stock_qty, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              sale_price = excluded.sale_price,
              purchase_price = excluded.purchase_price,
              stock_qty = excluded.stock_qty,
              updated_at = excluded.updated_at
          `).run(item.id, item.name || 'Item', item.sku || '', item.category || '', item.sale_price || 0, item.purchase_price || 0, item.tax_rate || 0, item.stock_qty || 0, nowIso);
        }

        acknowledgedIds.push(ev.id);
      } catch (err) {
        console.warn('[SyncPush] Event skipped or already applied:', err.message);
        acknowledgedIds.push(ev.id); // Idempotent acknowledgment
      }
    }

    // Record sync audit
    masterDb.prepare(`
      INSERT INTO sync_audit (id, customer_id, batch_size, synced_at)
      VALUES (?, ?, ?, ?)
    `).run(generateToken('aud_'), customer.id, acknowledgedIds.length, nowIso);

    // Update device last active
    masterDb.prepare('UPDATE device_tokens SET last_active_at = ? WHERE token = ?').run(nowIso, token);

    return sendJson(res, 200, {
      ok: true,
      processedCount: acknowledgedIds.length,
      acknowledgedIds,
      serverTimestamp: nowIso
    });
  }

  // Pull Changes from Cloud Tenant Database
  if (req.method === 'GET' && pathname === '/api/v1/sync/pull') {
    const token = getBearerToken(req);
    if (!token) return sendJson(res, 401, { ok: false, error: 'Missing device token.' });

    const device = masterDb.prepare('SELECT customer_id FROM device_tokens WHERE token = ?').get(token);
    if (!device) return sendJson(res, 401, { ok: false, error: 'Unauthorized device token.' });

    const tenantDb = getTenantDb(device.customer_id);
    const sinceTimestamp = query.since || '1970-01-01T00:00:00.000Z';

    const events = tenantDb.prepare(`
      SELECT * FROM sync_events WHERE server_timestamp > ? ORDER BY server_timestamp ASC LIMIT 500
    `).all(sinceTimestamp);

    return sendJson(res, 200, {
      ok: true,
      events,
      cursor: events.length > 0 ? events[events.length - 1].server_timestamp : sinceTimestamp
    });
  }

  // Fallthrough 404
  return sendJson(res, 404, { ok: false, error: `Route not found: ${req.method} ${pathname}` });
});

// Start Server
if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`🚀 ZynBill Cloud Ecosystem Server running on http://localhost:${PORT}`);
    console.log(`📋 Customer Registration Portal: http://localhost:${PORT}/register`);
    console.log(`👑 Super Admin Dashboard:        http://localhost:${PORT}/admin`);
    console.log(`⚡ Sync & Auth REST Endpoints:    http://localhost:${PORT}/api/v1/`);
    console.log(`======================================================\n`);
  });
}

module.exports = { server, PORT };
