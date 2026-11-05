/**
 * Comprehensive Test Suite for ZynBill Cloud Enhancements:
 * 1. SMTP Dynamic Configuration & Test Sending
 * 2. Super Admin Subscription Plan Management
 * 3. First PC Login with One-Time Device Verification Code
 * 4. Customer Portal Authentication, Profile & Device Management
 * 5. Password Reset & PIN Reset Flows via Email OTP
 * 6. Application Installer Download Endpoint
 * 7. In-App Plan Status & Validity License Validation
 */

const assert = require('node:assert');
const http = require('node:http');

const PORT = 4000;

function apiRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : '';
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };
    if (postData) {
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method,
      headers: reqHeaders
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) });
        } catch (_) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function run() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING ZYNBILL CLOUD FEATURES EXPANSION TEST SUITE');
  console.log('======================================================\n');

  // ── 1. Super Admin Authentication ──────────────────────────────────
  console.log('[Test 1] Super Admin Login...');
  const adminLogin = await apiRequest('POST', '/api/v1/admin/login', {
    email: 'admin@zynbill.com',
    password: 'admin123'
  });
  assert.strictEqual(adminLogin.status, 200);
  assert.ok(adminLogin.body.token, 'Must return admin session token');
  const adminToken = adminLogin.body.token;
  console.log('✓ Super Admin authenticated successfully');

  // ── 2. SMTP Configuration & Test Sending ───────────────────────────
  console.log('\n[Test 2] SMTP Configuration & Test Endpoint...');
  const smtpGet = await apiRequest('GET', '/api/v1/admin/smtp', null, {
    'Authorization': 'Bearer ' + adminToken
  });
  assert.strictEqual(smtpGet.status, 200);
  assert.ok(smtpGet.body.config, 'Should return current SMTP settings');

  // Save new SMTP settings
  const smtpSave = await apiRequest('POST', '/api/v1/admin/smtp', {
    host: 'smtp.testmail.com',
    port: 587,
    secure: false,
    user: 'notifications@testbusiness.com',
    pass: 'securepassword123',
    from: '"ZynBill Billing" <notifications@testbusiness.com>'
  }, {
    'Authorization': 'Bearer ' + adminToken
  });
  assert.strictEqual(smtpSave.status, 200);
  assert.strictEqual(smtpSave.body.config.host, 'smtp.testmail.com');
  assert.strictEqual(smtpSave.body.config.user, 'notifications@testbusiness.com');

  // Test sending
  const smtpTest = await apiRequest('POST', '/api/v1/admin/smtp/test', {
    testEmail: 'tester@testbusiness.com'
  }, {
    'Authorization': 'Bearer ' + adminToken
  });
  assert.strictEqual(smtpTest.status, 200);
  assert.strictEqual(smtpTest.body.ok, true);
  console.log('✓ SMTP dynamic settings saved and test email transmission verified');

  // ── 3. Super Admin Plan Management ─────────────────────────────────
  console.log('\n[Test 3] Super Admin Plan Management...');
  const plansGet = await apiRequest('GET', '/api/v1/admin/plans', null, {
    'Authorization': 'Bearer ' + adminToken
  });
  assert.strictEqual(plansGet.status, 200);
  assert.ok(plansGet.body.plans.length >= 3, 'Must have at least default 3 plans seeded');

  // Create a custom plan
  const createPlan = await apiRequest('POST', '/api/v1/admin/plans', {
    name: 'Custom Platinum Enterprise',
    code: 'Platinum',
    description: 'Custom tailored enterprise deployment',
    price: 14999,
    billing_cycle: 'yearly',
    duration_days: 730,
    max_devices: 15,
    features: ['Unlimited Everything', 'Dedicated Server', 'VIP 24/7 Phone Support']
  }, {
    'Authorization': 'Bearer ' + adminToken
  });
  assert.strictEqual(createPlan.status, 201);
  assert.ok(createPlan.body.planId);
  const customPlanId = createPlan.body.planId;
  console.log(`✓ Subscription plan created with ID: ${customPlanId}`);

  // Delete the test plan
  const deletePlan = await apiRequest('DELETE', `/api/v1/admin/plans/${customPlanId}`, null, {
    'Authorization': 'Bearer ' + adminToken
  });
  assert.strictEqual(deletePlan.status, 200);
  console.log('✓ Subscription plan removal verified');

  // ── 4. Customer Registration & Super Admin Approval ────────────────
  console.log('\n[Test 4] Customer Registration & Approval...');
  const customerEmail = `client_${Date.now()}@biz.com`;
  const regRes = await apiRequest('POST', '/api/v1/auth/register', {
    companyName: 'Horizon Multi-Mart',
    ownerName: 'Rahul Varma',
    email: customerEmail,
    phone: '9847000111',
    state: 'Kerala',
    password: 'password456'
  });
  assert.strictEqual(regRes.status, 200);
  const regOtp = regRes.body.devOtp;

  // Verify registration OTP
  const verifyReg = await apiRequest('POST', '/api/v1/auth/verify-otp', {
    email: customerEmail,
    otp: regOtp
  });
  assert.strictEqual(verifyReg.status, 200);

  // Super Admin approves customer
  const customerList = await apiRequest('GET', '/api/v1/admin/customers?status=pending_approval', null, {
    'Authorization': 'Bearer ' + adminToken
  });
  const customer = customerList.body.customers.find(c => c.email === customerEmail);
  assert.ok(customer, 'Customer should be in pending list');

  const approveRes = await apiRequest('POST', `/api/v1/admin/customers/${customer.id}/approve`, {
    plan: 'Professional',
    durationDays: 365
  }, {
    'Authorization': 'Bearer ' + adminToken
  });
  assert.strictEqual(approveRes.status, 200);
  console.log('✓ Customer registered, verified via OTP, and approved by Super Admin');

  // ── 5. First PC Login with One-Time Device Verification Code ────────
  console.log('\n[Test 5] First PC Login: One-Time Device Verification Code...');
  // Step 1: Initiate PC login
  const initLogin = await apiRequest('POST', '/api/v1/auth/desktop-initiate-login', {
    email: customerEmail,
    password: 'password456',
    machineName: 'Store-POS-Counter-1'
  });
  assert.strictEqual(initLogin.status, 200);
  assert.strictEqual(initLogin.body.requiresVerification, true);
  assert.ok(initLogin.body.devOtp, 'Should generate and dispatch 6-digit Device Verification Code');
  const deviceOtp = initLogin.body.devOtp;
  console.log(`✓ Device verification OTP generated & dispatched: ${deviceOtp}`);

  // Step 2: Verify Device Verification Code & Activate PC
  const verifyDevice = await apiRequest('POST', '/api/v1/auth/desktop-verify-device', {
    email: customerEmail,
    code: deviceOtp,
    machineName: 'Store-POS-Counter-1'
  });
  assert.strictEqual(verifyDevice.status, 200);
  assert.ok(verifyDevice.body.token, 'Must return device token');
  assert.strictEqual(verifyDevice.body.customer.companyName, 'Horizon Multi-Mart');
  assert.strictEqual(verifyDevice.body.customer.plan, 'Professional');
  const deviceToken = verifyDevice.body.token;
  console.log('✓ PC successfully authorized and activated with device token');

  // ── 6. In-App Plan Status and License Validation ───────────────────
  console.log('\n[Test 6] In-App Plan Status & Validity License Validation...');
  const licenseCheck = await apiRequest('GET', '/api/v1/auth/validate-license', null, {
    'Authorization': 'Bearer ' + deviceToken
  });
  assert.strictEqual(licenseCheck.status, 200);
  assert.strictEqual(licenseCheck.body.license.plan, 'Professional');
  assert.strictEqual(licenseCheck.body.license.status, 'active');
  assert.ok(licenseCheck.body.license.daysRemaining >= 360);
  assert.strictEqual(licenseCheck.body.license.gracePeriodDays, 14);
  console.log(`✓ In-App plan status verified: ${licenseCheck.body.license.plan} Plan, ${licenseCheck.body.license.daysRemaining} days left`);

  // ── 7. Customer Portal Web Login & Device List ─────────────────────
  console.log('\n[Test 7] Customer Portal Authentication & Devices...');
  const portalLogin = await apiRequest('POST', '/api/v1/portal/login', {
    email: customerEmail,
    password: 'password456'
  });
  assert.strictEqual(portalLogin.status, 200);
  assert.ok(portalLogin.body.token);
  const portalToken = portalLogin.body.token;

  const portalProfile = await apiRequest('GET', '/api/v1/portal/profile', null, {
    'Authorization': 'Bearer ' + portalToken
  });
  assert.strictEqual(portalProfile.status, 200);
  assert.strictEqual(portalProfile.body.customer.companyName, 'Horizon Multi-Mart');
  assert.strictEqual(portalProfile.body.devices.length, 1);
  assert.strictEqual(portalProfile.body.devices[0].machine_name, 'Store-POS-Counter-1');
  console.log(`✓ Customer Portal retrieved profile and 1 connected PC terminal`);

  // ── 8. Forgot Password Flow via Email OTP ──────────────────────────
  console.log('\n[Test 8] Customer Password Reset via Email OTP...');
  const forgotReq = await apiRequest('POST', '/api/v1/portal/forgot-password', {
    email: customerEmail
  });
  assert.strictEqual(forgotReq.status, 200);
  const forgotOtp = forgotReq.body.devOtp;

  const resetPass = await apiRequest('POST', '/api/v1/portal/reset-password', {
    email: customerEmail,
    otp: forgotOtp,
    newPassword: 'newsecurepassword789'
  });
  assert.strictEqual(resetPass.status, 200);

  // Verify new password works
  const reLogin = await apiRequest('POST', '/api/v1/portal/login', {
    email: customerEmail,
    password: 'newsecurepassword789'
  });
  assert.strictEqual(reLogin.status, 200);
  console.log('✓ Customer password reset via OTP verified and tested with new credentials');

  // ── 9. In-App PIN Forget / Reset Flow via Email OTP ────────────────
  console.log('\n[Test 9] In-App Desktop PIN Reset via Email OTP...');
  const pinResetReq = await apiRequest('POST', '/api/v1/auth/pin-reset-request', {
    email: customerEmail
  });
  assert.strictEqual(pinResetReq.status, 200);
  const pinOtp = pinResetReq.body.devOtp;

  const pinResetVerify = await apiRequest('POST', '/api/v1/auth/pin-reset-verify', {
    email: customerEmail,
    code: pinOtp
  });
  assert.strictEqual(pinResetVerify.status, 200);
  console.log('✓ Security PIN reset flow verified via 6-digit email authorization code');

  // ── 10. Application Installer Download Route ───────────────────────
  console.log('\n[Test 10] Application Installer Download Route...');
  const downloadRes = await apiRequest('GET', '/api/v1/download/app');
  assert.strictEqual(downloadRes.status, 200);
  assert.ok(downloadRes.headers['content-disposition'].includes('.exe'));
  console.log('✓ Application installer served correctly via /api/v1/download/app');

  console.log('\n======================================================');
  console.log('🎉 ALL CLOUD ENHANCEMENT TESTS PASSED PERFECTLY (100%)');
  console.log('======================================================\n');
}

run().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
