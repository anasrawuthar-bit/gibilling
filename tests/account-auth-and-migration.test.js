process.env.NODE_ENV = "test";
const assert = require("assert");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const smtp = require("../server/smtp");
// Hermetic SMTP stubs so external network sockets are never opened during test
smtp.sendOtpEmail = async () => ({ ok: true, simulated: true });
smtp.sendDeviceVerificationOtp = async () => ({ ok: true, simulated: true });
smtp.sendPinResetOtp = async () => ({ ok: true, simulated: true });
smtp.sendPasswordResetOtp = async () => ({ ok: true, simulated: true });
smtp.sendMail = async () => ({ ok: true, delivered: true, simulated: true });

const { server } = require("../server/server");
const database = require("../database");

const PORT = 4005;
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

async function runAuditTests() {
  console.log("==================================================================");
  console.log("  ZYNIBILL ACCOUNT AUTH, SUBSCRIPTION & CLOUD MIGRATION E2E TEST  ");
  console.log("==================================================================");

  // Start cloud server on dedicated test port
  const { masterDb, hashPassword } = require("../server/db");
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

  const testEmail = `test_${Date.now()}@zenithmfg.com`;
  const testPassword = "EnterprisePassword2026!";
  const testCompanyName = "Zenith Precision Tools Pvt Ltd";
  let customerId = "";
  let registeredOtp = "";
  let adminSessionToken = "";
  let deviceTokenA = "";
  let deviceTokenB = "";

  const dirA = fs.mkdtempSync(path.join(os.tmpdir(), "zynbill-comp-a-"));
  const dirB = fs.mkdtempSync(path.join(os.tmpdir(), "zynbill-comp-b-"));

  try {
    // -------------------------------------------------------------
    // STEP 1: Customer Registration on Website
    // -------------------------------------------------------------
    console.log("\n▶ STEP 1: Testing Website Registration (Email, Business Info, Password)...");
    const regRes = await makeRequest("POST", "/api/v1/auth/register", {}, {
      companyName: testCompanyName,
      ownerName: "Arjun Nair",
      email: testEmail,
      phone: "9876543210",
      state: "Kerala",
      gstin: "32ABCDE1234F1Z5",
      password: testPassword,
    });
    assert.strictEqual(regRes.status, 200, `Registration status should be 200, got ${regRes.status}`);
    assert.strictEqual(regRes.data.ok, true, "Registration should succeed");
    customerId = regRes.data.customerId;
    assert.ok(customerId, "CustomerId should be generated");

    // Fetch generated OTP from masterDb directly (simulating email delivery)
    const otpRow = masterDb.prepare("SELECT code FROM otps WHERE email = ? AND purpose = 'registration' ORDER BY created_at DESC LIMIT 1").get(testEmail);
    assert.ok(otpRow, "Registration OTP record should be in database");
    registeredOtp = otpRow.code;
    console.log(`  ✓ Registered account for '${testCompanyName}'. OTP dispatched.`);

    // -------------------------------------------------------------
    // STEP 2: Email OTP Verification
    // -------------------------------------------------------------
    console.log("\n▶ STEP 2: Testing Email OTP Verification...");
    const verifyOtpRes = await makeRequest("POST", "/api/v1/auth/verify-otp", {}, {
      email: testEmail,
      otp: registeredOtp,
    });
    assert.strictEqual(verifyOtpRes.status, 200);
    assert.strictEqual(verifyOtpRes.data.ok, true);
    assert.strictEqual(verifyOtpRes.data.status, "pending_approval");

    const custStatus = masterDb.prepare("SELECT status FROM customers WHERE email = ?").get(testEmail);
    assert.strictEqual(custStatus.status, "pending_approval", "Customer status must be pending_approval");
    console.log("  ✓ Email verified. Account placed in 'pending_approval' state.");

    // -------------------------------------------------------------
    // STEP 3: Desktop Login Attempt While Pending Approval
    // -------------------------------------------------------------
    console.log("\n▶ STEP 3: Testing Desktop Login While Pending Approval (Must be Blocked)...");
    const blockedLoginRes = await makeRequest("POST", "/api/v1/auth/desktop-initiate-login", {}, {
      email: testEmail,
      password: testPassword,
      machineName: "PC-A-WORKSTATION",
    });
    assert.strictEqual(blockedLoginRes.status, 403, "Login must be forbidden for pending_approval accounts");
    assert.strictEqual(blockedLoginRes.data.ok, false);
    assert.strictEqual(blockedLoginRes.data.status, "pending_approval");
    console.log("  ✓ Desktop login correctly blocked with HTTP 403 for unapproved account.");

    // -------------------------------------------------------------
    // STEP 4: Super Admin Login & Account Approval + Plan Assignment
    // -------------------------------------------------------------
    console.log("\n▶ STEP 4: Testing Super Admin Approval & Plan Assignment...");
    const adminLoginRes = await makeRequest("POST", "/api/v1/admin/login", {}, {
      email: "admin@zynbill.com",
      password: "AdminSecurePassword2026!",
    });
    assert.strictEqual(adminLoginRes.status, 200);
    adminSessionToken = adminLoginRes.data.token;
    assert.ok(adminSessionToken, "Admin session token returned");

    // Approve customer under "Professional" plan
    const approveRes = await makeRequest(
      "POST",
      `/api/v1/admin/customers/${customerId}/approve`,
      { Authorization: `Bearer ${adminSessionToken}` },
      { plan: "Professional", validityMonths: 12 }
    );
    assert.strictEqual(approveRes.status, 200);
    assert.strictEqual(approveRes.data.ok, true);

    const approvedCust = masterDb.prepare("SELECT status, plan, valid_until FROM customers WHERE id = ?").get(customerId);
    assert.strictEqual(approvedCust.status, "active", "Account status must be active");
    assert.strictEqual(approvedCust.plan, "Professional", "Plan must be Professional");
    console.log("  ✓ Super Admin approved account and assigned Professional subscription.");

    // -------------------------------------------------------------
    // STEP 5: Desktop Step 1 – Initiate Login & Receive Device Code
    // -------------------------------------------------------------
    console.log("\n▶ STEP 5: Testing Desktop First Login on Computer A (Initiate Login)...");
    const initLoginRes = await makeRequest("POST", "/api/v1/auth/desktop-initiate-login", {}, {
      email: testEmail,
      password: testPassword,
      machineName: "PC-A-WORKSTATION",
    });
    assert.strictEqual(initLoginRes.status, 200);
    assert.strictEqual(initLoginRes.data.requiresVerification, true);

    const deviceOtpRow = masterDb.prepare("SELECT code FROM otps WHERE email = ? AND purpose = 'device_activation' ORDER BY created_at DESC LIMIT 1").get(testEmail);
    assert.ok(deviceOtpRow, "Device authorization OTP record created");
    const deviceOtp = deviceOtpRow.code;
    console.log("  ✓ Desktop login credentials validated. Device authorization code dispatched.");

    // -------------------------------------------------------------
    // STEP 6: Desktop Step 2 – Submit Device Code & Activate Terminal
    // -------------------------------------------------------------
    console.log("\n▶ STEP 6: Testing Desktop Device Verification on Computer A...");
    const verifyDeviceRes = await makeRequest("POST", "/api/v1/auth/desktop-verify-device", {}, {
      email: testEmail,
      code: deviceOtp,
      machineName: "PC-A-WORKSTATION",
    });
    assert.strictEqual(verifyDeviceRes.status, 200);
    assert.strictEqual(verifyDeviceRes.data.ok, true);
    deviceTokenA = verifyDeviceRes.data.token;
    assert.ok(deviceTokenA, "Device token issued");
    assert.strictEqual(verifyDeviceRes.data.customer.plan, "Professional");
    console.log("  ✓ Terminal authorized. Device token issued.");

    // -------------------------------------------------------------
    // STEP 7: Computer A First Login – Automatic Profile Initialization
    // -------------------------------------------------------------
    console.log("\n▶ STEP 7: Initializing Local Company Database on Computer A from Cloud Profile...");
    await database.initDatabase(dirA);
    const stateA = database.initializeCompanyFromCloudProfile(verifyDeviceRes.data.customer);
    assert.strictEqual(stateA.activeCompany, testCompanyName, "Active company must match registered company name");
    const compA = database.getCurrentCompany();
    assert.strictEqual(compA.name, testCompanyName);
    console.log(`  ✓ Local company initialized cleanly for '${testCompanyName}' without dummy demo data.`);

    // -------------------------------------------------------------
    // STEP 8: Computer A – Record Real Business Transactions
    // -------------------------------------------------------------
    console.log("\n▶ STEP 8: Creating Real Business Data on Computer A (Invoices, Items, Parties, Ledger)...");
    database.createParty({
      name: "Apex Engineering Corp",
      type: "customer",
      phone: "9123456789",
      state: "Kerala",
      gstin: "32ABCDE9999F1Z1",
    });
    const partyA = database.getState().parties.find((p) => p.name === "Apex Engineering Corp");
    assert.ok(partyA, "Customer party created");

    database.createItem({
      name: "Hydraulic Pump HP-500",
      itemType: "product",
      sku: "PUMP-HP500",
      salePrice: 12000,
      purchasePrice: 8000,
      openingStock: 25,
      taxRate: 18,
    });
    const itemA = database.getState().items.find((i) => i.name === "Hydraulic Pump HP-500");
    assert.ok(itemA, "Inventory item created");

    // Create Invoice INV-2026-001 (5 units @ 12000 + 18% GST = ₹70,800)
    database.createTransaction({
      type: "sale",
      party: partyA.name,
      partyId: partyA.id,
      invoiceNo: "INV-2026-001",
      date: "2026-11-11",
      paymentType: "credit",
      received: 0,
      items: [
        {
          itemId: itemA.id,
          item: itemA.name,
          qty: 5,
          unit: "PCS",
          price: 12000,
          discount: 0,
          taxRate: 18,
          hsnSac: "8413",
        },
      ],
    });

    // Record partial payment of ₹50,000
    const invA = database.getState().invoices.find((i) => i.invoiceNo === "INV-2026-001");
    assert.ok(invA, "Invoice INV-2026-001 created");
    assert.strictEqual(Number(invA.total), 70800, "Invoice total must be ₹70,800");

    database.recordInvoicePayment({
      invoiceId: invA.id,
      amount: 50000,
      method: "Bank Transfer",
      paymentDate: "2026-11-11",
    });

    const stateAAfterPayment = database.getState();
    const updatedInvA = stateAAfterPayment.invoices.find((i) => i.id === invA.id);
    assert.strictEqual(Number(updatedInvA.received), 50000);
    assert.strictEqual(Number(updatedInvA.balance), 20800);

    // Verify stock decremented: 25 - 5 = 20
    const updatedItemA = stateAAfterPayment.items.find((i) => i.id === itemA.id);
    assert.strictEqual(Number(updatedItemA.currentStock), 20, "Stock balance must be 20 PCS");

    // Verify double-entry ledger balance
    const ledgerA = stateAAfterPayment.ledgerEntries;
    const debitA = ledgerA.reduce((sum, r) => sum + Number(r.debit || 0), 0);
    const creditA = ledgerA.reduce((sum, r) => sum + Number(r.credit || 0), 0);
    assert.strictEqual(Math.abs(debitA - creditA) < 0.01, true, "Ledger must be in balance on Computer A");
    console.log(`  ✓ Real business data created: 1 Customer, 1 Item, Invoice INV-2026-001 (₹70,800), Balance ₹20,800. Double-entry trial balance balanced: ₹${debitA.toFixed(2)}.`);

    // -------------------------------------------------------------
    // STEP 9: Computer A – Upload Verified Database Snapshot to Cloud
    // -------------------------------------------------------------
    console.log("\n▶ STEP 9: Computer A – Uploading Complete SQLite Database Snapshot to Cloud Backend...");
    const dbBufferA = database.exportDatabaseBuffer();
    assert.ok(dbBufferA && dbBufferA.length > 1024, "Exported database buffer should be > 1KB");

    const uploadRes = await makeRequest(
      "POST",
      "/api/v1/tenant/backup/upload",
      {
        Authorization: `Bearer ${deviceTokenA}`,
        "Content-Type": "application/json",
      },
      {
        backupData: dbBufferA.toString("base64"),
        companyName: testCompanyName,
        schemaVersion: 9,
      }
    );
    assert.strictEqual(uploadRes.status, 200, `Upload should succeed with status 200, got ${uploadRes.status}`);
    assert.strictEqual(uploadRes.data.ok, true);
    assert.ok(uploadRes.data.backupId, "Backup ID returned");
    assert.strictEqual(uploadRes.data.recordCounts.invoices, 1, "Cloud backup should contain 1 invoice");
    assert.strictEqual(uploadRes.data.recordCounts.parties, 1, "Cloud backup should contain 1 party");
    assert.strictEqual(uploadRes.data.recordCounts.items, 1, "Cloud backup should contain 1 item");
    console.log("  ✓ Cloud database backup verified and stored on backend server.");

    // Close Computer A
    database.closeDatabase ? database.closeDatabase() : null;

    // -------------------------------------------------------------
    // STEP 10 & 11: Computer B – Fresh Install Login & Backup Detection
    // -------------------------------------------------------------
    console.log("\n▶ STEP 10 & 11: Testing Computer B Fresh Installation & Login...");
    // Fresh install has clean directory dirB
    await database.initDatabase(dirB);

    // Login from Computer B
    const initLoginB = await makeRequest("POST", "/api/v1/auth/desktop-initiate-login", {}, {
      email: testEmail,
      password: testPassword,
      machineName: "PC-B-LAPTOP",
    });
    assert.strictEqual(initLoginB.status, 200);

    const deviceOtpB = masterDb.prepare("SELECT code FROM otps WHERE email = ? AND purpose = 'device_activation' ORDER BY created_at DESC LIMIT 1").get(testEmail).code;
    const verifyDeviceB = await makeRequest("POST", "/api/v1/auth/desktop-verify-device", {}, {
      email: testEmail,
      code: deviceOtpB,
      machineName: "PC-B-LAPTOP",
    });
    assert.strictEqual(verifyDeviceB.status, 200);
    deviceTokenB = verifyDeviceB.data.token;
    assert.ok(deviceTokenB, "Computer B authorized and token issued");
    console.log("  ✓ Computer B logged in with registered account.");

    // -------------------------------------------------------------
    // STEP 12: Computer B – Query Backup Status & Download Latest
    // -------------------------------------------------------------
    console.log("\n▶ STEP 12: Computer B – Detecting Cloud Backup and Downloading Snapshot...");
    const backupStatusRes = await makeRequest("GET", "/api/v1/tenant/backup/status", {
      Authorization: `Bearer ${deviceTokenB}`,
    });
    assert.strictEqual(backupStatusRes.status, 200);
    assert.strictEqual(backupStatusRes.data.hasBackup, true, "Existing backup must be detected");
    assert.strictEqual(backupStatusRes.data.latest.companyName, testCompanyName);
    assert.strictEqual(backupStatusRes.data.latest.recordCounts.invoices, 1);
    console.log(`  ✓ Found cloud backup for '${testCompanyName}' with 1 invoice and 1 item.`);

    const downloadBackupRes = await makeRequest("GET", "/api/v1/tenant/backup/latest?format=json", {
      Authorization: `Bearer ${deviceTokenB}`,
    });
    assert.strictEqual(downloadBackupRes.status, 200);
    assert.strictEqual(downloadBackupRes.data.ok, true);
    assert.ok(downloadBackupRes.data.backupData, "Backup data received");

    // -------------------------------------------------------------
    // STEP 13: Computer B – Full Restoration & Validation
    // -------------------------------------------------------------
    console.log("\n▶ STEP 13: Computer B – Restoring Database Snapshot...");
    const restoredBytes = Buffer.from(downloadBackupRes.data.backupData, "base64");
    const tempRestorePath = path.join(dirB, "temp-cloud-restore.sqlite");
    fs.writeFileSync(tempRestorePath, restoredBytes);

    await database.restoreBackup(tempRestorePath, { userDataPath: dirB });
    try { fs.unlinkSync(tempRestorePath); } catch (_) {}

    // Verify database integrity on Computer B
    const integrityB = database.validateDatabase();
    assert.strictEqual(integrityB.integrity, "ok", "Restored database integrity must be ok");
    assert.strictEqual(integrityB.foreignKeys, "ok", "Restored database foreign keys must be ok");
    console.log("  ✓ Database restored and integrity verified.");

    // -------------------------------------------------------------
    // STEP 14: Computer B – Verify Complete Data Usability & Totals
    // -------------------------------------------------------------
    console.log("\n▶ STEP 14: Computer B – Verifying Complete Business Records & Financial Totals...");
    const stateB = database.getState();
    assert.strictEqual(stateB.activeCompany, testCompanyName, "Active company must match Computer A");

    const restoredParty = stateB.parties.find((p) => p.name === "Apex Engineering Corp");
    assert.ok(restoredParty, "Customer party must be restored");
    assert.strictEqual(Number(restoredParty.receivable), 20800, "Receivable balance must match Computer A");

    const restoredItem = stateB.items.find((i) => i.name === "Hydraulic Pump HP-500");
    assert.ok(restoredItem, "Product item must be restored");
    assert.strictEqual(Number(restoredItem.currentStock), 20, "Stock must match Computer A (20 PCS)");

    const restoredInv = stateB.invoices.find((i) => i.invoiceNo === "INV-2026-001");
    assert.ok(restoredInv, "Invoice INV-2026-001 must be restored");
    assert.strictEqual(Number(restoredInv.total), 70800, "Invoice total must match Computer A (₹70,800)");
    assert.strictEqual(Number(restoredInv.received), 50000, "Invoice received must match Computer A (₹50,000)");
    assert.strictEqual(Number(restoredInv.balance), 20800, "Invoice balance must match Computer A (₹20,800)");

    const ledgerB = stateB.ledgerEntries;
    const debitB = ledgerB.reduce((sum, r) => sum + Number(r.debit || 0), 0);
    const creditB = ledgerB.reduce((sum, r) => sum + Number(r.credit || 0), 0);
    assert.strictEqual(Math.abs(debitB - creditB) < 0.01, true, "Restored ledger must be balanced");
    assert.strictEqual(debitB.toFixed(2), debitA.toFixed(2), "Restored trial balance must exactly match Computer A");
    console.log(`  ✓ 100% of data verified on Computer B! Invoices: ${stateB.invoices.length}, Parties: ${stateB.parties.length}, Items: ${stateB.items.length}, Trial Balance: ₹${debitB.toFixed(2)}.`);

    // -------------------------------------------------------------
    // STEP 15: Device Limit Enforcement (Max 2 Devices for Professional)
    // -------------------------------------------------------------
    console.log("\n▶ STEP 15: Testing Device Limit Enforcement (Attempting 3rd PC Login)...");
    masterDb.prepare("UPDATE plans SET max_devices = 2 WHERE code = 'Professional'").run();
    const initLoginC = await makeRequest("POST", "/api/v1/auth/desktop-initiate-login", {}, {
      email: testEmail,
      password: testPassword,
      machineName: "PC-C-THIRD-TERMINAL",
    });
    assert.strictEqual(initLoginC.status, 200);

    const deviceOtpC = masterDb.prepare("SELECT code FROM otps WHERE email = ? AND purpose = 'device_activation' ORDER BY created_at DESC LIMIT 1").get(testEmail).code;
    const verifyDeviceC = await makeRequest("POST", "/api/v1/auth/desktop-verify-device", {}, {
      email: testEmail,
      code: deviceOtpC,
      machineName: "PC-C-THIRD-TERMINAL",
    });
    assert.strictEqual(verifyDeviceC.status, 403, "3rd device must be rejected with HTTP 403");
    assert.strictEqual(verifyDeviceC.data.code, "DEVICE_LIMIT_REACHED", "Error code must be DEVICE_LIMIT_REACHED");
    console.log("  ✓ 3rd PC activation successfully blocked due to plan device limit (2/2 PCs).");

    // -------------------------------------------------------------
    // STEP 16: Device Revocation & Successful Reactivation
    // -------------------------------------------------------------
    console.log("\n▶ STEP 16: Testing Device Revocation & Subsequent Activation...");
    // Revoke Computer A's device token via Admin API
    const revokeRes = await makeRequest(
      "POST",
      "/api/v1/admin/revoke-device",
      { Authorization: `Bearer ${adminSessionToken}` },
      { token: deviceTokenA, customerId }
    );
    assert.strictEqual(revokeRes.status, 200);

    // Now Computer C should be able to activate
    const verifyDeviceCAgain = await makeRequest("POST", "/api/v1/auth/desktop-verify-device", {}, {
      email: testEmail,
      code: deviceOtpC,
      machineName: "PC-C-THIRD-TERMINAL",
    });
    assert.strictEqual(verifyDeviceCAgain.status, 200, "Device activation must succeed after revoking unused terminal");
    assert.strictEqual(verifyDeviceCAgain.data.ok, true);
    console.log("  ✓ Unused PC revoked; new PC successfully activated.");

    console.log("\n==================================================================");
    console.log("   ALL 16 E2E AUTH, SUBSCRIPTION & MIGRATION TESTS PASSED 100%!  ");
    console.log("==================================================================");
  } finally {
    try {
      const { syncSuperAdminCredentials } = require("../server/db");
      syncSuperAdminCredentials();
    } catch (_) {}
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
    try { fs.rmSync(dirA, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(dirB, { recursive: true, force: true }); } catch (_) {}
  }
}

runAuditTests().catch((err) => {
  console.error("Test execution failed:", err);
  if (httpServer) httpServer.close();
  process.exit(1);
});
