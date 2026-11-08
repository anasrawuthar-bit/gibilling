/**
 * ZynBill Multi-Tenant Cloud Ecosystem & Customer Management Server
 * Port: 4000 (configurable via PORT env var)
 * Zero external dependencies: uses Node native http, crypto & sqlite!
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const crypto = require('node:crypto');

const {
  masterDb,
  hashPassword,
  verifyPassword,
  getTenantDb,
  getSetting,
  setSetting,
  logSystemError,
  getErrorLogs,
  clearErrorLogs
} = require('./db');
const smtp = require('./smtp');

const PORT = parseInt(process.env.PORT || '4000', 10);
const PUBLIC_DIR = path.join(__dirname, 'public');

// ── In-Memory Token Sessions ──────────────────────────────────────────
const adminSessions = new Map();
const customerSessions = new Map();

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

async function parseJsonBody(req, maxBytes = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    let bytes = 0;
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        req.destroy();
        return reject(new Error('Request payload exceeded maximum size limit (10MB).'));
      }
      body += chunk.toString();
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Malformed JSON body: ' + err.message));
      }
    });
    req.on('error', (err) => {
      reject(err);
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
  try {
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
    if (pathname === '' || pathname === '/' || pathname === '/home') {
      return sendHtml(res, path.join(PUBLIC_DIR, 'landing.html'));
    }
    if (pathname === '/register' || pathname === '/signup') {
      return sendHtml(res, path.join(PUBLIC_DIR, 'register.html'));
    }
    if (pathname === '/admin') {
      return sendHtml(res, path.join(PUBLIC_DIR, 'admin.html'));
    }
    if (pathname === '/portal' || pathname === '/user' || pathname === '/login') {
      return sendHtml(res, path.join(PUBLIC_DIR, 'portal.html'));
    }
  }

  // ── Electron autoUpdater standard manifest (latest.yml) ────────────
  if (req.method === 'GET' && (pathname === '/latest.yml' || pathname === '/downloads/latest.yml' || pathname === '/api/v1/downloads/latest.yml')) {
    const ymlPath = path.join(__dirname, 'public', 'downloads', 'latest.yml');
    if (fs.existsSync(ymlPath)) {
      res.writeHead(200, {
        'Content-Type': 'text/yaml; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      return fs.createReadStream(ymlPath).pipe(res);
    }
  }

  // ── Application Installer Download ─────────────────────────────────
  if ((req.method === 'GET' || req.method === 'HEAD') && (pathname === '/api/v1/download/app' || pathname === '/download' || pathname.startsWith('/downloads/'))) {
    const downloadsDir = path.join(__dirname, 'public', 'downloads');
    let targetFile = null;

    if (fs.existsSync(downloadsDir)) {
      const files = fs.readdirSync(downloadsDir)
        .filter(f => f.endsWith('.exe'))
        .map(f => ({ name: f, time: fs.statSync(path.join(downloadsDir, f)).mtimeMs }))
        .sort((a, b) => b.time - a.time);
      if (files.length > 0) {
        targetFile = path.join(downloadsDir, files[0].name);
      }
    }

    if (!targetFile) {
      const candidates = [
        path.join(__dirname, '..', 'dist', 'ZynBill Setup 1.1.1.exe'),
        path.join(__dirname, '..', 'dist', 'ZynBill Setup 1.1.0.exe'),
        path.join(__dirname, '..', 'dist', 'GI Billing Setup 1.1.0.exe'),
        path.join(__dirname, '..', 'dist', 'win-unpacked', 'ZynBill.exe')
      ];
      targetFile = candidates.find(p => fs.existsSync(p));
    }

    if (targetFile) {
      const filename = path.basename(targetFile);
      let stat;
      try {
        stat = fs.statSync(targetFile);
      } catch (statErr) {
        return sendJson(res, 500, { ok: false, error: 'Could not access setup file: ' + statErr.message });
      }

      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Access-Control-Allow-Origin': '*'
      });
      if (req.method === 'HEAD') return res.end();

      const readStream = fs.createReadStream(targetFile);
      readStream.on('error', (streamErr) => {
        console.error('[Download Stream Error]:', streamErr);
        if (!res.headersSent) {
          sendJson(res, 500, { ok: false, error: 'Streaming error occurred.' });
        } else {
          res.destroy();
        }
      });
      req.on('close', () => {
        readStream.destroy();
      });
      return readStream.pipe(res);
    } else {
      return sendJson(res, 404, {
        ok: false,
        error: 'Windows setup installer not found. Please build the distribution package.'
      });
    }
  }

  // ── App Update Check Endpoint ──────────────────────────────────────
  if (req.method === 'GET' && (pathname === '/api/v1/updates/check' || pathname === '/api/v1/app/version')) {
    const downloadsDir = path.join(__dirname, 'public', 'downloads');
    let latestVersion = '1.1.1';
    let fileName = 'ZynBill Setup 1.1.1.exe';

    if (fs.existsSync(downloadsDir)) {
      const files = fs.readdirSync(downloadsDir)
        .filter(f => f.endsWith('.exe'))
        .map(f => {
          const match = f.match(/(\d+\.\d+\.\d+)/);
          return { name: f, version: match ? match[1] : '1.1.1', time: fs.statSync(path.join(downloadsDir, f)).mtimeMs };
        })
        .sort((a, b) => b.time - a.time);
      if (files.length > 0) {
        latestVersion = files[0].version;
        fileName = files[0].name;
      }
    }

    return sendJson(res, 200, {
      ok: true,
      latestVersion,
      fileName,
      downloadUrl: '/api/v1/download/app',
      releaseNotes: 'Includes Item Creation fixes, Payment deletion with required audit reasoning, Automatic Cloud Sync, and Hostinger SSL Mail connectivity.',
      publishedAt: new Date().toISOString()
    });
  }

  // ── Health Check ──────────────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/api/v1/system/health') {
    const customerCount = masterDb.prepare('SELECT COUNT(*) as count FROM customers').get().count;
    const planCount = masterDb.prepare('SELECT COUNT(*) as count FROM plans').get().count;
    return sendJson(res, 200, {
      ok: true,
      service: 'ZynBill Cloud Ecosystem',
      version: '1.1.0',
      status: 'operational',
      registeredCustomers: customerCount,
      activePlans: planCount,
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
        return sendJson(res, 400, { ok: false, error: 'An active account already exists with this email. Please log in on the Windows app or User Portal.' });
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

  // 4. Desktop Step 1: Initiate Login & Send One-Time Device Code for First PC Login
  if (req.method === 'POST' && pathname === '/api/v1/auth/desktop-initiate-login') {
    const body = await parseJsonBody(req);
    const { email, password, machineName } = body;

    if (!email || !password) {
      return sendJson(res, 400, { ok: false, error: 'Email and password are required.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const customer = masterDb.prepare('SELECT * FROM customers WHERE email = ?').get(cleanEmail);

    if (!customer) {
      return sendJson(res, 401, { ok: false, error: 'Account not found. Please register on the web portal first.' });
    }

    const isValidPassword = verifyPassword(password, customer.password_hash, customer.password_salt);
    if (!isValidPassword) {
      return sendJson(res, 401, { ok: false, error: 'Invalid password. Please check your credentials.' });
    }

    // Check account status
    if (customer.status === 'pending_approval' || customer.status === 'pending_verification') {
      return sendJson(res, 403, {
        ok: false,
        status: customer.status,
        error: 'Your account is pending Super Admin review. You will receive an approval email shortly.'
      });
    }

    if (customer.status === 'rejected') {
      return sendJson(res, 403, {
        ok: false,
        status: 'rejected',
        error: `Your account request was rejected. Reason: ${customer.rejection_reason || 'Criteria not met.'}`
      });
    }

    if (customer.status === 'suspended') {
      return sendJson(res, 403, {
        ok: false,
        status: 'suspended',
        error: 'This account has been suspended by the Super Admin. Please contact support.'
      });
    }

    // Check expiration date
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

    // Generate 6-digit Device Verification OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpId = 'otp_' + crypto.randomBytes(8).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    masterDb.prepare('DELETE FROM otps WHERE email = ? AND purpose = ?').run(cleanEmail, 'device_activation');
    masterDb.prepare(`
      INSERT INTO otps (id, email, code, purpose, expires_at, verified, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `).run(otpId, cleanEmail, otp, 'device_activation', expiresAt, new Date().toISOString());

    // Send One-Time Verification Code email via SMTP
    await smtp.sendDeviceVerificationOtp(cleanEmail, otp, customer.company_name, machineName || 'Windows PC');

    return sendJson(res, 200, {
      ok: true,
      requiresVerification: true,
      email: cleanEmail,
      message: 'One-Time Device Verification Code sent to your registered email.',
      devOtp: process.env.NODE_ENV === 'production' ? undefined : otp
    });
  }

  // 5. Desktop Step 2: Verify Device Verification Code & Activate PC
  if (req.method === 'POST' && pathname === '/api/v1/auth/desktop-verify-device') {
    const body = await parseJsonBody(req);
    const { email, code, machineName } = body;

    if (!email || !code) {
      return sendJson(res, 400, { ok: false, error: 'Email and verification code are required.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanCode = String(code).trim();

    const otpRecord = masterDb.prepare(`
      SELECT * FROM otps
      WHERE email = ? AND purpose = 'device_activation' AND verified = 0
      ORDER BY created_at DESC LIMIT 1
    `).get(cleanEmail);

    if (!otpRecord) {
      return sendJson(res, 400, { ok: false, error: 'No pending verification code found. Please request a new code.' });
    }

    if (new Date(otpRecord.expires_at).getTime() < Date.now()) {
      return sendJson(res, 400, { ok: false, error: 'The verification code has expired. Please try logging in again.' });
    }

    if (otpRecord.code !== cleanCode) {
      return sendJson(res, 400, { ok: false, error: 'Incorrect verification code. Please check your email and try again.' });
    }

    masterDb.prepare('UPDATE otps SET verified = 1 WHERE id = ?').run(otpRecord.id);

    const customer = masterDb.prepare('SELECT * FROM customers WHERE email = ?').get(cleanEmail);
    if (!customer) return sendJson(res, 404, { ok: false, error: 'Customer not found.' });

    // Check max_devices limit
    const activeDeviceCount = masterDb.prepare('SELECT COUNT(*) as c FROM device_tokens WHERE customer_id = ?').get(customer.id).c;
    const planRecord = masterDb.prepare('SELECT max_devices FROM plans WHERE name = ? OR code = ? LIMIT 1').get(customer.plan, customer.plan);
    const maxAllowed = planRecord ? (planRecord.max_devices || 2) : 2;

    if (activeDeviceCount >= maxAllowed) {
      return sendJson(res, 403, {
        ok: false,
        error: `Device limit reached (${activeDeviceCount}/${maxAllowed} PCs). Please revoke an unused PC from your Customer Portal or contact support to upgrade your plan.`,
        code: 'DEVICE_LIMIT_REACHED'
      });
    }

    // Issue Device Token
    const token = generateToken('zyndev_');
    const nowIso = new Date().toISOString();

    masterDb.prepare(`
      INSERT INTO device_tokens (token, customer_id, machine_name, created_at, last_active_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(token, customer.id, machineName || 'Windows Desktop', nowIso, nowIso);

    // Initialize tenant database
    getTenantDb(customer.id);

    const now = Date.now();
    const expiry = customer.valid_until ? new Date(customer.valid_until).getTime() : now + 365 * 86400000;

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

  // 6. Direct Desktop Online Activation (Supports code verification or direct bypass)
  if (req.method === 'POST' && pathname === '/api/v1/auth/desktop-activate') {
    const body = await parseJsonBody(req);
    const { email, password, machineName, code } = body;

    if (!email || !password) {
      return sendJson(res, 400, { ok: false, error: 'Email and password are required.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const customer = masterDb.prepare('SELECT * FROM customers WHERE email = ?').get(cleanEmail);

    if (!customer) {
      return sendJson(res, 401, { ok: false, error: 'Account not found. Please register on the web portal first.' });
    }

    const isValidPassword = verifyPassword(password, customer.password_hash, customer.password_salt);
    if (!isValidPassword) {
      return sendJson(res, 401, { ok: false, error: 'Invalid password. Please verify your credentials.' });
    }

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

    // If code is provided, verify it
    if (code) {
      const cleanCode = String(code).trim();
      const otpRecord = masterDb.prepare(`
        SELECT * FROM otps WHERE email = ? AND purpose = 'device_activation' AND verified = 0 ORDER BY created_at DESC LIMIT 1
      `).get(cleanEmail);
      if (!otpRecord || otpRecord.code !== cleanCode) {
        return sendJson(res, 400, { ok: false, error: 'Invalid or expired verification code.' });
      }
      masterDb.prepare('UPDATE otps SET verified = 1 WHERE id = ?').run(otpRecord.id);
    }

    // Generate Device Token
    // Check max_devices limit
    const activeDeviceCount = masterDb.prepare('SELECT COUNT(*) as c FROM device_tokens WHERE customer_id = ?').get(customer.id).c;
    const planRecord = masterDb.prepare('SELECT max_devices FROM plans WHERE name = ? OR code = ? LIMIT 1').get(customer.plan, customer.plan);
    const maxAllowed = planRecord ? (planRecord.max_devices || 2) : 2;

    if (activeDeviceCount >= maxAllowed) {
      return sendJson(res, 403, {
        ok: false,
        error: `Device limit reached (${activeDeviceCount}/${maxAllowed} PCs). Please revoke an unused PC from your Customer Portal or upgrade your plan.`,
        code: 'DEVICE_LIMIT_REACHED'
      });
    }

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

  // 7. Desktop Validate License & Sync Plan Status
  if (req.method === 'GET' && pathname === '/api/v1/auth/validate-license') {
    const token = getBearerToken(req);
    if (!token) return sendJson(res, 401, { ok: false, error: 'Missing authorization token.' });

    const device = masterDb.prepare('SELECT customer_id FROM device_tokens WHERE token = ?').get(token);
    if (!device) return sendJson(res, 401, { ok: false, error: 'Invalid or revoked device token.' });

    const customer = masterDb.prepare(`
      SELECT id, company_name, owner_name, email, plan, status, valid_until FROM customers WHERE id = ?
    `).get(device.customer_id);

    if (!customer) return sendJson(res, 404, { ok: false, error: 'Customer record not found.' });

    const now = Date.now();
    const expiry = customer.valid_until ? new Date(customer.valid_until).getTime() : now + 365 * 86400000;
    const daysRemaining = Math.max(0, Math.ceil((expiry - now) / (24 * 60 * 60 * 1000)));

    return sendJson(res, 200, {
      ok: true,
      license: {
        activated: true,
        companyId: customer.id,
        companyName: customer.company_name,
        ownerName: customer.owner_name,
        email: customer.email,
        plan: customer.plan,
        validUntil: customer.valid_until,
        status: customer.status,
        daysRemaining,
        gracePeriodDays: 14,
        isOverdue: now > expiry,
        inGracePeriod: now > expiry && now <= (expiry + 14 * 86400000)
      }
    });
  }

  // 8. In-App PIN Forget / Reset: Request Code
  if (req.method === 'POST' && pathname === '/api/v1/auth/pin-reset-request') {
    const body = await parseJsonBody(req);
    const cleanEmail = String(body.email || '').trim().toLowerCase();

    if (!cleanEmail) {
      return sendJson(res, 400, { ok: false, error: 'Email address is required.' });
    }

    const customer = masterDb.prepare('SELECT * FROM customers WHERE email = ?').get(cleanEmail);
    if (!customer) {
      return sendJson(res, 404, { ok: false, error: 'Customer account not found.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpId = 'otp_' + crypto.randomBytes(8).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    masterDb.prepare('DELETE FROM otps WHERE email = ? AND purpose = ?').run(cleanEmail, 'pin_reset');
    masterDb.prepare(`
      INSERT INTO otps (id, email, code, purpose, expires_at, verified, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `).run(otpId, cleanEmail, otp, 'pin_reset', expiresAt, new Date().toISOString());

    await smtp.sendPinResetOtp(cleanEmail, otp, customer.company_name);

    return sendJson(res, 200, {
      ok: true,
      message: 'PIN Reset Verification Code sent to registered email.',
      devOtp: process.env.NODE_ENV === 'production' ? undefined : otp
    });
  }

  // 9. In-App PIN Forget / Reset: Verify & Set New PIN
  if (req.method === 'POST' && pathname === '/api/v1/auth/pin-reset-verify') {
    const body = await parseJsonBody(req);
    const { email, code } = body;

    if (!email || !code) {
      return sendJson(res, 400, { ok: false, error: 'Email and verification code are required.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanCode = String(code).trim();

    const otpRecord = masterDb.prepare(`
      SELECT * FROM otps WHERE email = ? AND purpose = 'pin_reset' AND verified = 0 ORDER BY created_at DESC LIMIT 1
    `).get(cleanEmail);

    if (!otpRecord || otpRecord.code !== cleanCode) {
      return sendJson(res, 400, { ok: false, error: 'Invalid or expired verification code.' });
    }

    masterDb.prepare('UPDATE otps SET verified = 1 WHERE id = ?').run(otpRecord.id);

    return sendJson(res, 200, {
      ok: true,
      message: 'PIN reset verified successfully. You may now configure a new 4-digit PIN.'
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
      SELECT c.id, c.company_name, c.owner_name, c.email, c.phone, c.state, c.gstin, c.status, c.plan, c.valid_until, c.rejection_reason, c.created_at, c.approved_at,
             (SELECT COUNT(*) FROM device_tokens WHERE customer_id = c.id) as active_devices,
             (SELECT max_devices FROM plans WHERE name = c.plan OR code = c.plan LIMIT 1) as max_devices
      FROM customers c
    `;
    const params = [];

    if (statusFilter && statusFilter !== 'all') {
      sql += ' WHERE status = ?';
      params.push(statusFilter);
    }
    sql += ' ORDER BY created_at DESC';

    const customers = masterDb.prepare(sql).all(...params);

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

  // Get Connected Devices for Customer
  if (req.method === 'GET' && pathname === '/api/v1/admin/customer-devices') {
    if (!verifyAdmin(req, res)) return;
    const customerId = query.customerId;
    if (!customerId) return sendJson(res, 400, { ok: false, error: 'Customer ID required.' });
    const devices = masterDb.prepare(`
      SELECT token, machine_name, created_at, last_active_at FROM device_tokens WHERE customer_id = ? ORDER BY last_active_at DESC
    `).all(customerId);
    return sendJson(res, 200, { ok: true, devices });
  }

  // Admin Revoke Customer Device
  if (req.method === 'POST' && pathname === '/api/v1/admin/revoke-device') {
    if (!verifyAdmin(req, res)) return;
    const body = await parseJsonBody(req);
    const { token } = body;
    if (!token) return sendJson(res, 400, { ok: false, error: 'Token required.' });
    masterDb.prepare('DELETE FROM device_tokens WHERE token = ?').run(token);
    return sendJson(res, 200, { ok: true, message: 'Device authorization revoked by admin.' });
  }

    // ── Plan Management Endpoints (Super Admin) ─────────────────────────

  // 1. Get All Plans
  if (req.method === 'GET' && pathname === '/api/v1/admin/plans') {
    if (!verifyAdmin(req, res)) return;

    const plans = masterDb.prepare(`
      SELECT p.*, (SELECT COUNT(*) FROM customers c WHERE c.plan = p.code AND c.status = 'active') as active_subscribers
      FROM plans p
      ORDER BY p.price ASC
    `).all();

    return sendJson(res, 200, { ok: true, plans });
  }

  // 2. Create Plan
  if (req.method === 'POST' && pathname === '/api/v1/admin/plans') {
    if (!verifyAdmin(req, res)) return;
    const body = await parseJsonBody(req);
    const { name, code, description, price, billing_cycle, duration_days, max_devices, features } = body;

    if (!name || !code) {
      return sendJson(res, 400, { ok: false, error: 'Plan name and unique plan code are required.' });
    }

    const planId = 'plan_' + crypto.randomBytes(6).toString('hex');
    const now = new Date().toISOString();

    try {
      masterDb.prepare(`
        INSERT INTO plans (id, name, code, description, price, billing_cycle, duration_days, max_devices, features, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        planId,
        name,
        code,
        description || '',
        parseFloat(price || 0),
        billing_cycle || 'yearly',
        parseInt(duration_days || 365, 10),
        parseInt(max_devices || 2, 10),
        typeof features === 'string' ? features : JSON.stringify(features || []),
        now,
        now
      );

      return sendJson(res, 201, { ok: true, message: 'Plan created successfully.', planId });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: 'Could not create plan: ' + err.message });
    }
  }

  // 3. Update Plan
  const planUpdateMatch = pathname.match(/^\/api\/v1\/admin\/plans\/([^\/]+)$/);
  if (req.method === 'PUT' && planUpdateMatch) {
    if (!verifyAdmin(req, res)) return;
    const planId = planUpdateMatch[1];
    const body = await parseJsonBody(req);
    const { name, description, price, billing_cycle, duration_days, max_devices, features, is_active } = body;

    const now = new Date().toISOString();
    masterDb.prepare(`
      UPDATE plans SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        price = COALESCE(?, price),
        billing_cycle = COALESCE(?, billing_cycle),
        duration_days = COALESCE(?, duration_days),
        max_devices = COALESCE(?, max_devices),
        features = COALESCE(?, features),
        is_active = COALESCE(?, is_active),
        updated_at = ?
      WHERE id = ?
    `).run(
      name,
      description,
      price !== undefined ? parseFloat(price) : null,
      billing_cycle,
      duration_days !== undefined ? parseInt(duration_days, 10) : null,
      max_devices !== undefined ? parseInt(max_devices, 10) : null,
      typeof features === 'string' ? features : (features ? JSON.stringify(features) : null),
      is_active !== undefined ? (is_active ? 1 : 0) : null,
      now,
      planId
    );

    return sendJson(res, 200, { ok: true, message: 'Plan updated successfully.' });
  }

  // 4. Delete / Deactivate Plan
  if (req.method === 'DELETE' && planUpdateMatch) {
    if (!verifyAdmin(req, res)) return;
    const planId = planUpdateMatch[1];

    masterDb.prepare('DELETE FROM plans WHERE id = ?').run(planId);
    return sendJson(res, 200, { ok: true, message: 'Plan removed.' });
  }

  // ── SMTP Configuration Endpoints (Super Admin) ─────────────────────

  // 1. Get SMTP Configuration
  if (req.method === 'GET' && pathname === '/api/v1/admin/smtp') {
    if (!verifyAdmin(req, res)) return;
    return sendJson(res, 200, { ok: true, config: smtp.getSmtpConfig() });
  }

  // 2. Save SMTP Configuration
  if (req.method === 'POST' && pathname === '/api/v1/admin/smtp') {
    if (!verifyAdmin(req, res)) return;
    const body = await parseJsonBody(req);
    const updated = smtp.saveSmtpConfig(body);
    return sendJson(res, 200, { ok: true, message: 'SMTP settings updated successfully.', config: updated });
  }

  // 3. Test SMTP Connection
  if (req.method === 'POST' && pathname === '/api/v1/admin/smtp/test') {
    const admin = verifyAdmin(req, res);
    if (!admin) return;
    const body = await parseJsonBody(req);
    const targetEmail = body.testEmail || admin.email;
    const testResult = await smtp.testSmtpConnection(targetEmail);
    return sendJson(res, testResult.ok ? 200 : 400, testResult);
  }

  function compareSemver(v1, v2) {
  const p1 = String(v1 || '').split('.').map(n => parseInt(n, 10) || 0);
  const p2 = String(v2 || '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const a = p1[i] || 0;
    const b = p2[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

// ── App Release & Version Management Endpoints (Super Admin) ─────────

  // 1. Get Releases Info & Downloadable Files List
  if (req.method === 'GET' && pathname === '/api/v1/admin/releases') {
    if (!verifyAdmin(req, res)) return;

    const downloadsDir = path.join(__dirname, 'public', 'downloads');
    const files = [];

    if (fs.existsSync(downloadsDir)) {
      const dirFiles = fs.readdirSync(downloadsDir);
      for (const f of dirFiles) {
        if (!f.endsWith('.exe')) continue;
        const filePath = path.join(downloadsDir, f);
        try {
          const stat = fs.statSync(filePath);
          const match = f.match(/(\d+\.\d+\.\d+)/);
          files.push({
            name: f,
            version: match ? match[1] : '1.0.0',
            size: stat.size,
            sizeMb: (stat.size / (1024 * 1024)).toFixed(1) + ' MB',
            updatedAt: stat.mtime.toISOString(),
            downloadUrl: `/api/v1/download/app?file=${encodeURIComponent(f)}`
          });
        } catch (_) {}
      }
      files.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    }

    const activeVersion = getSetting('latest_version', files.length > 0 ? files[0].version : '1.1.1');
    const activeFileName = getSetting('release_filename', files.length > 0 ? files[0].name : 'ZynBill Setup 1.1.1.exe');
    const releaseNotes = getSetting('release_notes', 'General performance and security enhancements.');
    const publishedAt = getSetting('published_at', new Date().toISOString());

    return sendJson(res, 200, {
      ok: true,
      activeRelease: {
        version: activeVersion,
        fileName: activeFileName,
        releaseNotes,
        publishedAt
      },
      files
    });
  }

  // 2. Stream Upload New Release Installer (.exe)
  if (req.method === 'POST' && pathname === '/api/v1/admin/releases/upload') {
    if (!verifyAdmin(req, res)) return;

    const version = String(query.version || '').trim();
    if (!/^\d+(\.\d+){1,3}$/.test(version)) {
      req.resume();
      return sendJson(res, 400, {
        ok: false,
        error: 'Invalid version format. Please enter a valid semantic version (e.g., 1.1.2).'
      });
    }

    const activeVersion = getSetting('latest_version', '1.1.1');
    const allowDowngrade = String(query.allowDowngrade || '').toLowerCase() === 'true';
    const cmp = compareSemver(version, activeVersion);

    if (cmp <= 0 && !allowDowngrade) {
      req.resume();
      return sendJson(res, 400, {
        ok: false,
        error: `Version Conflict: Uploaded version v${version} is not newer than current active version v${activeVersion}. Updates must be strictly newer to prevent client downgrade loops.`
      });
    }

    const notes = String(query.notes || 'Bug fixes and performance improvements').trim();
    const cleanFilename = `ZynBill Setup ${version}.exe`;

    const downloadsDir = path.join(__dirname, 'public', 'downloads');
    if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

    const targetPath = path.join(downloadsDir, cleanFilename);
    const tempPath = path.join(downloadsDir, `.tmp_${Date.now()}_${cleanFilename}`);
    const writeStream = fs.createWriteStream(tempPath);

    let bytesReceived = 0;
    let aborted = false;

    function cleanupTemp() {
      try { writeStream.destroy(); } catch (_) {}
      try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
    }

    req.on('aborted', () => {
      aborted = true;
      cleanupTemp();
    });

    req.on('close', () => {
      if (!writeStream.writableEnded && !writeStream.destroyed) {
        aborted = true;
        cleanupTemp();
      }
    });

    req.on('data', (chunk) => {
      bytesReceived += chunk.length;
    });

    req.pipe(writeStream);

    writeStream.on('finish', () => {
      if (aborted) return;

      // Validate installer size (must be at least 1 MB to avoid empty or truncated uploads)
      if (bytesReceived < 1024 * 1024) {
        cleanupTemp();
        return sendJson(res, 400, {
          ok: false,
          error: `Uploaded file is corrupt or too small (${(bytesReceived / 1024).toFixed(1)} KB). A valid Windows installer must be greater than 1 MB.`
        });
      }

      // Atomically move temp file to target release path
      try {
        if (fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
        }
        fs.renameSync(tempPath, targetPath);
      } catch (renameErr) {
        cleanupTemp();
        return sendJson(res, 500, {
          ok: false,
          error: 'Failed to finalize uploaded package on server storage: ' + renameErr.message
        });
      }

      // Persist active settings in DB
      try {
        setSetting('latest_version', version);
        setSetting('release_filename', cleanFilename);
        setSetting('release_notes', notes);
        setSetting('published_at', new Date().toISOString());
      } catch (dbErr) {
        console.error('[Settings Save Error]:', dbErr);
      }

      // Compute SHA512 and generate Electron latest.yml manifest
      try {
        const hash = crypto.createHash('sha512');
        const fileStream = fs.createReadStream(targetPath);
        fileStream.on('data', (c) => hash.update(c));
        fileStream.on('end', () => {
          const sha512 = hash.digest('base64');
          const ymlContent = [
            `version: ${version}`,
            `files:`,
            `  - url: ${cleanFilename}`,
            `    sha512: ${sha512}`,
            `    size: ${bytesReceived}`,
            `path: ${cleanFilename}`,
            `sha512: ${sha512}`,
            `releaseDate: '${new Date().toISOString()}'`,
            ``
          ].join('\n');
          fs.writeFileSync(path.join(downloadsDir, 'latest.yml'), ymlContent, 'utf8');
        });
      } catch (ymlErr) {
        console.error('[latest.yml Generation Error]:', ymlErr);
      }

      return sendJson(res, 200, {
        ok: true,
        message: `Version ${version} published successfully!`,
        version,
        fileName: cleanFilename,
        sizeBytes: bytesReceived,
        sizeMb: (bytesReceived / (1024 * 1024)).toFixed(1) + ' MB'
      });
    });

    writeStream.on('error', (err) => {
      cleanupTemp();
      if (!res.headersSent) {
        return sendJson(res, 500, { ok: false, error: 'Disk write error during upload: ' + err.message });
      }
    });
    return;
  }

  // 3. Delete Stored Release File
  if (req.method === 'DELETE' && pathname === '/api/v1/admin/releases/file') {
    if (!verifyAdmin(req, res)) return;
    const filename = path.basename(String(query.filename || ''));
    if (!filename || !filename.endsWith('.exe')) {
      return sendJson(res, 400, { ok: false, error: 'Invalid file name.' });
    }

    const downloadsDir = path.join(__dirname, 'public', 'downloads');
    const targetPath = path.join(downloadsDir, filename);

    if (fs.existsSync(targetPath)) {
      try {
        fs.unlinkSync(targetPath);
        return sendJson(res, 200, { ok: true, message: `File ${filename} removed.` });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: err.message });
      }
    }
    return sendJson(res, 404, { ok: false, error: 'File not found.' });
  }

  // ── Error Monitoring & Telemetry Endpoints (Super Admin & Clients) ─

  // 1. Get System & Error Logs with Filters and KPI Stats
  if (req.method === 'GET' && pathname === '/api/v1/admin/logs') {
    if (!verifyAdmin(req, res)) return;
    const { level = '', source = '', limit = 100 } = query;
    const result = getErrorLogs({ level, source, limit });
    return sendJson(res, 200, { ok: true, ...result });
  }

  // 2. Clear All Error Logs
  if (req.method === 'DELETE' && pathname === '/api/v1/admin/logs') {
    if (!verifyAdmin(req, res)) return;
    const success = clearErrorLogs();
    return sendJson(res, 200, { ok: success, message: 'Logs cleared successfully' });
  }

  // 3. Ingest Error Telemetry from Desktop App or Client Portal
  if (req.method === 'POST' && pathname === '/api/v1/telemetry/report-error') {
    const body = await parseJsonBody(req).catch(() => ({}));
    const {
      source = 'desktop_client',
      level = 'ERROR',
      message,
      stack = '',
      clientVersion = '',
      customerId = ''
    } = body;

    if (message) {
      logSystemError({
        source,
        level,
        message,
        stack,
        clientVersion,
        customerId,
        endpoint: 'client_telemetry',
        ipAddress: req.socket?.remoteAddress || ''
      });
    }
    return sendJson(res, 200, { ok: true, message: 'Telemetry logged' });
  }

  // ── Customer Web Portal Endpoints ─────────────────────────────────

  // 1. Customer Login
  if (req.method === 'POST' && pathname === '/api/v1/portal/login') {
    const body = await parseJsonBody(req);
    const { email, password } = body;

    if (!email || !password) {
      return sendJson(res, 400, { ok: false, error: 'Email and password are required.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const customer = masterDb.prepare('SELECT * FROM customers WHERE email = ?').get(cleanEmail);

    if (!customer || !verifyPassword(password, customer.password_hash, customer.password_salt)) {
      return sendJson(res, 401, { ok: false, error: 'Invalid email or password.' });
    }

    const sessionToken = generateToken('usr_');
    customerSessions.set(sessionToken, { id: customer.id, email: customer.email });

    const now = Date.now();
    const expiry = customer.valid_until ? new Date(customer.valid_until).getTime() : now + 365 * 86400000;
    const daysRemaining = Math.max(0, Math.ceil((expiry - now) / (24 * 60 * 60 * 1000)));

    return sendJson(res, 200, {
      ok: true,
      token: sessionToken,
      customer: {
        id: customer.id,
        companyName: customer.company_name,
        ownerName: customer.owner_name,
        email: customer.email,
        phone: customer.phone,
        state: customer.state,
        gstin: customer.gstin,
        status: customer.status,
        plan: customer.plan,
        validUntil: customer.valid_until,
        daysRemaining,
        gracePeriodDays: 14
      }
    });
  }

  function verifyCustomer(req, res) {
    const token = getBearerToken(req);
    if (!token || !customerSessions.has(token)) {
      sendJson(res, 401, { ok: false, error: 'Customer session expired. Please log in.' });
      return null;
    }
    return customerSessions.get(token);
  }

  // 2. Customer Profile & Devices
  if (req.method === 'GET' && pathname === '/api/v1/portal/profile') {
    const session = verifyCustomer(req, res);
    if (!session) return;

    const customer = masterDb.prepare('SELECT * FROM customers WHERE id = ?').get(session.id);
    if (!customer) return sendJson(res, 404, { ok: false, error: 'Customer not found.' });

    const devices = masterDb.prepare(`
      SELECT token, machine_name, created_at, last_active_at FROM device_tokens WHERE customer_id = ? ORDER BY last_active_at DESC
    `).all(session.id);

    const now = Date.now();
    const expiry = customer.valid_until ? new Date(customer.valid_until).getTime() : now + 365 * 86400000;
    const daysRemaining = Math.max(0, Math.ceil((expiry - now) / (24 * 60 * 60 * 1000)));

    const planRecord = masterDb.prepare('SELECT max_devices FROM plans WHERE name = ? OR code = ? LIMIT 1').get(customer.plan, customer.plan);
    const maxDevices = planRecord ? (planRecord.max_devices || 2) : 2;

    return sendJson(res, 200, {
      ok: true,
      customer: {
        id: customer.id,
        companyName: customer.company_name,
        ownerName: customer.owner_name,
        email: customer.email,
        phone: customer.phone,
        state: customer.state,
        gstin: customer.gstin,
        status: customer.status,
        plan: customer.plan,
        validUntil: customer.valid_until,
        daysRemaining,
        maxDevices,
        gracePeriodDays: 14
      },
      devices
    });
  }

  // 3. Customer Forgot Password Request
  if (req.method === 'POST' && pathname === '/api/v1/portal/forgot-password') {
    const body = await parseJsonBody(req);
    const cleanEmail = String(body.email || '').trim().toLowerCase();

    if (!cleanEmail) {
      return sendJson(res, 400, { ok: false, error: 'Registered email address is required.' });
    }

    const customer = masterDb.prepare('SELECT * FROM customers WHERE email = ?').get(cleanEmail);
    if (!customer) {
      return sendJson(res, 404, { ok: false, error: 'No account registered with this email address.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpId = 'otp_' + crypto.randomBytes(8).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    masterDb.prepare('DELETE FROM otps WHERE email = ? AND purpose = ?').run(cleanEmail, 'password_reset');
    masterDb.prepare(`
      INSERT INTO otps (id, email, code, purpose, expires_at, verified, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `).run(otpId, cleanEmail, otp, 'password_reset', expiresAt, new Date().toISOString());

    await smtp.sendPasswordResetOtp(cleanEmail, otp, customer.company_name);

    return sendJson(res, 200, {
      ok: true,
      message: 'Password reset code sent to your registered email.',
      devOtp: process.env.NODE_ENV === 'production' ? undefined : otp
    });
  }

  // 4. Customer Reset Password with OTP
  if (req.method === 'POST' && pathname === '/api/v1/portal/reset-password') {
    const body = await parseJsonBody(req);
    const { email, otp, newPassword } = body;

    if (!email || !otp || !newPassword) {
      return sendJson(res, 400, { ok: false, error: 'Email, verification code, and new password are required.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanOtp = String(otp).trim();

    const otpRecord = masterDb.prepare(`
      SELECT * FROM otps WHERE email = ? AND purpose = 'password_reset' AND verified = 0 ORDER BY created_at DESC LIMIT 1
    `).get(cleanEmail);

    if (!otpRecord || otpRecord.code !== cleanOtp) {
      return sendJson(res, 400, { ok: false, error: 'Invalid or expired verification code.' });
    }

    if (new Date(otpRecord.expires_at).getTime() < Date.now()) {
      return sendJson(res, 400, { ok: false, error: 'Verification code has expired. Please request a new one.' });
    }

    masterDb.prepare('UPDATE otps SET verified = 1 WHERE id = ?').run(otpRecord.id);

    const { hash, salt } = hashPassword(newPassword);
    masterDb.prepare(`
      UPDATE customers SET password_hash = ?, password_salt = ?, updated_at = ? WHERE email = ?
    `).run(hash, salt, new Date().toISOString(), cleanEmail);

    return sendJson(res, 200, { ok: true, message: 'Password reset successfully. You can now log in.' });
  }

  // 5. Customer Change Password (Logged in)
  if (req.method === 'POST' && pathname === '/api/v1/portal/change-password') {
    const session = verifyCustomer(req, res);
    if (!session) return;
    const body = await parseJsonBody(req);
    const { currentPassword, newPassword } = body;

    const customer = masterDb.prepare('SELECT * FROM customers WHERE id = ?').get(session.id);
    if (!customer || !verifyPassword(currentPassword, customer.password_hash, customer.password_salt)) {
      return sendJson(res, 400, { ok: false, error: 'Current password is incorrect.' });
    }

    const { hash, salt } = hashPassword(newPassword);
    masterDb.prepare(`
      UPDATE customers SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?
    `).run(hash, salt, new Date().toISOString(), session.id);

    return sendJson(res, 200, { ok: true, message: 'Password updated successfully.' });
  }

  // 6. Customer Revoke Device
  if (req.method === 'POST' && pathname === '/api/v1/portal/revoke-device') {
    const session = verifyCustomer(req, res);
    if (!session) return;
    const body = await parseJsonBody(req);
    const { token } = body;

    masterDb.prepare('DELETE FROM device_tokens WHERE token = ? AND customer_id = ?').run(token, session.id);
    return sendJson(res, 200, { ok: true, message: 'Device authorization revoked.' });
  }

  // 7. Get Available Plans for Portal Users
  if (req.method === 'GET' && pathname === '/api/v1/portal/plans') {
    const plans = masterDb.prepare('SELECT id, name, code, description, price, billing_cycle, duration_days, max_devices, features FROM plans WHERE is_active = 1 ORDER BY price ASC').all();
    return sendJson(res, 200, { ok: true, plans });
  }


  // 8. Customer Business Reports & Synced Analytics
  if (req.method === 'GET' && pathname === '/api/v1/portal/reports') {
    const session = verifyCustomer(req, res);
    if (!session) return;

    try {
      const tenantDb = getTenantDb(session.id);

      const salesRow = tenantDb.prepare(`
        SELECT COALESCE(SUM(total_amount), 0) AS totalSales, COUNT(*) AS salesCount
        FROM transactions
        WHERE LOWER(type) IN ('sale', 'sales_invoice', 'tax_invoice', 'cash_sale')
      `).get() || { totalSales: 0, salesCount: 0 };

      const purchaseRow = tenantDb.prepare(`
        SELECT COALESCE(SUM(total_amount), 0) AS totalPurchases, COUNT(*) AS purchaseCount
        FROM transactions
        WHERE LOWER(type) IN ('purchase', 'purchase_bill')
      `).get() || { totalPurchases: 0, purchaseCount: 0 };

      const receivableRow = tenantDb.prepare(`
        SELECT COALESCE(SUM(balance), 0) AS totalReceivables, COUNT(*) AS partiesWithDue
        FROM parties
        WHERE balance > 0
      `).get() || { totalReceivables: 0, partiesWithDue: 0 };

      const itemsCount = tenantDb.prepare(`SELECT COUNT(*) AS c FROM items`).get()?.c || 0;
      const partiesCount = tenantDb.prepare(`SELECT COUNT(*) AS c FROM parties`).get()?.c || 0;

      const recentTransactions = tenantDb.prepare(`
        SELECT id, invoice_no, type, party_name, total_amount, tax_amount, status, transaction_date
        FROM transactions
        ORDER BY transaction_date DESC, rowid DESC
        LIMIT 10
      `).all() || [];

      return sendJson(res, 200, {
        ok: true,
        reports: {
          totalSales: Number(salesRow.totalSales) || 0,
          salesCount: Number(salesRow.salesCount) || 0,
          totalPurchases: Number(purchaseRow.totalPurchases) || 0,
          purchaseCount: Number(purchaseRow.purchaseCount) || 0,
          totalReceivables: Number(receivableRow.totalReceivables) || 0,
          partiesWithDue: Number(receivableRow.partiesWithDue) || 0,
          itemsCount: Number(itemsCount) || 0,
          partiesCount: Number(partiesCount) || 0,
          recentTransactions
        }
      });
    } catch (err) {
      console.error('[Portal Reports] Error fetching reports for tenant:', session.id, err);
      return sendJson(res, 500, { ok: false, error: 'Failed to generate cloud business reports.' });
    }
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
        acknowledgedIds.push(ev.id);
      }
    }

    masterDb.prepare(`
      INSERT INTO sync_audit (id, customer_id, batch_size, synced_at)
      VALUES (?, ?, ?, ?)
    `).run(generateToken('aud_'), customer.id, acknowledgedIds.length, nowIso);

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
  } catch (err) {
    console.error(`[Server Error] [${new Date().toISOString()}] ${req.method} ${req.url}:`, err.stack || err);
    const isClientPayloadError = err.message && (err.message.includes('Malformed JSON') || err.message.includes('exceeded'));
    
    // Log into master database for admin error monitoring
    try {
      logSystemError({
        source: 'server',
        level: isClientPayloadError ? 'WARN' : 'ERROR',
        message: err.message || 'Server Request Error',
        stack: err.stack || '',
        endpoint: `${req.method} ${req.url}`,
        ipAddress: req.socket?.remoteAddress || ''
      });
    } catch (_) {}

    if (!res.headersSent) {
      const statusCode = isClientPayloadError ? 400 : 500;
      return sendJson(res, statusCode, {
        ok: false,
        error: isClientPayloadError ? err.message : 'An unexpected server error occurred.'
      });
    } else {
      res.end();
    }
  }
});

// Global process error management to prevent server crashes
process.on('uncaughtException', (err) => {
  console.error(`[CRITICAL] [${new Date().toISOString()}] Uncaught Exception:`, err.stack || err);
  try {
    logSystemError({
      source: 'server',
      level: 'CRITICAL',
      message: err.message || 'Uncaught Process Exception',
      stack: err.stack || ''
    });
  } catch (_) {}
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`[CRITICAL] [${new Date().toISOString()}] Unhandled Promise Rejection:`, reason);
  try {
    logSystemError({
      source: 'server',
      level: 'ERROR',
      message: String(reason?.message || reason || 'Unhandled Promise Rejection'),
      stack: reason?.stack || ''
    });
  } catch (_) {}
});

// Start Server if run directly
if (require.main === module) {
  const publicUrl = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`🚀 ZynBill Cloud Ecosystem Server running on http://localhost:${PORT}`);
    console.log(`🌐 Public Domain / URL:          ${publicUrl}`);
    console.log(`📋 Customer Registration Portal: ${publicUrl}/register`);
    console.log(`👤 Customer Self-Service Portal: ${publicUrl}/portal`);
    console.log(`👑 Super Admin Dashboard:        ${publicUrl}/admin`);
    console.log(`⚡ Sync & Auth REST Endpoints:    ${publicUrl}/api/v1/`);
    console.log(`======================================================\n`);
  });
}

module.exports = { server, PORT };