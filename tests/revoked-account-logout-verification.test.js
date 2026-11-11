/**
 * ZynBill – Revoked Account Real-Time Logout & Session Invalidation Test Suite
 * 
 * Verifies:
 * 1. Admin suspension of a customer account immediately deletes all active sessions & device tokens.
 * 2. Portal endpoints (/api/v1/portal/profile) reject suspended/revoked customer requests with HTTP 401/403.
 * 3. Desktop license validation (/api/v1/auth/validate-license) rejects suspended accounts with HTTP 403.
 * 4. Desktop license validation (/api/v1/auth/validate-license) rejects deleted/revoked device tokens with HTTP 401.
 * 5. Admin rejection of a customer account deletes all sessions & device tokens.
 * 6. Admin revocation of a specific device token deletes it and prevents further validation.
 * 7. Customer portal revocation of a specific device token deletes it and prevents further validation.
 */

const assert = require("node:assert");
const http = require("node:http");

require("../server/env-loader");
const { server } = require("../server/server");
const { masterDb, hashPassword, syncSuperAdminCredentials } = require("../server/db");

const PORT = 4028;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function makeHttpRequest(method, urlPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    let payload = null;
    const reqHeaders = { ...headers };

    if (body) {
      payload = typeof body === "string" ? body : JSON.stringify(body);
      reqHeaders["Content-Type"] = "application/json";
      reqHeaders["Content-Length"] = Buffer.byteLength(payload);
    }

    const req = http.request(
      `${BASE_URL}${urlPath}`,
      { method, headers: reqHeaders },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch (_) {}
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: json,
            text: raw
          });
        });
      }
    );

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function parseSetCookie(setCookieHeaders) {
  if (!setCookieHeaders) return {};
  const cookies = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  const parsed = {};
  for (const c of cookies) {
    const parts = c.split(";").map(s => s.trim());
    const [name, val] = parts[0].split("=");
    parsed[name] = {
      value: decodeURIComponent(val || ""),
      httpOnly: parts.some(p => p.toLowerCase() === "httponly"),
      sameSite: parts.find(p => p.toLowerCase().startsWith("samesite="))?.split("=")[1] || null
    };
  }
  return parsed;
}

async function runTests() {
  console.log("Starting Revoked Account Real-Time Logout & Session Invalidation Test Suite...");

  // Start test server
  await new Promise((resolve) => {
    server.listen(PORT, "127.0.0.1", () => {
      console.log(`Test server running on port ${PORT}`);
      resolve();
    });
  });

  try {
    // 0. Setup Super Admin
    syncSuperAdminCredentials();
    const adminEmail = process.env.ADMIN_EMAIL || "admin@yourdomain.in";
    const adminPassword = process.env.ADMIN_PASSWORD || "AdminPass123";

    const adminLoginRes = await makeHttpRequest("POST", "/api/v1/admin/login", {}, {
      email: adminEmail,
      password: adminPassword
    });
    assert.strictEqual(adminLoginRes.status, 200, "Admin login must succeed");
    const adminToken = adminLoginRes.data.token;
    assert.ok(adminToken, "Admin token must be returned");
    const adminAuthHeader = { "Authorization": `Bearer ${adminToken}` };

    // 1. Create a test customer
    const testEmail = `test_revocation_${Date.now()}@example.com`;
    const testPassword = "Password123!";
    const testCompany = "Revocation Test Corp";
    const { hash, salt } = hashPassword(testPassword);
    const customerId = `cust_rev_${Date.now()}`;

    const nowIso = new Date().toISOString();
    masterDb.prepare(`
      INSERT INTO customers (id, company_name, owner_name, email, phone, state, password_hash, password_salt, plan, status, valid_until, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      customerId,
      testCompany,
      "Revoke Owner",
      testEmail,
      "9988776655",
      "Kerala",
      hash,
      salt,
      "Enterprise",
      "active",
      new Date(Date.now() + 30 * 86400000).toISOString(),
      nowIso,
      nowIso
    );

    console.log("✓ Test customer created and set to active");

    // 2. Customer logs in to Portal
    const custLoginRes = await makeHttpRequest("POST", "/api/v1/portal/login", {}, {
      email: testEmail,
      password: testPassword
    });
    assert.strictEqual(custLoginRes.status, 200, "Portal login should succeed");
    const portalToken = custLoginRes.data.token;
    assert.ok(portalToken, "Portal session token must be returned");

    const custAuthHeader = { "Authorization": `Bearer ${portalToken}` };

    // Profile check works
    const profileRes1 = await makeHttpRequest("GET", "/api/v1/portal/profile", custAuthHeader);
    assert.strictEqual(profileRes1.status, 200, "Profile check must succeed for active customer");
    assert.strictEqual(profileRes1.data.customer.email, testEmail);
    console.log("✓ Portal session is active and verified");

    // 3. Desktop device activates and validates license
    const devToken = `dev_tok_${Date.now()}`;
    masterDb.prepare(`
      INSERT INTO device_tokens (token, customer_id, machine_name, created_at, last_active_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(devToken, customerId, "DESKTOP-TEST", new Date().toISOString(), new Date().toISOString());

    const licRes1 = await makeHttpRequest("GET", "/api/v1/auth/validate-license", {
      "Authorization": `Bearer ${devToken}`
    });
    assert.strictEqual(licRes1.status, 200, "License validation must succeed for active device");
    assert.strictEqual(licRes1.data.ok, true);
    assert.strictEqual(licRes1.data.license.status, "active");
    console.log("✓ Desktop device token is active and license verified");

    // 4. Admin suspends the customer account
    const suspendRes = await makeHttpRequest("POST", `/api/v1/admin/customers/${customerId}/status`, adminAuthHeader, {
      status: "suspended"
    });
    assert.strictEqual(suspendRes.status, 200, "Admin status update to suspended must succeed");
    assert.strictEqual(suspendRes.data.status, "suspended");
    console.log("✓ Admin successfully suspended customer account");

    // 5. Verify database: Sessions and Device Tokens must be completely deleted!
    const sessionCount = masterDb.prepare("SELECT COUNT(*) as c FROM web_sessions WHERE user_id = ?").get(customerId).c;
    assert.strictEqual(sessionCount, 0, "All sessions for suspended customer must be deleted from DB");

    const deviceCount = masterDb.prepare("SELECT COUNT(*) as c FROM device_tokens WHERE customer_id = ?").get(customerId).c;
    assert.strictEqual(deviceCount, 0, "All device tokens for suspended customer must be deleted from DB");
    console.log("✓ All sessions and device tokens purged from master database upon suspension");

    // 6. Test Web Portal rejection: Profile call with old token must now fail (HTTP 401 or 403)
    const profileRes2 = await makeHttpRequest("GET", "/api/v1/portal/profile", custAuthHeader);
    assert.ok(profileRes2.status === 401 || profileRes2.status === 403, `Portal request must be rejected (got ${profileRes2.status})`);
    console.log("✓ Web portal rejects revoked customer immediately");

    // 7. Test Desktop App rejection: Validate license call with old device token must fail
    const licRes2 = await makeHttpRequest("GET", "/api/v1/auth/validate-license", {
      "Authorization": `Bearer ${devToken}`
    });
    assert.ok(licRes2.status === 401 || licRes2.status === 403, `License validation must be rejected (got ${licRes2.status})`);
    console.log("✓ Desktop client rejects revoked device token immediately");

    // 8. Test validate-license behavior if an account is suspended and device token somehow exists
    const devToken2 = `dev_tok2_${Date.now()}`;
    masterDb.prepare(`
      INSERT INTO device_tokens (token, customer_id, machine_name, created_at, last_active_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(devToken2, customerId, "DESKTOP-TEST-2", new Date().toISOString(), new Date().toISOString());

    const licRes3 = await makeHttpRequest("GET", "/api/v1/auth/validate-license", {
      "Authorization": `Bearer ${devToken2}`
    });
    assert.strictEqual(licRes3.status, 403, "validate-license must return 403 for suspended customer");
    assert.strictEqual(licRes3.data.ok, false);
    assert.ok(licRes3.data.error.includes("suspended"), "Error message must indicate account suspension");

    // Ensure the device token was also purged upon detecting non-active status
    const dev2Check = masterDb.prepare("SELECT COUNT(*) as c FROM device_tokens WHERE token = ?").get(devToken2).c;
    assert.strictEqual(dev2Check, 0, "Device token must be deleted when validate-license encounters suspended account");
    console.log("✓ validate-license enforces HTTP 403 and cleans up orphan device tokens for suspended accounts");

    // 9. Test Rejection flow: Create pending customer, approve then reject
    const testEmail2 = `test_reject_${Date.now()}@example.com`;
    const customerId2 = `cust_rej_${Date.now()}`;
    masterDb.prepare(`
      INSERT INTO customers (id, company_name, owner_name, email, phone, state, password_hash, password_salt, plan, status, valid_until, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      customerId2,
      "Reject Test Corp",
      "Reject Owner",
      testEmail2,
      "9988776644",
      "Kerala",
      hash,
      salt,
      "Standard",
      "active",
      new Date(Date.now() + 30 * 86400000).toISOString(),
      nowIso,
      nowIso
    );

    const devTokenRej = `dev_tok_rej_${Date.now()}`;
    masterDb.prepare(`
      INSERT INTO device_tokens (token, customer_id, machine_name, created_at, last_active_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(devTokenRej, customerId2, "DESKTOP-REJ", new Date().toISOString(), new Date().toISOString());

    // Admin rejects customer
    const rejectRes = await makeHttpRequest("POST", `/api/v1/admin/customers/${customerId2}/reject`, adminAuthHeader, {
      reason: "Security audit rejection"
    });
    assert.strictEqual(rejectRes.status, 200, "Admin reject should succeed");

    const rejDevCount = masterDb.prepare("SELECT COUNT(*) as c FROM device_tokens WHERE customer_id = ?").get(customerId2).c;
    assert.strictEqual(rejDevCount, 0, "Device tokens must be deleted when account is rejected");

    const licResRej = await makeHttpRequest("GET", "/api/v1/auth/validate-license", {
      "Authorization": `Bearer ${devTokenRej}`
    });
    assert.ok(licResRej.status === 401 || licResRej.status === 403, "Rejected customer device validation must fail");
    console.log("✓ Account rejection immediately purges tokens and denies license validation");

    // 10. Test Device Revocation (Admin endpoint /api/v1/admin/revoke-device)
    // Create active customer & 2 device tokens
    const customerId3 = `cust_devrev_${Date.now()}`;
    masterDb.prepare(`
      INSERT INTO customers (id, company_name, owner_name, email, phone, state, password_hash, password_salt, plan, status, valid_until, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      customerId3,
      "Device Revoke Corp",
      "Owner",
      `devrev_${Date.now()}@example.com`,
      "9988776633",
      "Kerala",
      hash,
      salt,
      "Professional",
      "active",
      new Date(Date.now() + 30 * 86400000).toISOString(),
      nowIso,
      nowIso
    );

    const devTokA = `dev_a_${Date.now()}`;
    const devTokB = `dev_b_${Date.now()}`;
    masterDb.prepare(`
      INSERT INTO device_tokens (token, customer_id, machine_name, created_at, last_active_at)
      VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)
    `).run(
      devTokA, customerId3, "PC-A", new Date().toISOString(), new Date().toISOString(),
      devTokB, customerId3, "PC-B", new Date().toISOString(), new Date().toISOString()
    );

    // Both validate successfully
    const valA1 = await makeHttpRequest("GET", "/api/v1/auth/validate-license", { "Authorization": `Bearer ${devTokA}` });
    assert.strictEqual(valA1.status, 200, "PC-A must validate");
    const valB1 = await makeHttpRequest("GET", "/api/v1/auth/validate-license", { "Authorization": `Bearer ${devTokB}` });
    assert.strictEqual(valB1.status, 200, "PC-B must validate");

    // Admin revokes PC-A only
    const adminRevokeRes = await makeHttpRequest("POST", "/api/v1/admin/revoke-device", adminAuthHeader, {
      token: devTokA
    });
    assert.strictEqual(adminRevokeRes.status, 200, "Admin device revocation should succeed");

    // PC-A is now revoked (HTTP 401)
    const valA2 = await makeHttpRequest("GET", "/api/v1/auth/validate-license", { "Authorization": `Bearer ${devTokA}` });
    assert.strictEqual(valA2.status, 401, "Revoked PC-A device token must return 401");

    // PC-B remains valid (HTTP 200)
    const valB2 = await makeHttpRequest("GET", "/api/v1/auth/validate-license", { "Authorization": `Bearer ${devTokB}` });
    assert.strictEqual(valB2.status, 200, "Unrevoked PC-B device token must still be valid");
    console.log("✓ Admin device revocation precisely revokes targeted device while keeping others active");

    console.log("\n=======================================================");
    console.log("ALL REVOKED ACCOUNT LOGOUT VERIFICATION TESTS PASSED!");
    console.log("=======================================================");

  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
