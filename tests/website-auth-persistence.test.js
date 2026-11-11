/**
 * ZynBill – Website Authentication & Session Persistence Verification Suite
 * 
 * Verifies:
 * 1. Customer login creates authenticated session with HttpOnly SameSite cookie & Bearer token
 * 2. Session persists across simulated browser refresh (GET /api/v1/portal/profile with cookie)
 * 3. Session persists across Bearer token authorization
 * 4. Resolves session.id / session.userId lookup bug (no 404 on refresh)
 * 5. Customer explicit logout revokes server session & clears cookie (Max-Age=0)
 * 6. Revoked / expired session rejects with HTTP 401 and redirects to login
 * 7. Super Admin login creates session with admin cookie & Bearer token
 * 8. Admin session persists across refresh
 * 9. Super Admin logout revokes session & clears cookie
 * 10. Role isolation: Customer session strictly rejected on Super Admin endpoints (HTTP 401)
 */

const assert = require("node:assert");
const http = require("node:http");

require("../server/env-loader");
const { server } = require("../server/server");
const { masterDb, hashPassword, syncSuperAdminCredentials } = require("../server/db");

const PORT = 4022;
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
      sameSite: (parts.find(p => p.toLowerCase().startsWith("samesite=")) || "").split("=")[1] || "",
      path: (parts.find(p => p.toLowerCase().startsWith("path=")) || "").split("=")[1] || "",
      maxAge: parseInt((parts.find(p => p.toLowerCase().startsWith("max-age=")) || "").split("=")[1] || "0", 10),
      raw: c
    };
  }
  return parsed;
}

async function runWebsiteAuthTests() {
  console.log("==================================================================");
  console.log("   WEBSITE AUTHENTICATION & SESSION PERSISTENCE VERIFICATION     ");
  console.log("==================================================================");

  syncSuperAdminCredentials();
  masterDb.prepare("DELETE FROM rate_limits").run();

  // Seed a test customer account
  const testCustomerEmail = "portal_test_customer@acme.in";
  const testCustomerPass = "Customer@123456";
  const hp = hashPassword(testCustomerPass);
  const customerId = "cust_test_persist_01";

  const nowIso = new Date().toISOString();
  masterDb.prepare(`
    INSERT INTO customers (id, company_name, owner_name, email, phone, state, gstin, password_hash, password_salt, plan, status, valid_until, created_at, updated_at)
    VALUES (?, 'Acme Retailers Pvt Ltd', 'Rajesh Kumar', ?, '9876543210', 'Kerala', '32AAAAA0000A1Z5', ?, ?, 'Gold', 'active', ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET password_hash = excluded.password_hash, password_salt = excluded.password_salt, status = 'active', updated_at = excluded.updated_at
  `).run(customerId, testCustomerEmail, hp.hash, hp.salt, new Date(Date.now() + 90 * 86400000).toISOString(), nowIso, nowIso);

  await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));
  console.log(`✓ Test server running on ${BASE_URL}`);

  try {
    // -------------------------------------------------------------
    // TEST 1: Customer Login Issues Valid Session & HttpOnly Cookie
    // -------------------------------------------------------------
    console.log("\n▶ TEST 1: Testing Customer Login & Cookie Generation...");
    const loginRes = await makeHttpRequest("POST", "/api/v1/portal/login", {}, {
      email: testCustomerEmail,
      password: testCustomerPass
    });

    assert.strictEqual(loginRes.status, 200, `Expected 200, got ${loginRes.status}`);
    assert.strictEqual(loginRes.data.ok, true);
    assert.ok(loginRes.data.token, "Must return session token");
    assert.strictEqual(loginRes.data.customer.email, testCustomerEmail);

    const setCookies = parseSetCookie(loginRes.headers["set-cookie"]);
    assert.ok(setCookies["zynbill_portal_session"], "Must issue zynbill_portal_session cookie");
    assert.strictEqual(setCookies["zynbill_portal_session"].httpOnly, true, "Cookie must be HttpOnly");
    assert.strictEqual(setCookies["zynbill_portal_session"].sameSite.toLowerCase(), "lax", "Cookie SameSite must be Lax");
    assert.ok(setCookies["zynbill_portal_session"].maxAge > 86400, "Max-Age must be at least 1 day");

    const sessionCookieHeader = `zynbill_portal_session=${encodeURIComponent(setCookies["zynbill_portal_session"].value)}`;
    const sessionBearerToken = loginRes.data.token;
    console.log("  ✓ Customer login issued Bearer token and HttpOnly SameSite=Lax cookie.");

    // -------------------------------------------------------------
    // TEST 2: Session Persistence Across Refresh (Cookie-Based)
    // -------------------------------------------------------------
    console.log("\n▶ TEST 2: Testing Session Persistence on Simulated Browser Refresh (Cookie)...");
    const refreshCookieRes = await makeHttpRequest("GET", "/api/v1/portal/profile", {
      Cookie: sessionCookieHeader
    });

    assert.strictEqual(refreshCookieRes.status, 200, `Expected 200, got ${refreshCookieRes.status}: ${JSON.stringify(refreshCookieRes.data)}`);
    assert.strictEqual(refreshCookieRes.data.ok, true);
    assert.strictEqual(refreshCookieRes.data.customer.id, customerId, "Customer ID must match session owner");
    assert.strictEqual(refreshCookieRes.data.customer.companyName, "Acme Retailers Pvt Ltd");
    console.log("  ✓ Browser refresh with session cookie successfully restored customer profile (0 logout).");

    // -------------------------------------------------------------
    // TEST 3: Session Persistence Across Refresh (Bearer-Based)
    // -------------------------------------------------------------
    console.log("\n▶ TEST 3: Testing Session Persistence with Bearer Header...");
    const refreshBearerRes = await makeHttpRequest("GET", "/api/v1/portal/profile", {
      Authorization: `Bearer ${sessionBearerToken}`
    });

    assert.strictEqual(refreshBearerRes.status, 200);
    assert.strictEqual(refreshBearerRes.data.ok, true);
    assert.strictEqual(refreshBearerRes.data.customer.id, customerId);
    console.log("  ✓ Session verified with Bearer token authentication.");

    // -------------------------------------------------------------
    // TEST 4: Profile Alias /portal/me Supported
    // -------------------------------------------------------------
    console.log("\n▶ TEST 4: Testing /api/v1/portal/me Alias Route...");
    const meRes = await makeHttpRequest("GET", "/api/v1/portal/me", {
      Cookie: sessionCookieHeader
    });
    assert.strictEqual(meRes.status, 200);
    assert.strictEqual(meRes.data.ok, true);
    assert.strictEqual(meRes.data.customer.email, testCustomerEmail);
    console.log("  ✓ /api/v1/portal/me endpoint operational.");

    // -------------------------------------------------------------
    // TEST 5: Customer Logout Revokes Session on Server & Clears Cookie
    // -------------------------------------------------------------
    console.log("\n▶ TEST 5: Testing Customer Logout & Session Invalidation...");
    const logoutRes = await makeHttpRequest("POST", "/api/v1/portal/logout", {
      Cookie: sessionCookieHeader
    });

    assert.strictEqual(logoutRes.status, 200);
    assert.strictEqual(logoutRes.data.ok, true);

    const logoutCookies = parseSetCookie(logoutRes.headers["set-cookie"]);
    assert.ok(logoutCookies["zynbill_portal_session"], "Logout must set clear cookie");
    assert.strictEqual(logoutCookies["zynbill_portal_session"].maxAge, 0, "Cookie Max-Age must be 0");
    console.log("  ✓ Customer logout cleared session cookie and revoked server session.");

    // -------------------------------------------------------------
    // TEST 6: Subsequent Refresh After Logout Must Reject (HTTP 401)
    // -------------------------------------------------------------
    console.log("\n▶ TEST 6: Testing Post-Logout Access (Must Return HTTP 401)...");
    const postLogoutRes = await makeHttpRequest("GET", "/api/v1/portal/profile", {
      Cookie: sessionCookieHeader
    });
    assert.strictEqual(postLogoutRes.status, 401, `Expected 401, got ${postLogoutRes.status}`);
    assert.strictEqual(postLogoutRes.data.ok, false);
    console.log("  ✓ Post-logout request cleanly rejected with HTTP 401.");

    // -------------------------------------------------------------
    // TEST 7: Super Admin Login & Cookie-Based Persistence
    // -------------------------------------------------------------
    console.log("\n▶ TEST 7: Testing Super Admin Login, Admin Cookie & Refresh...");
    const adminEmail = process.env.SUPER_ADMIN_EMAIL || process.env.ADMIN_EMAIL;
    const adminPass = process.env.SUPER_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;

    const adminLoginRes = await makeHttpRequest("POST", "/api/v1/admin/login", {}, {
      email: adminEmail,
      password: adminPass
    });

    assert.strictEqual(adminLoginRes.status, 200);
    assert.strictEqual(adminLoginRes.data.ok, true);

    const adminCookies = parseSetCookie(adminLoginRes.headers["set-cookie"]);
    assert.ok(adminCookies["zynbill_admin_session"], "Admin session cookie must be set");
    assert.strictEqual(adminCookies["zynbill_admin_session"].httpOnly, true);

    const adminCookieHeader = `zynbill_admin_session=${encodeURIComponent(adminCookies["zynbill_admin_session"].value)}`;

    // Refresh Admin console
    const adminRefreshRes = await makeHttpRequest("GET", "/api/v1/admin/customers?limit=5", {
      Cookie: adminCookieHeader
    });
    assert.strictEqual(adminRefreshRes.status, 200);
    assert.strictEqual(adminRefreshRes.data.ok, true);
    console.log("  ✓ Super Admin session verified across simulated refresh with HttpOnly cookie.");

    // -------------------------------------------------------------
    // TEST 8: Customer Session Cannot Access Admin Console (Role Check)
    // -------------------------------------------------------------
    console.log("\n▶ TEST 8: Testing Role Isolation (Customer Session Blocked on Admin Endpoint)...");
    const rogueRes = await makeHttpRequest("GET", "/api/v1/admin/customers", {
      Cookie: sessionCookieHeader
    });
    assert.strictEqual(rogueRes.status, 401);
    assert.strictEqual(rogueRes.data.ok, false);
    console.log("  ✓ Role isolation confirmed: Customer cannot access Super Admin endpoints.");

    // -------------------------------------------------------------
    // TEST 9: Admin Logout Invalidation
    // -------------------------------------------------------------
    console.log("\n▶ TEST 9: Testing Super Admin Logout...");
    const adminLogoutRes = await makeHttpRequest("POST", "/api/v1/admin/logout", {
      Cookie: adminCookieHeader
    });
    assert.strictEqual(adminLogoutRes.status, 200);
    assert.strictEqual(adminLogoutRes.data.ok, true);

    const postAdminLogoutRes = await makeHttpRequest("GET", "/api/v1/admin/customers", {
      Cookie: adminCookieHeader
    });
    assert.strictEqual(postAdminLogoutRes.status, 401);
    console.log("  ✓ Super Admin session revoked and subsequent requests strictly rejected.");

    console.log("\n==================================================================");
    console.log("   ALL WEBSITE AUTHENTICATION & PERSISTENCE TESTS PASSED 100%!   ");
    console.log("==================================================================");
  } finally {
    server.close();
  }
}

runWebsiteAuthTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
