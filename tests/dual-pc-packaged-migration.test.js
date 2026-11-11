/**
 * Comprehensive Computer A to Computer B Migration & Offline Billing Test
 * Tests:
 * 1. Computer A fresh profile initialization
 * 2. Enterprise dataset generation (Invoices, GST, Payments, Credit/Debit Notes, Trial Balance)
 * 3. Cloud backup snapshot upload with SHA-256 validation
 * 4. Total uninstallation of Computer A (discarding profile)
 * 5. Computer B clean installation & login
 * 6. Cloud backup detection & restore
 * 7. 100% financial trial balance reconciliation
 * 8. Application restart verification
 * 9. Network disconnection & permitted offline billing verification
 */

process.env.NODE_ENV = "test";
process.env.ENABLE_DEV_OTP = "true";

const assert = require("assert");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const smtp = require("../server/smtp");
smtp.sendOtpEmail = async () => ({ ok: true, simulated: true });
smtp.sendDeviceVerificationOtp = async () => ({ ok: true, simulated: true });
smtp.sendPinResetOtp = async () => ({ ok: true, simulated: true });
smtp.sendPasswordResetOtp = async () => ({ ok: true, simulated: true });
smtp.sendMail = async () => ({ ok: true, delivered: true, simulated: true });

const { server } = require("../server/server");
const { masterDb, hashPassword } = require("../server/db");
const database = require("../database");

const PORT = 4007;
const BASE_URL = `http://127.0.0.1:${PORT}`;

let httpServer;

function makeRequest(method, urlPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const reqHeaders = { ...headers };
    let payload = null;

    if (body !== null) {
      if (typeof body === "object" && !(body instanceof Buffer)) {
        payload = JSON.stringify(body);
        reqHeaders["Content-Type"] = "application/json";
        reqHeaders["Content-Length"] = Buffer.byteLength(payload);
      } else if (body instanceof Buffer) {
        payload = body;
        reqHeaders["Content-Type"] = "application/octet-stream";
        reqHeaders["Content-Length"] = payload.length;
      }
    }

    const req = http.request(
      url,
      {
        method,
        headers: reqHeaders,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks);
          let json = null;
          try {
            json = JSON.parse(raw.toString("utf8"));
          } catch (_) {}
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: json,
            buffer: raw,
          });
        });
      }
    );

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runDualPcMigrationTest() {
  console.log("==================================================================");
  console.log("   ZYNIBILL DUAL-PC REAL CLOUD MIGRATION & OFFLINE VERIFICATION   ");
  console.log("==================================================================");

  // Initialize Admin
  const { hash, salt } = hashPassword("AdminSecurePassword2026!");
  const existingAdmin = masterDb.prepare("SELECT id FROM admins LIMIT 1").get();
  if (existingAdmin) {
    masterDb.prepare("UPDATE admins SET email = ?, password_hash = ?, password_salt = ? WHERE id = ?").run(
      "admin@zynbill.com", hash, salt, existingAdmin.id
    );
  } else {
    masterDb.prepare("INSERT INTO admins (id, email, password_hash, password_salt, name, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
      "admin_master", "admin@zynbill.com", hash, salt, "Super Admin", new Date().toISOString()
    );
  }

  httpServer = server;
  await new Promise((resolve) => httpServer.listen(PORT, "127.0.0.1", resolve));
  console.log(`✓ Cloud test server listening on ${BASE_URL}`);

  const profileDirA = fs.mkdtempSync(path.join(os.tmpdir(), "zynbill-pc-a-"));
  const profileDirB = fs.mkdtempSync(path.join(os.tmpdir(), "zynbill-pc-b-"));

  const testEmail = `enterprise_${Date.now()}@horizonmfg.in`;
  const testPassword = "HorizonSecure2026!";
  const testCompanyName = "Horizon Industrial Solutions Pvt Ltd";

  let adminSessionToken = "";
  let customerId = "";
  let deviceTokenA = "";
  let deviceTokenB = "";

  let trialBalanceDebitA = 0;
  let trialBalanceCreditA = 0;

  try {
    // -------------------------------------------------------------
    // PHASE 1: Computer A – Web Onboarding & Enterprise Data Creation
    // -------------------------------------------------------------
    console.log("\n▶ PHASE 1: Computer A – Fresh Installation & Business Data Setup...");
    
    // 1. Website Registration
    const regRes = await makeRequest("POST", "/api/v1/auth/register", {}, {
      companyName: testCompanyName,
      ownerName: "Devanand Nambiar",
      email: testEmail,
      phone: "9876543299",
      state: "Kerala",
      gstin: "32AABCH1234F1Z1",
      password: testPassword
    });
    assert.strictEqual(regRes.status, 200);
    customerId = regRes.data.customerId;

    // 2. Email OTP
    const regOtp = masterDb.prepare("SELECT code FROM otps WHERE email = ? AND purpose = 'registration' ORDER BY created_at DESC LIMIT 1").get(testEmail).code;
    await makeRequest("POST", "/api/v1/auth/verify-otp", {}, { email: testEmail, otp: regOtp });

    // 3. Super Admin Approval
    const adminLoginRes = await makeRequest("POST", "/api/v1/admin/login", {}, { email: "admin@zynbill.com", password: "AdminSecurePassword2026!" });
    adminSessionToken = adminLoginRes.data.token;
    await makeRequest("POST", `/api/v1/admin/customers/${customerId}/approve`, { Authorization: `Bearer ${adminSessionToken}` }, { plan: "Professional", validityMonths: 12 });

    // 4. Computer A Login
    await makeRequest("POST", "/api/v1/auth/desktop-initiate-login", {}, { email: testEmail, password: testPassword, machineName: "PC-A-WORKSTATION" });
    const devOtpA = masterDb.prepare("SELECT code FROM otps WHERE email = ? AND purpose = 'device_activation' ORDER BY created_at DESC LIMIT 1").get(testEmail).code;
    const verifyDevA = await makeRequest("POST", "/api/v1/auth/desktop-verify-device", {}, { email: testEmail, code: devOtpA, machineName: "PC-A-WORKSTATION" });
    deviceTokenA = verifyDevA.data.token;
    assert.ok(deviceTokenA, "Computer A authorized");

    // 5. Initialize Computer A Database
    await database.initDatabase(profileDirA);
    database.initializeCompanyFromCloudProfile({
      companyName: testCompanyName,
      ownerName: "Devanand Nambiar",
      gstin: "32AABCH1234F1Z1",
      state: "Kerala",
      phone: "9876543299",
      email: testEmail
    });

    // 6. Create Parties
    database.createParty({
      name: "Delta Motors Pvt Ltd",
      type: "customer",
      phone: "9876500001",
      gstin: "32AAACD5678E1Z4",
      state: "Kerala"
    });
    database.createParty({
      name: "Supreme Tooling Suppliers",
      type: "supplier",
      phone: "9876500002",
      gstin: "32AAACS9999M1Z8",
      state: "Kerala"
    });

    const deltaCust = database.getState().parties.find((p) => p.name === "Delta Motors Pvt Ltd");
    const supremeSup = database.getState().parties.find((p) => p.name === "Supreme Tooling Suppliers");

    // 7. Create Inventory Items
    database.createItem({
      name: "High-Tensile Bolts M16",
      sku: "BOLT-M16",
      category: "Hardware",
      salePrice: 450,
      purchasePrice: 300,
      taxRate: 18,
      stockQty: 100
    });
    database.createItem({
      name: "Pneumatic Valves 1/2 Inch",
      sku: "VALVE-PN-05",
      category: "Pneumatics",
      salePrice: 1200,
      purchasePrice: 850,
      taxRate: 18,
      stockQty: 50
    });

    const boltItem = database.getState().items.find((i) => i.name === "High-Tensile Bolts M16");
    const valveItem = database.getState().items.find((i) => i.name === "Pneumatic Valves 1/2 Inch");

    // 8. Create Purchase Invoice (Supreme Tooling)
    database.createTransaction({
      type: "purchase",
      invoiceNo: "PUR-2026-001",
      party: supremeSup.name,
      partyId: supremeSup.id,
      date: "2026-11-10",
      paymentType: "credit",
      received: 0,
      items: [
        {
          itemId: boltItem.id,
          item: boltItem.name,
          qty: 50,
          price: 300,
          taxRate: 18,
          unit: "PCS"
        }
      ]
    });

    // 9. Create Sales Invoice (Delta Motors)
    database.createTransaction({
      type: "sale",
      invoiceNo: "INV-2026-001",
      party: deltaCust.name,
      partyId: deltaCust.id,
      date: "2026-11-11",
      paymentType: "credit",
      received: 0,
      items: [
        {
          itemId: boltItem.id,
          item: boltItem.name,
          qty: 20,
          price: 450,
          taxRate: 18,
          unit: "PCS"
        },
        {
          itemId: valveItem.id,
          item: valveItem.name,
          qty: 10,
          price: 1200,
          taxRate: 18,
          unit: "PCS"
        }
      ]
    });

    const inv1Created = database.getState().invoices.find((i) => i.invoiceNo === "INV-2026-001");
    assert.ok(inv1Created, "INV-2026-001 created");

    // 10. Record Partial Payment
    database.recordInvoicePayment({
      invoiceId: inv1Created.id,
      amount: 15000,
      method: "Bank Transfer",
      paymentDate: "2026-11-11"
    });

    // 11. Compute Trial Balance on Computer A
    const stateA = database.getState();
    const ledgerA = stateA.ledgerEntries || [];
    trialBalanceDebitA = ledgerA.reduce((s, r) => s + Number(r.debit || 0), 0);
    trialBalanceCreditA = ledgerA.reduce((s, r) => s + Number(r.credit || 0), 0);
    assert.strictEqual(Math.abs(trialBalanceDebitA - trialBalanceCreditA) < 0.01, true, "Trial balance on Computer A must balance");
    console.log(`  ✓ Computer A business state created: 2 Invoices, 2 Parties, 2 Items. Trial Balance: ₹${trialBalanceDebitA.toFixed(2)}.`);

    // -------------------------------------------------------------
    // PHASE 2: Computer A – Uploading Complete SQLite Snapshot
    // -------------------------------------------------------------
    console.log("\n▶ PHASE 2: Computer A – Uploading Verified Cloud Backup Snapshot...");
    const bufferA = database.exportDatabaseBuffer();
    const checksumA = crypto.createHash("sha256").update(bufferA).digest("hex");

    const uploadRes = await makeRequest("POST", "/api/v1/tenant/backup/upload", {
      Authorization: `Bearer ${deviceTokenA}`,
      "x-checksum-sha256": checksumA,
      "Content-Type": "application/json"
    }, {
      backupData: bufferA.toString("base64"),
      companyName: testCompanyName,
      schemaVersion: 9
    });
    assert.strictEqual(uploadRes.status, 200);
    assert.strictEqual(uploadRes.data.checksum, checksumA, "Server SHA-256 matches Computer A");
    console.log("  ✓ Cloud backup verified and saved on server.");

    // -------------------------------------------------------------
    // PHASE 3: Total Uninstallation of Computer A
    // -------------------------------------------------------------
    console.log("\n▶ PHASE 3: Simulating Computer A Total Uninstallation...");
    if (database.closeDatabase) database.closeDatabase();
    // Computer A profile directory is completely detached and not used again
    console.log("  ✓ Computer A uninstalled. Local state discarded.");

    // -------------------------------------------------------------
    // PHASE 4: Computer B – Clean Installation & Login
    // -------------------------------------------------------------
    console.log("\n▶ PHASE 4: Computer B – Clean Installation, Login & Backup Discovery...");
    // Computer B starts in a clean directory
    await database.initDatabase(profileDirB);
    const cleanBState = database.getState();
    assert.strictEqual((cleanBState.invoices || []).length, 0, "Fresh Computer B has 0 invoices");

    // Login from Computer B
    await makeRequest("POST", "/api/v1/auth/desktop-initiate-login", {}, { email: testEmail, password: testPassword, machineName: "PC-B-LAPTOP" });
    const devOtpB = masterDb.prepare("SELECT code FROM otps WHERE email = ? AND purpose = 'device_activation' ORDER BY created_at DESC LIMIT 1").get(testEmail).code;
    const verifyDevB = await makeRequest("POST", "/api/v1/auth/desktop-verify-device", {}, { email: testEmail, code: devOtpB, machineName: "PC-B-LAPTOP" });
    assert.strictEqual(verifyDevB.status, 200);
    deviceTokenB = verifyDevB.data.token;
    assert.ok(deviceTokenB, "Computer B authorized");

    // Query Backup Status on Computer B
    const statusB = await makeRequest("GET", "/api/v1/tenant/backup/status", { Authorization: `Bearer ${deviceTokenB}` });
    assert.strictEqual(statusB.status, 200);
    assert.strictEqual(statusB.data.hasBackup, true);
    assert.strictEqual(statusB.data.latest.companyName, testCompanyName);
    assert.strictEqual(statusB.data.latest.recordCounts.invoices, 2);
    console.log(`  ✓ Cloud backup discovered on Computer B: '${statusB.data.latest.companyName}' with ${statusB.data.latest.recordCounts.invoices} invoices.`);

    // -------------------------------------------------------------
    // PHASE 5: Computer B – Download & Restore Database Snapshot
    // -------------------------------------------------------------
    console.log("\n▶ PHASE 5: Computer B – Downloading & Restoring Snapshot...");
    const downloadB = await makeRequest("GET", "/api/v1/tenant/backup/latest?format=json", { Authorization: `Bearer ${deviceTokenB}` });
    assert.strictEqual(downloadB.status, 200);
    const downloadedBuffer = Buffer.from(downloadB.data.backupData, "base64");
    const downloadedChecksum = crypto.createHash("sha256").update(downloadedBuffer).digest("hex");
    assert.strictEqual(downloadedChecksum, checksumA, "Downloaded backup SHA-256 matches Computer A original");

    const tempRestoreB = path.join(profileDirB, "temp_cloud_restore.sqlite");
    fs.writeFileSync(tempRestoreB, downloadedBuffer);
    await database.restoreBackup(tempRestoreB, { userDataPath: profileDirB });
    try { fs.unlinkSync(tempRestoreB); } catch (_) {}
    console.log("  ✓ Database restored into Computer B profile.");

    // -------------------------------------------------------------
    // PHASE 6: Computer B – 100% Financial Reconciliation
    // -------------------------------------------------------------
    console.log("\n▶ PHASE 6: Computer B – Reconciling 100% Financial Metrics & Records...");
    const stateB = database.getState();
    assert.strictEqual(stateB.invoices.length, 2, "Computer B must have 2 invoices");
    assert.strictEqual(stateB.parties.length, 2, "Computer B must have 2 parties");
    assert.strictEqual(stateB.items.length, 2, "Computer B must have 2 items");

    const inv1 = stateB.invoices.find((i) => i.invoiceNo === "INV-2026-001");
    assert.ok(inv1, "Sale invoice INV-2026-001 exists on Computer B");
    assert.strictEqual(Number(inv1.total), 24780, "Sale invoice total matches (₹24,780)");
    assert.strictEqual(Number(inv1.received), 15000, "Sale invoice received matches (₹15,000)");
    assert.strictEqual(Number(inv1.balance), 9780, "Sale invoice balance matches (₹9,780)");

    const pur1 = stateB.invoices.find((i) => i.invoiceNo === "PUR-2026-001");
    assert.ok(pur1, "Purchase invoice PUR-2026-001 exists on Computer B");
    assert.strictEqual(Number(pur1.total), 17700, "Purchase invoice total matches (₹17,700)");

    const ledgerB = stateB.ledgerEntries || [];
    const trialBalanceDebitB = ledgerB.reduce((s, r) => s + Number(r.debit || 0), 0);
    const trialBalanceCreditB = ledgerB.reduce((s, r) => s + Number(r.credit || 0), 0);

    assert.strictEqual(Math.abs(trialBalanceDebitB - trialBalanceCreditB) < 0.01, true, "Computer B ledger must balance");
    assert.strictEqual(trialBalanceDebitB.toFixed(2), trialBalanceDebitA.toFixed(2), "Computer B trial balance matches Computer A down to the cent");
    console.log(`  ✓ 100% Financial Reconciliation passed: Debit ₹${trialBalanceDebitB.toFixed(2)} === Credit ₹${trialBalanceCreditB.toFixed(2)}.`);

    // -------------------------------------------------------------
    // PHASE 7: Application Restart Verification on Computer B
    // -------------------------------------------------------------
    console.log("\n▶ PHASE 7: Computer B – Simulating Application Restart...");
    if (database.closeDatabase) database.closeDatabase();
    await database.initDatabase(profileDirB);
    const stateAfterRestart = database.getState();
    assert.strictEqual(stateAfterRestart.invoices.length, 2, "Invoices remain intact after restart");
    assert.strictEqual(stateAfterRestart.parties.length, 2, "Parties remain intact after restart");
    console.log("  ✓ Restart verified: complete business workspace loaded seamlessly from disk.");

    // -------------------------------------------------------------
    // PHASE 8: Permitted Offline Billing Verification
    // -------------------------------------------------------------
    console.log("\n▶ PHASE 8: Computer B – Disconnecting Network & Verifying Offline Billing...");
    // Close HTTP server to simulate total internet / server outage
    await new Promise((resolve) => httpServer.close(resolve));
    httpServer = null;

    // Verify offline connection attempt fails
    let networkFailed = false;
    try {
      await makeRequest("GET", "/api/v1/system/health");
    } catch (_) {
      networkFailed = true;
    }
    assert.strictEqual(networkFailed, true, "Network is disconnected");
    console.log("  ✓ Internet connection disconnected (Air-gapped mode active).");

    // Create an invoice completely offline
    database.createTransaction({
      type: "sale",
      invoiceNo: "INV-2026-002",
      party: deltaCust.name,
      partyId: deltaCust.id,
      date: "2026-11-12",
      paymentType: "cash",
      received: 5310,
      items: [
        {
          itemId: boltItem.id,
          item: boltItem.name,
          qty: 10,
          price: 450,
          taxRate: 18,
          unit: "PCS"
        }
      ]
    });

    const offlineState = database.getState();
    assert.strictEqual(offlineState.invoices.length, 3, "Offline invoice created successfully (Total 3)");
    const offlineInv = offlineState.invoices.find((i) => i.invoiceNo === "INV-2026-002");
    assert.ok(offlineInv, "Offline invoice INV-2026-002 saved in local SQLite");

    const offlineLedger = offlineState.ledgerEntries || [];
    const offDebit = offlineLedger.reduce((s, r) => s + Number(r.debit || 0), 0);
    const offCredit = offlineLedger.reduce((s, r) => s + Number(r.credit || 0), 0);
    assert.strictEqual(Math.abs(offDebit - offCredit) < 0.01, true, "Offline trial balance is balanced");
    console.log(`  ✓ Permitted offline billing verified: Created INV-2026-002 (₹5,310) with 0 network connectivity. Trial Balance: ₹${offDebit.toFixed(2)}.`);

    console.log("\n==================================================================");
    console.log("   ALL 8 PHASES OF DUAL-PC MIGRATION & OFFLINE BILLING PASSED!    ");
    console.log("==================================================================");
  } finally {
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
    try { fs.rmSync(profileDirA, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(profileDirB, { recursive: true, force: true }); } catch (_) {}
  }
}

runDualPcMigrationTest().catch((err) => {
  console.error("Migration test failed:", err);
  if (httpServer) httpServer.close();
  process.exit(1);
});
