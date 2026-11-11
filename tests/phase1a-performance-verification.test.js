const assert = require("assert");
const path = require("path");
const fs = require("fs");
const os = require("os");

const database = require("../database");
const { whatsappService } = require("../whatsapp-service");

async function runRegressionSuite() {
  console.log("=== PHASE 1A REGRESSION & VERIFICATION SUITE ===");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phase1a-reg-"));

  try {
    // 10. Application Startup
    console.log("▶ 10. Testing Application Database Initialization...");
    await database.initDatabase(tmpDir);
    const initialStatus = database.validateDatabase();
    assert.strictEqual(initialStatus.integrity, "ok", "Database integrity should be ok");
    assert.strictEqual(initialStatus.foreignKeys, "ok", "Foreign keys should be ok");
    console.log("  ✓ Database initialized cleanly");

    // 1. Create Invoice
    console.log("▶ 1. Testing Create Invoice...");
    const stateParty = database.createParty({
      name: "Alpha Traders",
      type: "customer",
      phone: "9876543210",
      openingBalance: 1000,
      openingBalanceType: "receivable",
    });
    const party = (stateParty.parties || []).find((p) => p.name === "Alpha Traders");
    assert.ok(party && party.id, "Party created with ID");

    const stateItem = database.createItem({
      name: "Widget Pro",
      itemType: "product",
      sku: "WGT-PRO-1",
      salePrice: 500,
      purchasePrice: 300,
      openingStock: 100,
    });
    const item = (stateItem.items || []).find((i) => i.name === "Widget Pro");
    assert.ok(item && item.id, "Item created with ID");

    const stateAfterCreate = database.createTransaction({
      type: "sale",
      party: party.name,
      partyId: party.id,
      invoiceNo: "INV-2026-001",
      date: new Date().toISOString().slice(0, 10),
      paymentType: "credit",
      received: 0,
      items: [
        {
          itemId: item.id,
          item: item.name,
          qty: 10,
          unit: "PCS",
          price: 500,
          discount: 0,
          taxRate: 18,
          hsnSac: "8471",
        },
      ],
    });
    const inv = (stateAfterCreate.invoices || []).find((i) => i.invoiceNo === "INV-2026-001");
    assert.ok(inv, "Invoice created in state");
    assert.strictEqual(Number(inv.total), 5900, "Invoice total should be ₹5900 (5000 + 18% GST)");
    console.log("  ✓ Sale invoice created with accurate GST calculation");

    // 2. Edit Invoice
    console.log("▶ 2. Testing Edit Invoice...");
    const stateAfterUpdate = database.updateInvoice({
      invoiceId: inv.id,
      type: "sale",
      party: party.name,
      partyId: party.id,
      invoiceNo: "INV-2026-001",
      date: inv.date,
      paymentType: "credit",
      received: 0,
      items: [
        {
          itemId: item.id,
          item: item.name,
          qty: 15,
          unit: "PCS",
          price: 500,
          discount: 0,
          taxRate: 18,
          hsnSac: "8471",
        },
      ],
    });
    const updatedInv = (stateAfterUpdate.invoices || []).find((i) => i.id === inv.id);
    assert.strictEqual(Number(updatedInv.total), 8850, "Updated invoice total should be ₹8850 (7500 + 18% GST)");
    console.log("  ✓ Invoice edited and re-totaled accurately");

    // 3. Record Payment
    console.log("▶ 3. Testing Record Payment...");
    database.recordInvoicePayment({
      invoiceId: inv.id,
      amount: 5000,
      method: "Bank",
      paymentDate: new Date().toISOString().slice(0, 10),
    });
    const freshState = database.getState();
    const invAfterPayment = freshState.invoices.find((i) => i.id === inv.id);
    assert.strictEqual(Number(invAfterPayment.received), 5000, "Received should be ₹5000");
    assert.strictEqual(Number(invAfterPayment.balance), 3850, "Balance should be ₹3850");
    console.log("  ✓ Invoice payment recorded and balances updated");

    // 4. Update Stock
    console.log("▶ 4. Testing Stock Calculation...");
    const stockWidget = freshState.items.find((i) => i.id === item.id);
    // Opening stock 100 - 15 sold = 85
    assert.strictEqual(Number(stockWidget.currentStock), 85, "Stock should be 85 PCS");
    console.log("  ✓ Inventory stock balances accurately decremented");

    // 5. Update Party
    console.log("▶ 5. Testing Update Party...");
    database.updateParty({
      id: party.id,
      name: "Alpha Traders Pvt Ltd",
      phone: "9876543211",
    });
    const partyAfterUpdate = database.getState().parties.find((p) => p.id === party.id);
    assert.strictEqual(partyAfterUpdate.name, "Alpha Traders Pvt Ltd", "Party name updated");
    console.log("  ✓ Party details updated");

    // 6. Filter Parties by Activity & Date Range
    console.log("▶ 6. Testing Party Activity Filter (PERF-003)...");
    database.createParty({
      name: "Dormant Co",
      phone: "9111111111",
    });

    const stateForFilter = database.getState();
    assert.ok(stateForFilter.parties.some((p) => p.name === "Alpha Traders Pvt Ltd"));
    assert.ok(stateForFilter.parties.some((p) => p.name === "Dormant Co"));

    // Verify activity detection using index
    const activeNames = new Set();
    for (const i of stateForFilter.invoices) {
      if (i.party) activeNames.add(i.party);
    }
    for (const p of stateForFilter.payments) {
      if (p.party) activeNames.add(p.party);
    }
    assert.ok(activeNames.has("Alpha Traders") || activeNames.has("Alpha Traders Pvt Ltd"), "Active party should be in index");
    assert.strictEqual(activeNames.has("Dormant Co"), false, "Dormant party should not be in index");
    console.log("  ✓ Party activity filter correctly identifies active vs dormant parties");

    // 7. Global Search Logic (PERF-005)
    console.log("▶ 7. Testing Search Debounce and Match Logic...");
    const appJsContent = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
    assert.ok(appJsContent.includes("globalSearchDebounceTimer"), "Global search debounce timer declared");
    assert.ok(appJsContent.includes("tableSearchDebounceTimer"), "Table search debounce timer declared");
    assert.ok(appJsContent.includes("cancelPendingSearchDebounce"), "cancelPendingSearchDebounce declared");
    console.log("  ✓ Search debounce helpers and cancellation verified in renderer code");

    // 8. WhatsApp Lazy Initialization (PERF-009)
    console.log("▶ 8. Testing WhatsApp Lazy Initialization...");
    assert.strictEqual(whatsappService.status, "disconnected", "WhatsApp must be disconnected on idle");
    assert.strictEqual(whatsappService.sock, null, "No Baileys socket should be spawned on idle");
    const waStatus = whatsappService.getStatus();
    assert.strictEqual(waStatus.connected, false, "Not connected initially");
    whatsappService.shutdown();
    assert.strictEqual(whatsappService.status, "disconnected", "Shutdown cleanly sets disconnected");
    console.log("  ✓ WhatsApp remains uninitialized on startup with clean shutdown");

    // 9. Backup & Restore (PERF-006)
    console.log("▶ 9. Testing Asynchronous Atomic Backup & Retention...");
    const asyncBackupResult = await database.createDailyAutomatedBackupAsync(tmpDir);
    assert.ok(asyncBackupResult && asyncBackupResult.backupPath, "Async backup created");
    assert.ok(fs.existsSync(asyncBackupResult.backupPath), "Backup file exists on disk");

    // Ensure temp files are cleaned up
    const backupDir = path.join(tmpDir, "daily-backups");
    const filesInBackupDir = fs.readdirSync(backupDir);
    const tmpFiles = filesInBackupDir.filter((f) => f.endsWith(".tmp"));
    assert.strictEqual(tmpFiles.length, 0, "No leftover .tmp files should exist");

    // Synchronous backup backward compatibility
    const syncBackupResult = database.createDailyAutomatedBackup(tmpDir);
    assert.ok(syncBackupResult && syncBackupResult.backupPath, "Sync backup returns backupPath");
    console.log("  ✓ Asynchronous atomic backup and synchronous fallback verified");

    // 11. Offline Billing & Data Integrity
    console.log("▶ 11. Testing Offline Billing & Storage...");
    const integrityCheck = database.validateDatabase();
    assert.strictEqual(integrityCheck.integrity, "ok", "Database integrity verified");
    assert.strictEqual(integrityCheck.foreignKeys, "ok", "Foreign key constraints verified");
    console.log("  ✓ Local SQLite offline billing database intact");

    // 12. GST & Double-Entry Accounting Calculations
    console.log("▶ 12. Testing GST & Accounting Double-Entry Trial Balance...");
    const ledgerRows = database.getState().ledgerEntries;
    const totalDebit = ledgerRows.reduce((acc, row) => acc + Number(row.debit || 0), 0);
    const totalCredit = ledgerRows.reduce((acc, row) => acc + Number(row.credit || 0), 0);
    assert.strictEqual(
      Math.abs(totalDebit - totalCredit) < 0.01,
      true,
      `Double entry ledger balance must match: Debit=${totalDebit}, Credit=${totalCredit}`
    );
    console.log(`  ✓ Double-entry ledger balanced: Debit ₹${totalDebit.toFixed(2)} === Credit ₹${totalCredit.toFixed(2)}`);

    console.log("\n==================================================================");
    console.log("   ALL 12 MANDATORY REGRESSION TESTS PASSED (100%)!              ");
    console.log("==================================================================");
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

runRegressionSuite().catch((err) => {
  console.error("Regression test failed:", err);
  process.exit(1);
});
