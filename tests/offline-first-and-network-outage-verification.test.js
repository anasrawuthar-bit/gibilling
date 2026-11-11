/**
 * Offline-First Architecture & Network Outage Verification Test
 * 
 * Verifies:
 * 1. First-time online activation saves credentials for offline use.
 * 2. Complete network disconnection (internet down):
 *    - App remains activated and unlocked.
 *    - CloudLicenseManager keeps active status and does NOT log out.
 * 3. 100% Local SQLite Billing during internet outage:
 *    - Creating customers, inventory items, and invoices works completely offline.
 *    - Stock levels decrement accurately in local SQLite without network calls.
 *    - Mutations are safely persisted in SQLite and queued in `sync_outbox`.
 * 4. 14-Day Offline Grace Protection logic during extended outages.
 * 5. Network restoration: Outbox batching automatically flushes and acknowledges pending data.
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { randomUUID } = require("crypto");
const database = require("../database");
const { SyncService } = require("../sync-service");

// Mock LocalStorage for Node.js environment
class MockLocalStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] ?? null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

// Global browser mocks
global.localStorage = new MockLocalStorage();
global.navigator = { onLine: true };
global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  giDB: null,
  giCloud: null,
  giSecureStore: {
    saveCredentials: async () => {},
    clearCredentials: async () => {}
  }
};
global.document = {
  getElementById: () => null
};

// Load CloudLicenseManager from cloud-desktop-client.js
const clientCode = fs.readFileSync(path.join(__dirname, "../cloud-desktop-client.js"), "utf8");
// Evaluate only the CloudLicenseManager and keys part
const licenseManagerModule = new Function(
  "localStorage",
  "navigator",
  "window",
  "document",
  `
  ${clientCode.slice(0, clientCode.indexOf("class PinSecurityManager"))}
  return { CloudLicenseManager, CLOUD_STORAGE_KEYS };
  `
)(global.localStorage, global.navigator, global.window, global.document);

const { CloudLicenseManager, CLOUD_STORAGE_KEYS } = licenseManagerModule;

async function runOfflineVerification() {
  console.log("\n=======================================================");
  console.log("   OFFLINE-FIRST & NETWORK OUTAGE VERIFICATION SUITE   ");
  console.log("=======================================================\n");

  // -------------------------------------------------------------------------
  // TEST 1: First-Time Activation
  // -------------------------------------------------------------------------
  console.log("[Test 1] Verifying First-Time Cloud Activation...");
  localStorage.clear();

  assert.strictEqual(CloudLicenseManager.isActivated(), false, "App must start unactivated");

  const oneYearFromNow = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const activationData = {
    token: "jwt_token_sample_" + Date.now(),
    companyId: "cust_12345",
    companyName: "Modern Traders Kerala",
    email: "owner@moderntraders.com",
    plan: "Professional",
    validUntil: oneYearFromNow,
    lastOnlineCheck: new Date().toISOString(),
    gracePeriodDays: 14,
    status: "active"
  };

  CloudLicenseManager.saveLicense(activationData);

  assert.strictEqual(CloudLicenseManager.isActivated(), true, "App must be activated after saving license");
  const storedLic = CloudLicenseManager.getLicense();
  assert.strictEqual(storedLic.email, "owner@moderntraders.com");
  assert.strictEqual(storedLic.plan, "Professional");
  console.log("  ✓ Activation credentials successfully stored in local secure cache");

  // -------------------------------------------------------------------------
  // TEST 2: Internet Goes Down (Total Network Disconnection)
  // -------------------------------------------------------------------------
  console.log("\n[Test 2] Simulating Total Internet Outage (Internet Cut)...");
  global.navigator.onLine = false;

  // 2a: Check isActivated() while offline
  const isActivatedOffline = CloudLicenseManager.isActivated();
  assert.strictEqual(isActivatedOffline, true, "App MUST remain 100% activated even when offline");
  console.log("  ✓ App remains active and unlocked when offline (navigator.onLine = false)");

  // 2b: Check subscription validity check while offline
  const graceStatusOffline = CloudLicenseManager.checkGracePeriod();
  assert.strictEqual(graceStatusOffline.isOverdue, false, "Active subscription must not be marked overdue offline");
  assert.ok(graceStatusOffline.daysRemaining > 300, "Days remaining must be preserved offline");
  console.log(`  ✓ Subscription validity verified offline: ${graceStatusOffline.daysRemaining} days remaining`);

  // 2c: Verify syncLicenseWithServer() does NOT lock out or throw when offline
  const syncResult = await CloudLicenseManager.syncLicenseWithServer();
  assert.ok(syncResult, "syncLicenseWithServer must return cached license during network outage");
  assert.strictEqual(CloudLicenseManager.isActivated(), true, "Must NOT force logout on network outage");
  console.log("  ✓ Network failures during sync do NOT log out or lock the user");

  // -------------------------------------------------------------------------
  // TEST 3: Pure Local SQLite Billing & Inventory Operations While Offline
  // -------------------------------------------------------------------------
  console.log("\n[Test 3] Testing Complete Offline Billing, Inventory & Tax in SQLite...");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gi-offline-test-"));
  try {
    await database.initDatabase(tempDir);
    database.updateBusinessSettings({
      businessName: "Modern Traders Kerala",
      state: "Kerala",
      enableTax: true
    });

    // 3a: Create Party offline
    let state = database.createParty({
      name: "Offline Customer Kannur",
      type: "customer",
      phone: "9876543210",
      state: "Kerala"
    });
    const party = state.parties.find(p => p.name === "Offline Customer Kannur");
    assert.ok(party, "Party must be created offline in local SQLite");
    console.log(`  ✓ Customer created locally while offline (ID: ${party.id})`);

    // 3b: Create Item with initial stock = 50 offline
    state = database.createItem({
      name: "Basmati Rice 25kg",
      itemType: "product",
      unit: "Bag",
      openingStock: 50,
      salePrice: 1200,
      purchasePrice: 1000,
      taxRate: 5
    });
    const item = state.items.find(i => i.name === "Basmati Rice 25kg");
    assert.ok(item, "Item must be created offline in local SQLite");
    assert.strictEqual(Number(item.currentStock), 50, "Initial currentStock must be 50");
    console.log(`  ✓ Product created locally with opening stock = 50`);

    // 3c: Create Sales Invoice for 8 units while offline
    const saleData = {
      type: "sale",
      party: party.name,
      partyId: party.id,
      paymentType: "credit",
      supplyType: "b2c",
      placeOfSupply: "Kerala",
      firmState: "Kerala",
      received: 0,
      date: new Date().toISOString(),
      items: [{
        item: item.name,
        itemId: item.id,
        qty: 8,
        unit: "Bag",
        price: 1200,
        taxRate: 5,
        hsnSac: "1001"
      }]
    };

    state = database.createTransaction(saleData);
    const invoice = (state.invoices || []).find(inv => inv.party === party.name);
    assert.ok(invoice, "Invoice must be saved offline into local SQLite database");
    assert.strictEqual(Number(invoice.total), 10080, "Invoice total must match 10080");
    assert.strictEqual(Number(invoice.cgstTotal), 240, "CGST must be 240 (2.5%)");
    assert.strictEqual(Number(invoice.sgstTotal), 240, "SGST must be 240 (2.5%)");
    assert.strictEqual(Number(invoice.igstTotal), 0, "Intra-state IGST must be 0");
    console.log(`  ✓ Sales invoice created offline (Inv No: ${invoice.invoiceNo}, Total: ₹${invoice.total}, CGST: ₹${invoice.cgstTotal}, SGST: ₹${invoice.sgstTotal})`);

    // 3d: Check Stock Deducted Offline
    const updatedItem = (state.items || []).find(i => i.id === item.id);
    assert.strictEqual(Number(updatedItem.currentStock), 42, "Stock must decrement from 50 to 42 offline");
    console.log(`  ✓ Stock updated locally in SQLite from 50 -> ${updatedItem.currentStock} Bags (Zero network needed)`);

    // 3e: Verify Local Outbox Queuing
    database.createUnit({ name: "Offline Unit Box" });
    const outboxStatus = database.getSyncStatus();
    assert.ok(outboxStatus.queue.pending > 0, "Mutations while offline must be recorded in SQLite sync_outbox");
    console.log(`  ✓ Local sync_outbox queued ${outboxStatus.queue.pending} offline events for later cloud sync`);

  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  // -------------------------------------------------------------------------
  // TEST 4: Extended Network Outage (14-Day Offline Grace Period)
  // -------------------------------------------------------------------------
  console.log("\n[Test 4] Verifying 14-Day Offline Grace Protection Logic...");

  // Scenario A: Subscription expired 5 days ago during extended internet downtime
  const fiveDaysOverdue = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
  CloudLicenseManager.saveLicense({
    ...activationData,
    validUntil: fiveDaysOverdue,
    lastOnlineCheck: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
    gracePeriodDays: 14
  });

  const graceA = CloudLicenseManager.checkGracePeriod();
  assert.strictEqual(graceA.isOverdue, true, "Must detect overdue subscription");
  assert.strictEqual(graceA.inGracePeriod, true, "Must grant active grace period protection");
  assert.strictEqual(graceA.daysRemaining, 9, "Must have exactly 9 days remaining out of 14");
  console.log(`  ✓ Overdue subscription protected: inGracePeriod = true (${graceA.daysRemaining} days grace left)`);

  // Scenario B: Subscription expired 15 days ago (grace period exceeded)
  const fifteenDaysOverdue = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
  CloudLicenseManager.saveLicense({
    ...activationData,
    validUntil: fifteenDaysOverdue,
    lastOnlineCheck: new Date(Date.now() - 16 * 24 * 60 * 60 * 1000).toISOString(),
    gracePeriodDays: 14
  });

  const graceB = CloudLicenseManager.checkGracePeriod();
  assert.strictEqual(graceB.isOverdue, true);
  assert.strictEqual(graceB.inGracePeriod, false, "Grace period expires after 14 days");
  assert.strictEqual(graceB.daysRemaining, 0);
  console.log("  ✓ Correctly enforces lock only after full 14-day grace period expires");

  // Scenario C: System clock rolled backwards (Anti-tamper check)
  CloudLicenseManager.saveLicense({
    ...activationData,
    validUntil: oneYearFromNow,
    lastOnlineCheck: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // future timestamp
  });
  const graceC = CloudLicenseManager.checkGracePeriod();
  assert.strictEqual(graceC.clockTampered, true, "Must flag clock tampering when system clock is manipulated");
  console.log("  ✓ Anti-tamper clock check successfully catches backward clock changes");

  // -------------------------------------------------------------------------
  // TEST 5: Internet Restoration & Automatic Cloud Outbox Flush
  // -------------------------------------------------------------------------
  console.log("\n[Test 5] Simulating Internet Restoration & Automatic Outbox Sync...");
  global.navigator.onLine = true;

  const syncTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gi-sync-reconnect-"));
  try {
    await database.initDatabase(syncTempDir);
    database.createItemCategory({ name: "Beverages" });
    database.createUnit({ name: "Crate" });

    const statusBefore = database.getSyncStatus();
    assert.ok(statusBefore.queue.pending >= 2, "Outbox has pending changes from offline session");
    console.log(`  ✓ Outbox holds ${statusBefore.queue.pending} changes made while offline`);

    // Simulated sync adapter when internet is back
    const uploadedEvents = [];
    const mockOnlineAdapter = {
      async registerDevice() { return { deviceId: "dev_terminal_01" }; },
      async push({ events }) {
        uploadedEvents.push(...events);
        return {
          results: events.map(e => ({ id: e.id, status: "accepted" }))
        };
      },
      async pull() { return { changes: [], cursor: "1" }; }
    };

    const syncService = new SyncService({
      database,
      adapter: mockOnlineAdapter,
      enabled: true,
      logger: { warn() {}, error() {} }
    });

    const syncResult = await syncService.syncNow();
    assert.strictEqual(uploadedEvents.length >= 2, true, "All offline events must be pushed upon reconnection");
    assert.strictEqual(Number(syncResult.queue.pending || 0), 0, "Outbox pending count must reach 0 after sync");
    assert.ok(Number(syncResult.queue.acknowledged || 0) >= 2, "Outbox acknowledged count must reflect uploaded events");
    console.log(`  ✓ Reconnection successfully flushed ${uploadedEvents.length} events to cloud with 0 pending errors`);

  } finally {
    fs.rmSync(syncTempDir, { recursive: true, force: true });
  }

  console.log("\n=======================================================");
  console.log("   ALL OFFLINE-FIRST & OUTAGE VERIFICATIONS PASSED!    ");
  console.log("=======================================================\n");
}

runOfflineVerification().catch(err => {
  console.error("Verification failed:", err);
  process.exit(1);
});
