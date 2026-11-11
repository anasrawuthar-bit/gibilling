/**
 * ZynBill – Website Zero-Flicker & Customer Portal UX Verification Suite
 * 
 * Verifies:
 * 1. Zero-Flicker Pre-Auth Guard in portal.html: loginCard has 'hidden' class by default.
 * 2. Preloader element (portalAuthLoader) is present in portal.html.
 * 3. All real-time analytics DOM elements (rptTotalSales, rptTotalPurchases, rptTotalReceivables, rptCatalogCount, rptTransactionsWrap) are present.
 * 4. API endpoint /api/v1/portal/reports returns valid 200 response with financial metrics for customer session.
 * 5. Landing page (landing.html) contains dynamic session-aware nav container (siteNavActions).
 */

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

require("../server/env-loader");
const { server } = require("../server/server");
const { masterDb, hashPassword, getTenantDb } = require("../server/db");

const PORT = 4031;
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

async function runTests() {
  console.log("Starting Website Zero-Flicker & Customer Portal UX Test Suite...");

  // 1. Static HTML Inspections
  const portalHtmlPath = path.join(__dirname, "../server/public/portal.html");
  const portalHtml = fs.readFileSync(portalHtmlPath, "utf8");

  const landingHtmlPath = path.join(__dirname, "../server/public/landing.html");
  const landingHtml = fs.readFileSync(landingHtmlPath, "utf8");

  // Check 1: loginCard MUST have 'hidden' class by default to eliminate flicker on refresh
  assert.ok(
    portalHtml.includes('id="loginCard"') && portalHtml.includes('class="login-container hidden" id="loginCard"'),
    "loginCard must have class='login-container hidden' by default to prevent flashing on refresh"
  );
  console.log("✓ loginCard starts hidden by default (Zero-Flicker / Zero-FOUC architecture)");

  // Check 2: portalAuthLoader preloader is present
  assert.ok(
    portalHtml.includes('id="portalAuthLoader"'),
    "portal.html must have #portalAuthLoader preloader screen"
  );
  console.log("✓ Preloader screen #portalAuthLoader present in portal.html");

  // Check 3: Pre-auth check script is present
  assert.ok(
    portalHtml.includes("preAuthCheck()"),
    "portal.html must include preAuthCheck() for immediate auth state evaluation"
  );
  console.log("✓ Pre-auth guard script verified");

  // Check 4: Analytics DOM nodes exist
  const requiredIds = [
    'rptTotalSales',
    'rptSalesCount',
    'rptTotalPurchases',
    'rptPurchasesCount',
    'rptTotalReceivables',
    'rptDueParties',
    'rptCatalogCount',
    'rptPartiesCount',
    'rptTransactionsWrap'
  ];

  for (const id of requiredIds) {
    assert.ok(
      portalHtml.includes(`id="${id}"`),
      `portal.html must contain DOM element with id="${id}"`
    );
  }
  console.log("✓ All 9 analytics & recent transaction DOM elements present in portal.html");

  // Check 5: Landing page dynamic nav actions
  assert.ok(
    landingHtml.includes('id="siteNavActions"'),
    "landing.html must have #siteNavActions container for session-aware navigation"
  );
  assert.ok(
    landingHtml.includes("zynbill_portal_token"),
    "landing.html must check for active customer session"
  );
  console.log("✓ Landing page dynamic session-aware navigation verified");

  // 2. Server API Verification
  await new Promise((resolve) => {
    server.listen(PORT, "127.0.0.1", () => {
      console.log(`Test server running on port ${PORT}`);
      resolve();
    });
  });

  try {
    // Create test customer
    const testEmail = `ux_test_${Date.now()}@example.com`;
    const testPassword = "Password123!";
    const customerId = `cust_ux_${Date.now()}`;
    const { hash, salt } = hashPassword(testPassword);
    const nowIso = new Date().toISOString();

    masterDb.prepare(`
      INSERT INTO customers (id, company_name, owner_name, email, phone, state, password_hash, password_salt, plan, status, valid_until, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      customerId,
      "UX Test Enterprise",
      "UX Owner",
      testEmail,
      "9876543210",
      "Kerala",
      hash,
      salt,
      "Enterprise",
      "active",
      new Date(Date.now() + 30 * 86400000).toISOString(),
      nowIso,
      nowIso
    );

    // Seed sample transactions in isolated tenant database
    const tenantDb = getTenantDb(customerId);
    tenantDb.prepare(`
      INSERT INTO transactions (id, invoice_no, type, party_name, total_amount, tax_amount, status, transaction_date, updated_at)
      VALUES 
        ('tx_1', 'INV-001', 'sale', 'Acme Corp', 15000.0, 2700.0, 'completed', '${nowIso}', '${nowIso}'),
        ('tx_2', 'INV-002', 'sale', 'Global Retail', 8500.0, 1530.0, 'completed', '${nowIso}', '${nowIso}'),
        ('tx_3', 'BILL-001', 'purchase', 'Wholesale Dist', 12000.0, 2160.0, 'completed', '${nowIso}', '${nowIso}')
    `).run();

    // Login via portal API
    const loginRes = await makeHttpRequest("POST", "/api/v1/portal/login", {}, {
      email: testEmail,
      password: testPassword
    });
    assert.strictEqual(loginRes.status, 200, "Portal login should succeed");
    const portalToken = loginRes.data.token;
    assert.ok(portalToken, "Token must be returned");

    // Fetch reports API
    const reportsRes = await makeHttpRequest("GET", "/api/v1/portal/reports", {
      "Authorization": `Bearer ${portalToken}`
    });
    assert.strictEqual(reportsRes.status, 200, "Reports endpoint must return 200");
    assert.strictEqual(reportsRes.data.ok, true);
    assert.strictEqual(reportsRes.data.reports.totalSales, 23500);
    assert.strictEqual(reportsRes.data.reports.salesCount, 2);
    assert.strictEqual(reportsRes.data.reports.totalPurchases, 12000);
    assert.strictEqual(reportsRes.data.reports.purchaseCount, 1);
    assert.strictEqual(reportsRes.data.reports.recentTransactions.length, 3);
    console.log("✓ /api/v1/portal/reports returns live tenant sales & purchase data accurately");

    // Test GET /portal route
    const portalPageRes = await makeHttpRequest("GET", "/portal");
    assert.strictEqual(portalPageRes.status, 200, "/portal route must return HTTP 200");
    assert.ok(portalPageRes.text.includes("login-container hidden"), "Served /portal page has loginCard hidden");
    console.log("✓ Served /portal page confirms zero-flicker HTML delivery");

    console.log("\n=======================================================");
    console.log("ALL WEBSITE ZERO-FLICKER & PORTAL UX TESTS PASSED 100%!");
    console.log("=======================================================");
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
