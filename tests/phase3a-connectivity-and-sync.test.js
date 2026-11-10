const assert = require("assert");
const fs = require("fs");
const path = require("path");
const http = require("node:http");
const { randomUUID } = require("crypto");
const database = require("../database");
const { SyncService, HttpSyncAdapter } = require("../sync-service");
const { createFixture, inspectDatabase } = require("./database-fixtures");

// Import server components
const {
  masterDb,
  getTenantDb,
  hashPassword,
  verifyPassword
} = require("../server/db");
const { server } = require("../server/server");
const smtp = require("../server/smtp");

// Stub all smtp dispatch functions so tests are 100% hermetic and do not make external network socket calls
smtp.sendOtpEmail = async () => ({ ok: true, simulated: true });
smtp.sendDeviceVerificationOtp = async () => ({ ok: true, simulated: true });
smtp.sendPinResetOtp = async () => ({ ok: true, simulated: true });
smtp.sendPasswordResetOtp = async () => ({ ok: true, simulated: true });
smtp.sendMail = async () => ({ ok: true, delivered: true, simulated: true });

const TEST_PORT = 4188;
const TEST_SERVER_URL = `http://127.0.0.1:${TEST_PORT}`;

function httpRequest(method, endpoint, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (payload) headers["Content-Length"] = Buffer.byteLength(payload);

    const req = http.request(`${TEST_SERVER_URL}${endpoint}`, {
      method,
      headers,
      timeout: 15000,
    }, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let data = {};
        try { data = JSON.parse(raw); } catch (_) { data = { raw }; }
        resolve({ status: res.statusCode, headers: res.headers, data });
      });
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });

    if (payload) req.write(payload);
    req.end();
  });
}

async function run() {
  console.log("\n=======================================================");
  console.log("▶ STARTING PHASE 3A CORE CONNECTIVITY & SYNC TEST SUITE");
  console.log("=======================================================\n");

  // Start test server
  await new Promise((resolve) => server.listen(TEST_PORT, "127.0.0.1", resolve));
  console.log(`✓ Test cloud server listening on port ${TEST_PORT}`);

  try {
    // ─────────────────────────────────────────────────────────────────
    // Test 1: Content Security Policy & Zero-Renderer-Fetch Verification
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 1] Verifying Renderer CSP enforcement and zero-fetch architecture...");
    const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    assert.ok(indexHtml.includes("connect-src 'none'"), "index.html must maintain strict connect-src 'none'");
    assert.ok(!indexHtml.includes("connect-src *"), "index.html must not use wildcard connect-src");

    const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
    const cloudClientJs = fs.readFileSync(path.join(__dirname, "..", "cloud-desktop-client.js"), "utf8");
    const appFetchCalls = (appJs.match(/fetch\(/g) || []).length;
    const clientFetchCalls = (cloudClientJs.match(/fetch\(/g) || []).length;
    assert.strictEqual(appFetchCalls, 0, "app.js must not contain direct fetch() calls");
    assert.strictEqual(clientFetchCalls, 0, "cloud-desktop-client.js must not contain direct fetch() calls");

    const preloadJs = fs.readFileSync(path.join(__dirname, "..", "preload.js"), "utf8");
    assert.ok(preloadJs.includes('contextBridge.exposeInMainWorld("giCloud"'), "preload.js must expose giCloud bridge");
    console.log("✓ Renderer CSP is strictly enforced (connect-src 'none') and all renderer fetch calls eliminated.");

    // ─────────────────────────────────────────────────────────────────
    // Test 2: Cloud Health Check & Server Reachability
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 2] Testing Cloud Health Check endpoint...");
    const healthRes = await httpRequest("GET", "/api/v1/system/health");
    assert.strictEqual(healthRes.status, 200);
    assert.strictEqual(healthRes.data.ok, true);
    assert.strictEqual(healthRes.data.status, "operational");
    console.log("✓ Cloud server healthcheck operational.");

    // ─────────────────────────────────────────────────────────────────
    // Test 3: Customer Registration, OTP Verification & Trial Provisioning
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 3] Testing Customer Registration & Onboarding...");
    const testEmail = `tester_${Date.now()}@zynbill-phase3a.test`;
    const regRes = await httpRequest("POST", "/api/v1/auth/register", {
      companyName: "Phase3A Industrial Ltd",
      ownerName: "Sarah Connor",
      email: testEmail,
      phone: "9876543210",
      state: "Maharashtra",
      gstin: "27AAAAA0000A1Z5",
      password: "Password@123"
    });
    assert.strictEqual(regRes.status, 200);
    assert.strictEqual(regRes.data.ok, true);

    const otpRow = masterDb.prepare("SELECT * FROM otps WHERE email = ? ORDER BY created_at DESC LIMIT 1").get(testEmail);
    assert.ok(otpRow, "OTP record must be generated");
    assert.strictEqual(otpRow.code.length, 6);

    const verifyRes = await httpRequest("POST", "/api/v1/auth/verify-otp", {
      email: testEmail,
      otp: otpRow.code
    });
    assert.strictEqual(verifyRes.status, 200);
    assert.strictEqual(verifyRes.data.ok, true);

    const customer = masterDb.prepare("SELECT * FROM customers WHERE email = ?").get(testEmail);
    assert.ok(customer);
    assert.strictEqual(customer.status, "pending_approval", "Customer should be in pending_approval state after OTP");

    // Approve customer to active state
    masterDb.prepare("UPDATE customers SET status = 'active' WHERE id = ?").run(customer.id);
    console.log(`✓ Customer registered, verified OTP, and approved to active (ID: ${customer.id}).`);

    // ─────────────────────────────────────────────────────────────────
    // Test 4: Desktop Initiate Login & Device Authorization Flow
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 4] Testing Desktop Device Authorization Flow...");
    const initLoginRes = await httpRequest("POST", "/api/v1/auth/desktop-initiate-login", {
      email: testEmail,
      password: "Password@123",
      machineName: "Billing-Workstation-1"
    });
    assert.strictEqual(initLoginRes.status, 200);
    assert.strictEqual(initLoginRes.data.ok, true);
    assert.strictEqual(initLoginRes.data.requiresVerification, true);

    const deviceOtp = masterDb.prepare("SELECT * FROM otps WHERE email = ? ORDER BY created_at DESC LIMIT 1").get(testEmail);
    assert.ok(deviceOtp);

    const verifyDeviceRes = await httpRequest("POST", "/api/v1/auth/desktop-verify-device", {
      email: testEmail,
      code: deviceOtp.code,
      machineName: "Billing-Workstation-1"
    });
    assert.strictEqual(verifyDeviceRes.status, 200);
    assert.strictEqual(verifyDeviceRes.data.ok, true);
    assert.ok(verifyDeviceRes.data.token, "Must return device authentication token");
    const deviceToken = verifyDeviceRes.data.token;
    console.log("✓ Desktop device verified and issued token.");

    // Validate license with token
    const licRes = await httpRequest("GET", "/api/v1/auth/validate-license", null, deviceToken);
    assert.strictEqual(licRes.status, 200);
    assert.strictEqual(licRes.data.ok, true);
    assert.strictEqual(licRes.data.license.status, "active");
    console.log("✓ License validation verified via token.");

    // ─────────────────────────────────────────────────────────────────
    // Test 5: Standardized Sync Push & Acknowledgements
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 5] Testing Standardized Sync Push Contract & Acknowledgement...");
    const eventId1 = randomUUID();
    const idemKey1 = `idem_${Date.now()}_1`;
    const pushRes = await httpRequest("POST", "/api/v1/sync/push", {
      companyId: customer.id,
      deviceId: "dev_test_1",
      events: [
        {
          id: eventId1,
          entityType: "unit",
          entityId: "u_101",
          operation: "upsert",
          baseVersion: 0,
          idempotencyKey: idemKey1,
          payload: { name: "Phase3A Box", short_name: "bx" }
        }
      ]
    }, deviceToken);

    assert.strictEqual(pushRes.status, 200);
    assert.strictEqual(pushRes.data.ok, true);
    assert.strictEqual(pushRes.data.processedCount, 1);
    assert.ok(Array.isArray(pushRes.data.results), "Must return results array");
    assert.strictEqual(pushRes.data.results[0].id, eventId1);
    assert.strictEqual(pushRes.data.results[0].status, "accepted");
    assert.strictEqual(pushRes.data.results[0].serverVersion, 1);
    assert.ok(pushRes.data.acknowledgedIds.includes(eventId1));
    console.log("✓ Push response returned standardized results[] and acknowledgedIds[].");

    // ─────────────────────────────────────────────────────────────────
    // Test 6: Duplicate Event Prevention & Idempotency
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 6] Testing Idempotency & Duplicate Event Prevention...");
    const duplicatePushRes = await httpRequest("POST", "/api/v1/sync/push", {
      companyId: customer.id,
      deviceId: "dev_test_1",
      events: [
        {
          id: eventId1,
          entityType: "unit",
          entityId: "u_101",
          operation: "upsert",
          baseVersion: 0,
          idempotencyKey: idemKey1,
          payload: { name: "Phase3A Box", short_name: "bx" }
        }
      ]
    }, deviceToken);

    assert.strictEqual(duplicatePushRes.status, 200);
    assert.strictEqual(duplicatePushRes.data.results[0].id, eventId1);
    assert.strictEqual(duplicatePushRes.data.results[0].status, "already_applied", "Duplicate event must be marked already_applied");
    assert.strictEqual(duplicatePushRes.data.results[0].serverVersion, 1);

    const tenantDb = getTenantDb(customer.id);
    const rowCount = tenantDb.prepare("SELECT COUNT(*) as count FROM sync_events WHERE idempotency_key = ?").get(idemKey1);
    assert.strictEqual(rowCount.count, 1, "Duplicate push must not insert duplicate rows in sync_events");
    console.log("✓ Idempotency verified: duplicate push cleanly acknowledged as already_applied.");

    // ─────────────────────────────────────────────────────────────────
    // Test 7: Standardized Sync Pull & Casing Normalization
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 7] Testing Sync Pull & Field Casing Normalization...");
    const pullRes = await httpRequest("GET", "/api/v1/sync/pull?since=1970-01-01T00:00:00.000Z", null, deviceToken);
    assert.strictEqual(pullRes.status, 200);
    assert.strictEqual(pullRes.data.ok, true);
    assert.ok(Array.isArray(pullRes.data.changes), "Pull response must provide changes array");
    assert.ok(Array.isArray(pullRes.data.events), "Pull response must provide events array for backward compatibility");
    assert.ok(pullRes.data.cursor, "Pull response must provide latest cursor string");

    const pulledEvent = pullRes.data.changes.find((e) => e.id === eventId1 || e.eventId === eventId1);
    assert.ok(pulledEvent, "Pushed event must appear in pull response");
    assert.strictEqual(pulledEvent.eventId, eventId1);
    assert.strictEqual(pulledEvent.entityType, "unit");
    assert.strictEqual(pulledEvent.entityId, "u_101");
    assert.strictEqual(typeof pulledEvent.payload, "object", "Payload must be parsed object, not raw JSON string");
    assert.strictEqual(pulledEvent.payload.name, "Phase3A Box");
    assert.strictEqual(pulledEvent.serverVersion, 1);
    console.log("✓ Pull returned normalized camelCase event objects with parsed payload.");

    // ─────────────────────────────────────────────────────────────────
    // Test 8: End-to-End HttpSyncAdapter Integration with Local Database
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 8] Testing End-to-End HttpSyncAdapter & Local Sync Engine...");
    const fixture = await createFixture("gi-billing-phase3a-sync-");
    try {
      const adapter = new HttpSyncAdapter({
        baseUrl: TEST_SERVER_URL,
        getToken: () => deviceToken,
        getDeviceId: () => "dev_fixture_1"
      });

      const syncService = new SyncService({
        database,
        adapter,
        enabled: true,
        logger: { warn() {} }
      });

      // 1. Create a local unit
      database.createUnit({ name: "Adapter Test Unit" });
      const localStatusBefore = database.getSyncStatus();
      assert.strictEqual(localStatusBefore.queue.pending, 1, "Should have 1 pending outbox event");

      // 2. Perform syncNow()
      const syncResult = await syncService.syncNow();
      assert.strictEqual(Number(syncResult.queue.pending || 0), 0, "Outbox pending events must be 0 after successful push");
      assert.strictEqual(syncResult.queue.acknowledged, 1, "Outbox event must be acknowledged");

      // Verify server received the unit
      const serverEvents = tenantDb.prepare("SELECT * FROM sync_events WHERE entity_type = 'unit' AND payload LIKE '%Adapter Test Unit%'").all();
      assert.strictEqual(serverEvents.length, 1);
      console.log("✓ Local unit successfully pushed and acknowledged via HttpSyncAdapter.");

      // 3. Remote creation scenario: simulate another device creating a category on server
      const remoteEventId = randomUUID();
      const remoteIdem = `idem_remote_${Date.now()}`;
      tenantDb.prepare(`
        INSERT INTO sync_events (id, entity_type, entity_id, operation, payload, idempotency_key, client_timestamp, server_timestamp, server_version, device_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        remoteEventId,
        "item_category",
        randomUUID(),
        "upsert",
        JSON.stringify({ name: "Remote Clean Category" }),
        remoteIdem,
        new Date().toISOString(),
        new Date().toISOString(),
        1,
        "other_device_99"
      );

      // Pull down the remote category via syncNow()
      await syncService.syncNow();

      let inspected = await inspectDatabase(fixture.databasePath);
      const catRow = inspected.query("SELECT * FROM item_categories WHERE name = 'Remote Clean Category'");
      assert.strictEqual(catRow.length, 1, "Remote item category must be pulled and applied to local SQLite");
      const inboxRow = inspected.query("SELECT * FROM sync_inbox WHERE event_id = ?", [remoteEventId]);
      assert.strictEqual(inboxRow.length, 1, "Remote event must be recorded in sync_inbox");
      inspected.close();
      console.log("✓ Remote master change pulled, parsed, and applied to local SQLite database.");
    } finally {
      fixture.cleanup();
    }

    // ─────────────────────────────────────────────────────────────────
    // Test 9: Tenant Isolation Guarantee
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 9] Testing Multi-Tenant Data Isolation...");
    const tenant2Email = `tenant2_${Date.now()}@zynbill-phase3a.test`;
    await httpRequest("POST", "/api/v1/auth/register", {
      companyName: "Second Corp Ltd",
      ownerName: "John Connor",
      email: tenant2Email,
      phone: "9123456780",
      state: "Karnataka",
      gstin: "29AAAAA0000A1Z5",
      password: "Password@123"
    });
    const t2Otp = masterDb.prepare("SELECT code FROM otps WHERE email = ? ORDER BY created_at DESC LIMIT 1").get(tenant2Email).code;
    await httpRequest("POST", "/api/v1/auth/verify-otp", { email: tenant2Email, otp: t2Otp, code: t2Otp });
    masterDb.prepare("UPDATE customers SET status = 'active' WHERE email = ?").run(tenant2Email);
    await httpRequest("POST", "/api/v1/auth/desktop-initiate-login", { email: tenant2Email, password: "Password@123", machineName: "PC-2" });
    const t2DevOtp = masterDb.prepare("SELECT code FROM otps WHERE email = ? ORDER BY created_at DESC LIMIT 1").get(tenant2Email).code;
    const t2VerifyRes = await httpRequest("POST", "/api/v1/auth/desktop-verify-device", { email: tenant2Email, code: t2DevOtp, machineName: "PC-2" });
    const tenant2Token = t2VerifyRes.data.token;

    // Tenant 2 pulls: should NOT see Tenant 1's events
    const t2PullRes = await httpRequest("GET", "/api/v1/sync/pull?since=1970-01-01T00:00:00.000Z", null, tenant2Token);
    assert.strictEqual(t2PullRes.status, 200);
    const leakedEvent = (t2PullRes.data.changes || []).find((e) => e.eventId === eventId1);
    assert.strictEqual(leakedEvent, undefined, "Tenant 2 must NOT receive Tenant 1's sync events");
    console.log("✓ Tenant isolation verified: zero cross-tenant event leakage.");

    // ─────────────────────────────────────────────────────────────────
    // Test 10: PIN Reset Workflow via Server Endpoints
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 10] Testing In-App PIN Reset Request & Verification...");
    const pinReqRes = await httpRequest("POST", "/api/v1/auth/pin-reset-request", { email: testEmail });
    assert.strictEqual(pinReqRes.status, 200);
    assert.strictEqual(pinReqRes.data.ok, true);

    const pinOtp = masterDb.prepare("SELECT code FROM otps WHERE email = ? AND purpose = 'pin_reset' ORDER BY created_at DESC LIMIT 1").get(testEmail);
    assert.ok(pinOtp, "PIN reset OTP must exist");

    const pinVerifyRes = await httpRequest("POST", "/api/v1/auth/pin-reset-verify", { email: testEmail, code: pinOtp.code });
    assert.strictEqual(pinVerifyRes.status, 200);
    assert.strictEqual(pinVerifyRes.data.ok, true);
    console.log("✓ PIN reset dispatch and verification validated.");

    // ─────────────────────────────────────────────────────────────────
    // Test 11: App Update Check Endpoint
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 11] Testing Application Update Check Endpoint...");
    const updateRes = await httpRequest("GET", "/api/v1/updates/check");
    assert.strictEqual(updateRes.status, 200);
    assert.strictEqual(updateRes.data.ok, true);
    assert.ok(updateRes.data.latestVersion);
    console.log(`✓ Update check endpoint verified (reported latest version: ${updateRes.data.latestVersion}).`);

    // ─────────────────────────────────────────────────────────────────
    // Test 12: Main-Process Cloud Security & SSRF Protection Hardening
    // ─────────────────────────────────────────────────────────────────
    console.log("\n[Test 12] Testing Cloud IPC Security, SSRF Prevention & Production HTTPS Enforcement...");
    const mainJs = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");

    // 1. Verify SSRF protection against cloud metadata endpoints
    assert.ok(mainJs.includes("169.254.169.254"), "main.js must block AWS/Azure link-local metadata IP");
    assert.ok(mainJs.includes("metadata.google.internal"), "main.js must block GCP metadata host");

    // 2. Verify Production HTTPS enforcement
    assert.ok(mainJs.includes("parsed.protocol === \"http:\" && !isLocalOrLoopbackHost"), "main.js must restrict insecure HTTP for remote hosts in production");

    // 3. Verify endpoint restriction to /api/v1/*
    assert.ok(mainJs.includes('endpoint.startsWith("/api/v1/")'), "main.js must restrict cloud fetch endpoints to /api/v1/*");
    assert.ok(mainJs.includes("targetUrlObj.origin !== new URL(baseUrl).origin"), "main.js must verify constructed URL does not escape target origin");

    // 4. Verify timeout clamping and cleanup
    assert.ok(mainJs.includes("Math.min(Math.max("), "main.js must clamp timeout between safe bounds");
    assert.ok(mainJs.includes("clearTimeout(timer)"), "main.js must clear fetch timeout");
    assert.ok(mainJs.replace(/\r\n/g, "\n").includes("finally {\n    clearTimeout(timer);"), "main.js must clear fetch timeout in finally block");

    // 5. Verify IPC input validation regexes
    assert.ok(mainJs.includes("const EMAIL_REGEX ="), "main.js must validate email format for cloud IPC handlers");
    assert.ok(mainJs.includes("const SIX_DIGIT_REGEX ="), "main.js must enforce 6-digit format for device and PIN OTPs");

    // 6. Verify AUD-009 SSRF protections: IP classification, redirect prevention, and DNS rebinding checks
    assert.ok(mainJs.includes("classifyIpAddress"), "main.js must classify IP addresses for private and link-local ranges");
    assert.ok(mainJs.includes('redirect: "error"'), "main.js fetch must reject redirects to prevent redirect-based SSRF");
    assert.ok(mainJs.includes("dns.promises.lookup"), "main.js must verify DNS host resolution to prevent DNS rebinding");
    assert.ok(mainJs.includes("DNS rebinding rejected"), "main.js must reject domains that resolve to internal/private IPs in production");
    console.log("✓ Cloud IPC security, SSRF prevention, and HTTPS enforcement verified.");

    console.log("\n=======================================================");
    console.log("🎉 ALL 12 PHASE 3A CONNECTIVITY & SYNC TESTS PASSED 100%!");
    console.log("=======================================================\n");
  } finally {
    server.close();
  }
}

run().catch((err) => {
  console.error("\n❌ PHASE 3A TEST SUITE FAILED:", err);
  try { server.close(); } catch (_) {}
  process.exit(1);
});
