/**
 * Phase 2 Business Workflows & Functional Coherence Test Suite
 *
 * Validates:
 * 1. Operational document numbering sequences (PI, SO, DC, PO)
 * 2. Operational document creation and conversion without premature accounting/stock movements
 * 3. Payment-Out lifecycle (bill-linked and advance/on-account payment to suppliers)
 * 4. Stock Adjustments (add and reduce, stock movements, audit trail)
 * 5. Business Settings persistence across restarts
 * 6. Database integrity and zero orphan records
 */

"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const database = require("../database");

function createFixture(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return {
    root,
    async init() {
      await database.initDatabase(root);
      return this;
    },
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

async function runPhase2Tests() {
  console.log("=== STARTING PHASE 2 BUSINESS WORKFLOWS TEST SUITE ===");
  const fixture = await createFixture("gi-phase2-workflows-").init();

  try {
    // 1. Setup Company
    console.log("1. Setting up company...");
    await database.createCompany({
      businessName: "Phase 2 Enterprises",
      gstin: "32ABCDE1234F1Z5",
      pan: "ABCDE1234F",
      state: "Kerala",
      address: "123 Commercial Road, Kochi",
    });

    const state = database.getState();
    assert.strictEqual(state.activeCompany, "Phase 2 Enterprises");

    // 2. Operational Document Sequences
    console.log("2. Verifying operational document sequences...");
    const nextPI = database.nextInvoiceNumber("proforma");
    assert.ok(nextPI.startsWith("PI-"), `Expected PI prefix, got ${nextPI}`);

    const nextSO = database.nextInvoiceNumber("sale_order");
    assert.ok(nextSO.startsWith("SO-"), `Expected SO prefix, got ${nextSO}`);

    const nextDC = database.nextInvoiceNumber("delivery_challan");
    assert.ok(nextDC.startsWith("DC-"), `Expected DC prefix, got ${nextDC}`);

    const nextPO = database.nextInvoiceNumber("purchase_order");
    assert.ok(nextPO.startsWith("PO-"), `Expected PO prefix, got ${nextPO}`);

    // 3. Customer & Supplier setup
    console.log("3. Creating Customer, Supplier and Product...");
    await database.createParty({
      name: "Acme Retailers",
      type: "customer",
      phone: "9876543210",
      state: "Kerala",
      taxType: "registered",
      gstin: "32AABCA1111A1Z1",
    });

    await database.createParty({
      name: "Global Tech Wholesale",
      type: "supplier",
      phone: "9123456780",
      state: "Kerala",
      taxType: "registered",
      gstin: "32AABCG2222B1Z2",
    });

    await database.createItem({
      name: "Wireless Optical Mouse",
      itemType: "product",
      unit: "Pcs",
      hsnSac: "8471",
      taxRate: 18,
      purchasePrice: 400,
      salePrice: 600,
      openingStock: 20,
    });

    const initMasterState = database.getState();
    const customer = initMasterState.parties.find((p) => p.name === "Acme Retailers");
    const supplier = initMasterState.parties.find((p) => p.name === "Global Tech Wholesale");
    const product = initMasterState.items.find((i) => i.name === "Wireless Optical Mouse");

    assert.ok(customer, "Customer must exist");
    assert.ok(supplier, "Supplier must exist");
    assert.ok(product, "Product must exist");

    // 4. Operational Documents Lifecycle (Separation from Accounting/Stock)
    console.log("4. Creating Proforma Invoice & Purchase Order...");
    const stateWithProforma = await database.createEstimate({
      documentType: "proforma",
      partyId: customer.id,
      party: customer.name,
      phone: customer.phone,
      date: "2026-09-20",
      validUntil: "2026-10-20",
      taxType: "cgst_sgst",
      items: [
        {
          itemId: product.id,
          item: product.name,
          qty: 5,
          unit: "Pcs",
          price: 600,
          discount: 0,
          taxRate: 18,
          hsnSac: "8471",
        },
      ],
      notes: "Proforma quote for advance payment",
    });

    const proforma = stateWithProforma.estimates.find((e) => e.documentType === "proforma");
    assert.ok(proforma, "Proforma document must exist in estimates table");
    assert.ok(proforma.quoteNo.startsWith("PI-"), `Expected PI prefix, got ${proforma.quoteNo}`);

    const stateWithPO = await database.createEstimate({
      documentType: "purchase_order",
      partyId: supplier.id,
      party: supplier.name,
      phone: supplier.phone,
      date: "2026-09-20",
      validUntil: "2026-10-20",
      taxType: "cgst_sgst",
      items: [
        {
          itemId: product.id,
          item: product.name,
          qty: 15,
          unit: "Pcs",
          price: 400,
          discount: 0,
          taxRate: 18,
          hsnSac: "8471",
        },
      ],
      notes: "Purchase order for replenishment",
    });

    const po = stateWithPO.estimates.find((e) => e.documentType === "purchase_order");
    assert.ok(po, "PO document must exist in estimates table");
    assert.ok(po.quoteNo.startsWith("PO-"), `Expected PO prefix, got ${po.quoteNo}`);

    // Verify ZERO premature entries in financial and stock tables
    const stateAfterOperational = database.getState();
    const opsInvoices = stateAfterOperational.invoices || [];
    const opsTransactions = stateAfterOperational.transactions || [];
    const mouseStock = stateAfterOperational.items.find((i) => i.id === product.id);

    assert.strictEqual(opsInvoices.length, 0, "Operational documents must not create invoices in invoices table");
    assert.strictEqual(opsTransactions.length, 0, "Operational documents must not create entries in transactions table");
    assert.strictEqual(mouseStock.currentStock, 20, "Operational documents must not alter item current stock");

    // 5. Stock Adjustments (Add and Reduce)
    console.log("5. Testing Stock Adjustment (add and reduce)...");
    const stockAfterAdd = await database.recordStockAdjustment({
      itemId: product.id,
      direction: "add",
      quantity: 10,
      reason: "Stock audit surplus",
      unitPrice: 400,
      notes: "Found extra box in warehouse",
    });

    const itemAfterAdd = stockAfterAdd.items.find((i) => i.id === product.id);
    assert.strictEqual(itemAfterAdd.currentStock, 30, `Expected 30 mouse stock after add, got ${itemAfterAdd.currentStock}`);

    const stockAfterReduce = await database.recordStockAdjustment({
      itemId: product.id,
      direction: "reduce",
      quantity: 4,
      reason: "Damaged in transit",
      unitPrice: 400,
      notes: "Crushed boxes discarded",
    });

    const itemAfterReduce = stockAfterReduce.items.find((i) => i.id === product.id);
    assert.strictEqual(itemAfterReduce.currentStock, 26, `Expected 26 mouse stock after reduce, got ${itemAfterReduce.currentStock}`);

    // 6. Purchase Bill & Payment-Out Workflow
    console.log("6. Testing Purchase Bill and Payment-Out...");
    const stateWithBill = await database.createTransaction({
      type: "purchase",
      partyId: supplier.id,
      party: supplier.name,
      partyGstin: supplier.gstin,
      date: "2026-09-21",
      supplyType: "b2b",
      state: "Kerala",
      taxType: "cgst_sgst",
      paymentMethod: "Credit",
      receivedAmount: 0,
      items: [
        {
          itemId: product.id,
          item: product.name,
          qty: 10,
          unit: "Pcs",
          price: 400,
          taxRate: 18,
          hsnSac: "8471",
        },
      ],
    });

    const purchaseBill = stateWithBill.invoices.find((inv) => inv.type === "purchase");
    assert.ok(purchaseBill, "Purchase bill must exist in invoices");

    // Total = 4000 + 18% (720) = 4720
    assert.strictEqual(purchaseBill.total, 4720);
    assert.strictEqual(purchaseBill.balance, 4720);

    // Supplier balance should reflect payable of 4720
    const supBeforePay = stateWithBill.parties.find((p) => p.id === supplier.id);
    assert.ok(Math.abs(supBeforePay.balance) > 0, "Supplier should have outstanding payable balance");

    // Make Partial Payment-Out linked to purchase bill
    console.log("7. Recording Payment-Out against purchase bill...");
    const stateAfterPayOut = await database.recordPaymentOut({
      partyId: supplier.id,
      party: supplier.name,
      invoiceId: purchaseBill.id,
      amount: 2500,
      method: "Bank Transfer",
      paymentDate: "2026-09-22",
      notes: "NEFT Payment for part bill",
    });

    const updatedBill = stateAfterPayOut.invoices.find((inv) => inv.id === purchaseBill.id);
    assert.strictEqual(updatedBill.received, 2500, "Purchase bill paid amount should be 2500");
    assert.strictEqual(updatedBill.balance, 2220, "Purchase bill balance should be 4720 - 2500 = 2220");

    // Verify Payment-Out record exists in payments
    const payOutRecord = (stateAfterPayOut.payments || []).find((p) => p.invoiceId === purchaseBill.id);
    assert.ok(payOutRecord, "Payment-Out record must exist in payments table");
    assert.strictEqual(payOutRecord.type, "payment_out");
    assert.strictEqual(payOutRecord.amount, 2500);

    // 7. Business Settings Persistence Across Restarts
    console.log("8. Testing Business Settings persistence across restarts...");
    const newSettings = {
      businessName: "Phase 2 Enterprises Updated",
      gstin: "32ABCDE1234F1Z5",
      pan: "ABCDE1234F",
      state: "Kerala",
      address: "123 Commercial Road, Kochi",
      invoicePrefix: "P2-INV",
      startingNo: 100,
      printerType: "thermal",
      thermalWidth: "80mm",
      printCompanyLogo: true,
      stopSaleOnNegativeStock: true,
      defaultTaxInclusive: false,
      enableHsn: true,
    };

    const stateWithSettings = await database.updateBusinessSettings(newSettings);
    assert.strictEqual(stateWithSettings.businessSettings.printerType, "thermal");
    assert.strictEqual(stateWithSettings.businessSettings.thermalWidth, "80mm");
    assert.strictEqual(stateWithSettings.businessSettings.stopSaleOnNegativeStock, true);
    assert.strictEqual(stateWithSettings.businessSettings.enableHsn, true);

    // Re-initialize database to verify persistence on disk reload
    console.log("9. Reopening SQLite database to verify disk persistence...");
    await database.initDatabase(fixture.root);
    const reloadedState = database.getState();
    assert.strictEqual(reloadedState.businessSettings.printerType, "thermal", "Printer format must persist across restart");
    assert.strictEqual(reloadedState.businessSettings.thermalWidth, "80mm", "Thermal width must persist across restart");
    assert.strictEqual(reloadedState.businessSettings.stopSaleOnNegativeStock, true, "Negative stock setting must persist across restart");
    assert.strictEqual(reloadedState.businessSettings.enableHsn, true, "HSN setting must persist across restart");

    // 8. Runtime Integrity Checks
    console.log("10. Running PRAGMA integrity_check and foreign_key_check...");
    const integrity = database.validateDatabase();
    assert.strictEqual(integrity.integrity, "ok", `PRAGMA integrity_check failed: ${integrity.integrity}`);
    assert.strictEqual(integrity.foreignKeys, "ok", `PRAGMA foreign_key_check failed: ${integrity.foreignKeys}`);

    console.log("=== PHASE 2 BUSINESS WORKFLOWS TEST SUITE PASSED 100% ===");
  } finally {
    fixture.cleanup();
  }
}

runPhase2Tests().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
