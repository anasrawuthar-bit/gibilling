/**
 * Real-World Business Lifecycle Test — GI Computers, Kerala
 *
 * Business profile:
 *   Name    : GI Computers
 *   State   : Kerala
 *   GSTIN   : 32AABCG1234F1Z5
 *   Firm FY : 2026-27
 *
 * Test matrix:
 *   1.  Company creation & persistence after reopen
 *   2.  Opening balance reconciliation (receivable + payable)
 *   3.  Intra-state purchase (CGST+SGST, stock increases, AP posted)
 *   4.  Inter-state purchase (IGST, stock increases, AP posted)
 *   5.  Cash sale — B2C intra-state (CGST+SGST, stock decreases, cash receipt)
 *   6.  Credit sale — B2B intra-state (CGST+SGST, AR posted)
 *   7.  Partial payment against credit sale
 *   8.  Full payment clearing credit sale
 *   9.  Inter-state credit sale (IGST)
 *   10. Decimal tax rounding: Taxable + Tax == Total
 *   11. Service sale — no stock movement, no credit-note stock movement
 *   12. Credit note (product) — stock restored, debtor balance reduced, tax reversal
 *   13. Expense workflow — expense ledger debit, cash credit
 *   14. FOUR-WAY RECONCILIATIONS:
 *       a) Inventory : Opening + Purchases - Sales + Returns == currentStock
 *       b) Party     : Opening + Txn - Payments +/- Returns == balance
 *       c) Trial Bal : SUM(debit) == SUM(credit) across all ledger_entries
 *       d) Tax Reg   : Invoice taxTotal == tax_entries total == ledger tax accounts
 *   15. Multi-company data isolation
 *   16. Backup -> corrupt-file rejection -> safe atomic restore
 */

"use strict";

const assert   = require("assert");
const fs       = require("fs");
const os       = require("os");
const path     = require("path");
const database = require("../database");

// --- helpers ---

function round2(val) {
  return Math.round((Number(val || 0) + Number.EPSILON) * 100) / 100;
}

function assertClose(actual, expected, label, tolerance = 0.02) {
  const diff = Math.abs(Number(actual) - Number(expected));
  assert.ok(
    diff <= tolerance,
    label + ": expected " + expected + " but got " + actual + " (diff=" + diff + ")"
  );
}

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

const FIRM_STATE   = "Kerala";
const INTRA_SUPPLY = "Kerala";
const INTER_STATE  = "Tamil Nadu";

function seedGiComputers() {
  return database.createCompany({
    businessName : "GI Computers",
    gstin        : "32AABCG1234F1Z5",
    state        : FIRM_STATE,
    address      : "MG Road, Kochi",
    city         : "Kochi",
    pincode      : "682001",
    phone        : "9400000001",
    email        : "accounts@gicomputers.in",
  });
}

function seedParties() {
  database.createParty({ name: "Walk-In Customer", type: "customer", state: FIRM_STATE });
  database.createParty({
    name: "TechSolutions Kerala", type: "customer",
    gstin: "32AAACT1234E1ZP", taxType: "Registered", state: FIRM_STATE,
    openingBalance: 5000, openingBalanceType: "receivable",
  });
  database.createParty({
    name: "Chennai Dist. Pvt Ltd", type: "customer",
    gstin: "33AABCD1234B1ZK", taxType: "Registered", state: INTER_STATE,
  });
  database.createParty({
    name: "Kerala Components Ltd", type: "supplier",
    gstin: "32AABCK1234H1ZV", taxType: "Registered", state: FIRM_STATE,
    openingBalance: 8000, openingBalanceType: "payable",
  });
  database.createParty({
    name: "Bangalore Wholesalers", type: "supplier",
    gstin: "29AABCB1234A1Z8", taxType: "Registered", state: "Karnataka",
  });
}

function seedItems() {
  database.createItem({
    name: "Dell Laptop 15", itemType: "product", sku: "DELL-LAP-15",
    hsnSac: "84713010", unit: "Pcs",
    openingStock: 5, openingStockDate: "2026-04-01", openingStockValue: 45000,
    salePrice: 55000, purchasePrice: 45000, taxRate: 18,
  });
  database.createItem({
    name: "Samsung 512GB SSD", itemType: "product", sku: "SAM-SSD-512",
    hsnSac: "84733040", unit: "Pcs",
    openingStock: 20, openingStockDate: "2026-04-01", openingStockValue: 4000,
    salePrice: 5500, purchasePrice: 4000, taxRate: 18,
  });
  database.createItem({
    name: "Windows Setup Service", itemType: "service", sku: "SRV-WIN-SETUP",
    hsnSac: "99831110", unit: "Job",
    salePrice: 1000, taxRate: 18,
  });
}

// --- test functions ---

async function testCompanyCreationAndPersistence() {
  const fixture = createFixture("gi-rc-company-");
  try {
    await fixture.init();
    seedGiComputers();
    let state = database.getState();
    const co = state.companies.find((c) => c.name === "GI Computers");
    assert.ok(co, "GI Computers company must exist");
    assert.equal(state.businessSettings.gstin, "32AABCG1234F1Z5", "GSTIN must be stored");
    assert.equal(state.businessSettings.state, "Kerala", "State must be Kerala");
    await database.initDatabase(fixture.root);
    state = database.getState();
    const coAfterReopen = state.companies.find((c) => c.name === "GI Computers");
    assert.ok(coAfterReopen, "Company must persist across database reopen");
    assert.equal(database.getState().businessSettings.gstin, "32AABCG1234F1Z5", "GSTIN must persist");
  } finally {
    fixture.cleanup();
  }
}

async function testOpeningBalances() {
  const fixture = createFixture("gi-rc-opening-");
  try {
    await fixture.init();
    seedGiComputers();
    seedParties();
    const state = database.getState();
    const techSol  = state.parties.find((p) => p.name === "TechSolutions Kerala");
    const keralaCo = state.parties.find((p) => p.name === "Kerala Components Ltd");
    assert.ok(techSol, "TechSolutions Kerala must exist");
    assert.equal(techSol.openingBalance, 5000, "Opening receivable must be 5000");
    assert.equal(techSol.receivable, 5000, "Party receivable must reflect opening balance");
    assert.equal(techSol.balance, 5000, "Party balance must be +5000");
    assert.ok(keralaCo, "Kerala Components Ltd must exist");
    assert.equal(keralaCo.openingBalance, 8000, "Opening payable must be 8000");
    assert.equal(keralaCo.payable, 8000, "Party payable must reflect opening balance");
    assert.equal(keralaCo.balance, -8000, "Party balance must be -8000");
  } finally {
    fixture.cleanup();
  }
}

async function testIntraStatePurchase() {
  const fixture = createFixture("gi-rc-intra-pur-");
  try {
    await fixture.init();
    seedGiComputers(); seedParties(); seedItems();
    const state0   = database.getState();
    const laptop   = state0.items.find((i) => i.name === "Dell Laptop 15");
    const supplier = state0.parties.find((p) => p.name === "Kerala Components Ltd");
    database.createTransaction({
      id: "txn-pur-intra-001", invoiceId: "inv-pur-intra-001", invoiceNo: "PB-INTRA-001",
      type: "purchase", party: supplier.name, partyId: supplier.id,
      paymentType: "credit", supplyType: "b2b",
      placeOfSupply: INTRA_SUPPLY, firmState: FIRM_STATE, received: 0,
      date: "2026-04-05T00:00:00.000Z",
      items: [{ item: laptop.name, itemId: laptop.id, qty: 3, unit: "Pcs", price: 45000, discount: 0, taxRate: 18, hsnSac: "84713010" }],
    });
    const state = database.getState();
    const updatedLaptop = state.items.find((i) => i.name === "Dell Laptop 15");
    assert.equal(updatedLaptop.currentStock, 8, "Purchase must increase laptop stock 5->8");
    const inv = state.invoices.find((i) => i.invoiceNo === "PB-INTRA-001");
    assert.ok(inv, "Purchase invoice must be created");
    assertClose(inv.total,     159300, "Purchase total intra-state 18%");
    assertClose(inv.cgstTotal, 12150,  "CGST must be 12150");
    assertClose(inv.sgstTotal, 12150,  "SGST must be 12150");
    assertClose(inv.igstTotal, 0,      "IGST must be 0 for intra-state");
    const ledger  = state.ledgerEntries;
    const apEntry = ledger.find((e) => e.account === "Accounts Payable" && e.credit > 0);
    assert.ok(apEntry, "Accounts Payable credit must exist for credit purchase");
    const updatedSupplier = state.parties.find((p) => p.name === "Kerala Components Ltd");
    assertClose(updatedSupplier.payable, 167300, "Supplier payable = opening 8000 + invoice 159300");
  } finally {
    fixture.cleanup();
  }
}

async function testInterStatePurchase() {
  const fixture = createFixture("gi-rc-inter-pur-");
  try {
    await fixture.init();
    seedGiComputers(); seedParties(); seedItems();
    const state0   = database.getState();
    const ssd      = state0.items.find((i) => i.name === "Samsung 512GB SSD");
    const supplier = state0.parties.find((p) => p.name === "Bangalore Wholesalers");
    database.createTransaction({
      id: "txn-pur-inter-001", invoiceId: "inv-pur-inter-001", invoiceNo: "PB-INTER-001",
      type: "purchase", party: supplier.name, partyId: supplier.id,
      paymentType: "credit", supplyType: "b2b",
      placeOfSupply: "Karnataka", firmState: FIRM_STATE, received: 0,
      date: "2026-04-06T00:00:00.000Z",
      items: [{ item: ssd.name, itemId: ssd.id, qty: 10, unit: "Pcs", price: 4000, discount: 0, taxRate: 18, hsnSac: "84733040" }],
    });
    const state = database.getState();
    const updatedSsd = state.items.find((i) => i.name === "Samsung 512GB SSD");
    assert.equal(updatedSsd.currentStock, 30, "Inter-state purchase must increase SSD stock 20->30");
    const inv = state.invoices.find((i) => i.invoiceNo === "PB-INTER-001");
    assertClose(inv.total,     47200, "Purchase total inter-state");
    assertClose(inv.igstTotal, 7200,  "IGST must be 7200");
    assertClose(inv.cgstTotal, 0,     "CGST must be 0 for inter-state");
    assertClose(inv.sgstTotal, 0,     "SGST must be 0 for inter-state");
  } finally {
    fixture.cleanup();
  }
}

async function testCashSaleIntraState() {
  const fixture = createFixture("gi-rc-cash-sale-");
  try {
    await fixture.init();
    seedGiComputers(); seedParties(); seedItems();
    const state0 = database.getState();
    const laptop = state0.items.find((i) => i.name === "Dell Laptop 15");
    database.createTransaction({
      id: "txn-sale-cash-001", invoiceId: "inv-sale-cash-001", invoiceNo: "INV-GI-001",
      type: "sale", party: "Walk-In Customer",
      paymentType: "cash", supplyType: "b2c",
      placeOfSupply: INTRA_SUPPLY, firmState: FIRM_STATE, received: 64900,
      date: "2026-04-10T00:00:00.000Z",
      items: [{ item: laptop.name, itemId: laptop.id, qty: 1, unit: "Pcs", price: 55000, discount: 0, taxRate: 18, hsnSac: "84713010" }],
    });
    const state = database.getState();
    const updatedLaptop = state.items.find((i) => i.name === "Dell Laptop 15");
    assert.equal(updatedLaptop.currentStock, 4, "Cash sale must reduce laptop stock 5->4");
    const inv = state.invoices.find((i) => i.invoiceNo === "INV-GI-001");
    assertClose(inv.total,     64900, "Cash sale invoice total");
    assertClose(inv.cgstTotal, 4950,  "CGST on cash sale");
    assertClose(inv.sgstTotal, 4950,  "SGST on cash sale");
    assert.equal(String(inv.status).toLowerCase(), "paid", "Cash sale must be paid immediately");
    assertClose(inv.balance, 0, "Cash sale must have zero balance");
    const ledger    = state.ledgerEntries;
    const cashDebit = ledger.find((e) => e.account === "Cash" && e.debit > 0);
    assert.ok(cashDebit, "Cash must be debited for cash sale receipt");
  } finally {
    fixture.cleanup();
  }
}

async function testCreditSaleAndPayment() {
  const fixture = createFixture("gi-rc-cred-sale-");
  try {
    await fixture.init();
    seedGiComputers(); seedParties(); seedItems();
    const state0 = database.getState();
    const ssd    = state0.items.find((i) => i.name === "Samsung 512GB SSD");
    const buyer  = state0.parties.find((p) => p.name === "TechSolutions Kerala");
    database.createTransaction({
      id: "txn-sale-credit-001", invoiceId: "inv-sale-credit-001", invoiceNo: "INV-GI-002",
      type: "sale", party: buyer.name, partyId: buyer.id,
      paymentType: "credit", supplyType: "b2b",
      placeOfSupply: INTRA_SUPPLY, firmState: FIRM_STATE, received: 0,
      date: "2026-04-12T00:00:00.000Z",
      items: [{ item: ssd.name, itemId: ssd.id, qty: 5, unit: "Pcs", price: 5500, discount: 0, taxRate: 18, hsnSac: "84733040" }],
    });
    let state = database.getState();
    const inv = state.invoices.find((i) => i.invoiceNo === "INV-GI-002");
    assertClose(inv.total, 32450, "Credit sale invoice total");
    assert.ok(
      ["due", "unpaid"].includes(String(inv.status).toLowerCase()),
      "Credit sale must be in due/unpaid status, got: " + inv.status
    );
    let buyer2 = state.parties.find((p) => p.name === "TechSolutions Kerala");
    assertClose(buyer2.receivable, 37450, "Party receivable: opening 5000 + invoice 32450");
    state = database.recordInvoicePayment({ invoiceId: inv.id, amount: 10000, method: "Bank Transfer", paymentDate: "2026-04-15" });
    const invAfterPartial = state.invoices.find((i) => i.invoiceNo === "INV-GI-002");
    assertClose(invAfterPartial.received, 10000, "Invoice received after partial payment");
    assertClose(invAfterPartial.balance, 22450, "Invoice balance after partial payment");
    assert.equal(String(invAfterPartial.status).toLowerCase(), "partially_paid", "Status must be partially_paid");
    state = database.recordInvoicePayment({ invoiceId: inv.id, amount: 22450, method: "UPI", paymentDate: "2026-04-20" });
    const invFinal = state.invoices.find((i) => i.invoiceNo === "INV-GI-002");
    assertClose(invFinal.balance, 0, "Invoice balance must be 0 after full payment");
    assert.equal(String(invFinal.status).toLowerCase(), "paid", "Invoice must be paid");
    const buyerFinal = state.parties.find((p) => p.name === "TechSolutions Kerala");
    assertClose(buyerFinal.receivable, 5000, "After invoice paid, only opening balance remains as receivable");
  } finally {
    fixture.cleanup();
  }
}

async function testInterStateSale() {
  const fixture = createFixture("gi-rc-inter-sale-");
  try {
    await fixture.init();
    seedGiComputers(); seedParties(); seedItems();
    const state0 = database.getState();
    const ssd   = state0.items.find((i) => i.name === "Samsung 512GB SSD");
    const buyer = state0.parties.find((p) => p.name === "Chennai Dist. Pvt Ltd");
    database.createTransaction({
      id: "txn-sale-inter-001", invoiceId: "inv-sale-inter-001", invoiceNo: "INV-GI-003",
      type: "sale", party: buyer.name, partyId: buyer.id,
      paymentType: "credit", supplyType: "b2b",
      placeOfSupply: INTER_STATE, firmState: FIRM_STATE, received: 0,
      date: "2026-04-14T00:00:00.000Z",
      items: [{ item: ssd.name, itemId: ssd.id, qty: 2, unit: "Pcs", price: 5500, discount: 0, taxRate: 18, hsnSac: "84733040" }],
    });
    const state = database.getState();
    const inv = state.invoices.find((i) => i.invoiceNo === "INV-GI-003");
    assertClose(inv.total,     12980, "Inter-state sale total");
    assertClose(inv.igstTotal, 1980,  "IGST on inter-state sale");
    assertClose(inv.cgstTotal, 0,     "CGST must be 0 for inter-state sale");
    assertClose(inv.sgstTotal, 0,     "SGST must be 0 for inter-state sale");
  } finally {
    fixture.cleanup();
  }
}

async function testServiceSaleNoStock() {
  const fixture = createFixture("gi-rc-service-");
  try {
    await fixture.init();
    seedGiComputers(); seedParties(); seedItems();
    const state0    = database.getState();
    const svc       = state0.items.find((i) => i.name === "Windows Setup Service");
    assert.equal(svc.itemType, "service", "Windows Setup must be service item");
    assert.equal(svc.currentStock, 0, "Service item must have 0 stock");
    database.createTransaction({
      id: "txn-sale-svc-001", invoiceId: "inv-sale-svc-001", invoiceNo: "INV-GI-SVC-001",
      type: "sale", party: "Walk-In Customer",
      paymentType: "cash", supplyType: "b2c",
      placeOfSupply: INTRA_SUPPLY, firmState: FIRM_STATE, received: 3540,
      date: "2026-04-16T00:00:00.000Z",
      items: [{ item: svc.name, itemId: svc.id, qty: 3, unit: "Job", price: 1000, discount: 0, taxRate: 18, hsnSac: "99831110" }],
    });
    let state = database.getState();
    const svcMoves = state.stockMovements.filter((m) => m.itemId === svc.id);
    assert.equal(svcMoves.length, 0, "Service sale must create ZERO stock movements");
    const updatedSvc = state.items.find((i) => i.name === "Windows Setup Service");
    assert.equal(updatedSvc.currentStock, 0, "Service currentStock must remain 0 after sale");
    database.createCreditNote({
      creditNo: "CN-SVC-001", creditDate: "2026-04-17",
      invoiceNo: "INV-GI-SVC-001",
      party: "Walk-In Customer", partyTaxType: "Consumer",
      placeOfSupply: INTRA_SUPPLY, supplyType: "b2c", reason: "Billing Error",
      items: [{ itemId: svc.id, name: svc.name, quantity: 1, unit: "Job", price: 1000, discount: 0, taxRate: 18, hsnSac: "99831110" }],
    });
    state = database.getState();
    const svcMovesAfterCN = state.stockMovements.filter((m) => m.itemId === svc.id);
    assert.equal(svcMovesAfterCN.length, 0, "Credit note on service must create ZERO stock movements");
    const svcFinal = state.items.find((i) => i.name === "Windows Setup Service");
    assert.equal(svcFinal.currentStock, 0, "Service currentStock must remain 0 after credit note");
  } finally {
    fixture.cleanup();
  }
}

async function testCreditNoteProduct() {
  const fixture = createFixture("gi-rc-cn-prod-");
  try {
    await fixture.init();
    seedGiComputers(); seedParties(); seedItems();
    const state0 = database.getState();
    const ssd   = state0.items.find((i) => i.name === "Samsung 512GB SSD");
    const buyer = state0.parties.find((p) => p.name === "TechSolutions Kerala");
    database.createTransaction({
      id: "txn-sale-cn-base", invoiceId: "inv-sale-cn-base", invoiceNo: "INV-GI-CN-BASE",
      type: "sale", party: buyer.name, partyId: buyer.id,
      paymentType: "credit", supplyType: "b2b",
      placeOfSupply: INTRA_SUPPLY, firmState: FIRM_STATE, received: 0,
      date: "2026-04-18T00:00:00.000Z",
      items: [{ item: ssd.name, itemId: ssd.id, qty: 4, unit: "Pcs", price: 5500, discount: 0, taxRate: 18, hsnSac: "84733040" }],
    });
    let state = database.getState();
    const ssdAfterSale = state.items.find((i) => i.name === "Samsung 512GB SSD");
    assert.equal(ssdAfterSale.currentStock, 16, "Stock must reduce by 4 after credit sale (20->16)");
    database.createCreditNote({
      creditNo: "CN-SSD-001", creditDate: "2026-04-20",
      invoiceNo: "INV-GI-CN-BASE",
      party: buyer.name, partyId: buyer.id, partyTaxType: "Registered",
      placeOfSupply: INTRA_SUPPLY, supplyType: "b2b", reason: "Defective Units",
      items: [{ itemId: ssd.id, name: ssd.name, quantity: 2, unit: "Pcs", price: 5500, discount: 0, taxRate: 18, hsnSac: "84733040" }],
    });
    state = database.getState();
    const ssdAfterCN = state.items.find((i) => i.name === "Samsung 512GB SSD");
    assert.equal(ssdAfterCN.currentStock, 18, "Credit note must restore 2 units (16->18)");
    const cn = state.creditNotes.find((c) => c.creditNo === "CN-SSD-001");
    assert.ok(cn, "Credit note must be created");
    assertClose(cn.total, 12980, "Credit note total (2 SSDs at 18% GST)");
    const taxEntries = database.getTaxEntries({ sourceType: "credit_note" });
    const cnTaxEntry = taxEntries.find((e) => e.documentNo === "CN-SSD-001");
    assert.ok(cnTaxEntry, "Credit note must post to tax_entries");
    assertClose(cnTaxEntry.taxableValue, 11000, "Credit note taxable value (2*5500)");
    const ledger = state.ledgerEntries;
    const salesDebit = ledger.find((e) => e.transactionId === cn.id && e.account === "Sales" && e.debit > 0);
    assert.ok(salesDebit, "Credit note must debit Sales account (reversal)");
  } finally {
    fixture.cleanup();
  }
}

async function testExpenseWorkflow() {
  const fixture = createFixture("gi-rc-expense-");
  try {
    await fixture.init();
    seedGiComputers();
    database.createTransaction({
      id: "txn-exp-rent-001", type: "expense", item: "Office Rent",
      amount: 5000, paymentType: "cash", status: "paid",
      date: "2026-04-30T00:00:00.000Z", notes: "April 2026 office rent",
      meta: { category: "Rent", taxableValue: 5000, taxTotal: 0, paid: 5000, paymentMethod: "Cash" },
    });
    const state    = database.getState();
    const ledger   = state.ledgerEntries;
    const expDebit = ledger.find((e) => e.account === "Expense - Rent" && e.debit > 0);
    const cashCred = ledger.find((e) => e.account === "Cash" && e.credit > 0);
    assert.ok(expDebit, "Expense - Rent account must be debited");
    assert.ok(cashCred, "Cash must be credited for expense payment");
    assertClose(expDebit.debit, 5000, "Expense debit amount");
  } finally {
    fixture.cleanup();
  }
}

async function testDecimalTaxRounding() {
  const fixture = createFixture("gi-rc-rounding-");
  try {
    await fixture.init();
    seedGiComputers(); seedParties();
    database.createItem({
      name: "USB Cable", itemType: "product", sku: "USB-CBL",
      hsnSac: "85444290", unit: "Pcs",
      openingStock: 100, salePrice: 299, purchasePrice: 150, taxRate: 18,
    });
    const state0 = database.getState();
    const cable  = state0.items.find((i) => i.name === "USB Cable");
    database.createTransaction({
      id: "txn-sale-rounding-001", invoiceId: "inv-sale-rounding-001", invoiceNo: "INV-GI-ROUND-001",
      type: "sale", party: "Walk-In Customer",
      paymentType: "cash", supplyType: "b2c",
      placeOfSupply: INTRA_SUPPLY, firmState: FIRM_STATE, received: 1058.46,
      date: "2026-04-22T00:00:00.000Z",
      items: [{ item: cable.name, itemId: cable.id, qty: 3, unit: "Pcs", price: 299, discount: 0, taxRate: 18, hsnSac: "85444290" }],
    });
    const state = database.getState();
    const inv   = state.invoices.find((i) => i.invoiceNo === "INV-GI-ROUND-001");
    const computedTotal = round2(inv.subtotal - inv.discountTotal + inv.taxTotal);
    assertClose(computedTotal, inv.total, "Taxable + Tax must equal invoice total (rounding)", 0.02);
    assertClose(inv.cgstTotal + inv.sgstTotal, inv.taxTotal, "CGST + SGST must sum to taxTotal");
  } finally {
    fixture.cleanup();
  }
}

async function testFourWayReconciliation() {
  const fixture = createFixture("gi-rc-4way-");
  try {
    await fixture.init();
    seedGiComputers(); seedParties(); seedItems();
    const state0   = database.getState();
    const laptop   = state0.items.find((i) => i.name === "Dell Laptop 15");
    const ssd      = state0.items.find((i) => i.name === "Samsung 512GB SSD");
    const svc      = state0.items.find((i) => i.name === "Windows Setup Service");
    const buyer    = state0.parties.find((p) => p.name === "TechSolutions Kerala");
    const supplier = state0.parties.find((p) => p.name === "Kerala Components Ltd");

    // Purchase 3 Laptops (intra-state)
    database.createTransaction({
      id: "txn-4way-pur-01", invoiceId: "inv-4way-pur-01", invoiceNo: "PB-4WAY-01",
      type: "purchase", party: supplier.name, partyId: supplier.id,
      paymentType: "credit", supplyType: "b2b",
      placeOfSupply: INTRA_SUPPLY, firmState: FIRM_STATE, received: 0,
      date: "2026-04-05T00:00:00.000Z",
      items: [{ item: laptop.name, itemId: laptop.id, qty: 3, unit: "Pcs", price: 45000, discount: 0, taxRate: 18, hsnSac: "84713010" }],
    });
    // Cash sale: 1 Laptop
    database.createTransaction({
      id: "txn-4way-sale-01", invoiceId: "inv-4way-sale-01", invoiceNo: "INV-4WAY-01",
      type: "sale", party: "Walk-In Customer",
      paymentType: "cash", supplyType: "b2c",
      placeOfSupply: INTRA_SUPPLY, firmState: FIRM_STATE, received: 64900,
      date: "2026-04-10T00:00:00.000Z",
      items: [{ item: laptop.name, itemId: laptop.id, qty: 1, unit: "Pcs", price: 55000, discount: 0, taxRate: 18, hsnSac: "84713010" }],
    });
    // B2B credit sale: 2 SSDs
    database.createTransaction({
      id: "txn-4way-sale-02", invoiceId: "inv-4way-sale-02", invoiceNo: "INV-4WAY-02",
      type: "sale", party: buyer.name, partyId: buyer.id,
      paymentType: "credit", supplyType: "b2b",
      placeOfSupply: INTRA_SUPPLY, firmState: FIRM_STATE, received: 0,
      date: "2026-04-12T00:00:00.000Z",
      items: [{ item: ssd.name, itemId: ssd.id, qty: 2, unit: "Pcs", price: 5500, discount: 0, taxRate: 18, hsnSac: "84733040" }],
    });
    // Partial payment on INV-4WAY-02
    const inv02 = database.getState().invoices.find((i) => i.invoiceNo === "INV-4WAY-02");
    database.recordInvoicePayment({ invoiceId: inv02.id, amount: 5000, method: "UPI", paymentDate: "2026-04-15" });
    // Service sale: 2 jobs
    database.createTransaction({
      id: "txn-4way-svc-01", invoiceId: "inv-4way-svc-01", invoiceNo: "INV-4WAY-SVC-01",
      type: "sale", party: "Walk-In Customer",
      paymentType: "cash", supplyType: "b2c",
      placeOfSupply: INTRA_SUPPLY, firmState: FIRM_STATE, received: 2360,
      date: "2026-04-15T00:00:00.000Z",
      items: [{ item: svc.name, itemId: svc.id, qty: 2, unit: "Job", price: 1000, discount: 0, taxRate: 18, hsnSac: "99831110" }],
    });
    // Credit note: return 1 SSD
    database.createCreditNote({
      creditNo: "CN-4WAY-01", creditDate: "2026-04-18",
      invoiceNo: "INV-4WAY-02",
      party: buyer.name, partyId: buyer.id, partyTaxType: "Registered",
      placeOfSupply: INTRA_SUPPLY, supplyType: "b2b", reason: "Defective",
      items: [{ itemId: ssd.id, name: ssd.name, quantity: 1, unit: "Pcs", price: 5500, discount: 0, taxRate: 18, hsnSac: "84733040" }],
    });
    // Expense: rent
    database.createTransaction({
      id: "txn-4way-exp-01", type: "expense", item: "Office Rent", amount: 3000,
      paymentType: "cash", status: "paid", date: "2026-04-30T00:00:00.000Z",
      meta: { category: "Rent", taxableValue: 3000, taxTotal: 0, paid: 3000, paymentMethod: "Cash" },
    });

    const state = database.getState();

    // (a) INVENTORY RECONCILIATION
    // Laptop: opening=5, pur=3, sale=1 => 7
    const laptopState = state.items.find((i) => i.name === "Dell Laptop 15");
    assert.equal(laptopState.currentStock, 7, "INVENTORY Laptop: expected 7 (5+3-1), got " + laptopState.currentStock);
    // SSD: opening=20, sale=2, return=1 => 19
    const ssdState = state.items.find((i) => i.name === "Samsung 512GB SSD");
    assert.equal(ssdState.currentStock, 19, "INVENTORY SSD: expected 19 (20-2+1), got " + ssdState.currentStock);
    // Service: always 0
    const svcState = state.items.find((i) => i.name === "Windows Setup Service");
    assert.equal(svcState.currentStock, 0, "INVENTORY Service: must always be 0, got " + svcState.currentStock);
    // Verify via stock_movements delta
    const laptopBalance = state.stockBalances.find((b) => b.itemId === laptop.id);
    if (laptopBalance) {
      // movements: purchase +3, sale -1 = net +2
      assert.equal(laptopBalance.quantity, 2, "StockBalance Laptop movements delta: expected +2, got " + laptopBalance.quantity);
    }
    const ssdBalance = state.stockBalances.find((b) => b.itemId === ssd.id);
    if (ssdBalance) {
      // movements: sale -2, CN return +1 = net -1
      assert.equal(ssdBalance.quantity, -1, "StockBalance SSD movements delta: expected -1, got " + ssdBalance.quantity);
    }
    const svcBalance = state.stockBalances.find((b) => b.itemId === svc.id);
    assert.ok(!svcBalance, "Service item must have NO stockBalance entry");

    // (b) PARTY RECONCILIATION
    // TechSolutions: opening 5000, sale INV-4WAY-02 total=12980, CN reduces by 6490, payment=5000
    // Invoice balance = 12980 - 5000 = 7980; after CN applied to invoice balance not directly....
    // party.receivable = opening 5000 + invoice outstanding from DB view
    // Invoice balance in DB = 12980 - 5000 = 7980
    // Credit note total = 1*5500*1.18 = 6490 (reduces receivable)
    // Net = 5000 + 7980 - 6490 = 6490
    const techSolFinal = state.parties.find((p) => p.name === "TechSolutions Kerala");
    assertClose(techSolFinal.balance, 6490, "PARTY TechSolutions balance: expected 6490");
    // Supplier: opening payable 8000 + purchase 159300 = 167300
    const supplierFinal = state.parties.find((p) => p.name === "Kerala Components Ltd");
    assertClose(supplierFinal.payable, 167300, "PARTY Supplier payable: expected 167300");

    // (c) TRIAL BALANCE: debit == credit
    const ledger      = state.ledgerEntries;
    const totalDebit  = round2(ledger.reduce((s, e) => s + Number(e.debit  || 0), 0));
    const totalCredit = round2(ledger.reduce((s, e) => s + Number(e.credit || 0), 0));
    assertClose(totalDebit, totalCredit,
      "TRIAL BALANCE: total debit (" + totalDebit + ") must equal total credit (" + totalCredit + ")", 0.02);
    assert.ok(totalDebit > 0, "Trial balance must have non-zero entries");

    // (d) TAX REGISTER RECONCILIATION
    const saleTaxEntries = database.getTaxEntries({ sourceType: "sale",        excludeCancelled: true });
    const cnTaxEntries   = database.getTaxEntries({ sourceType: "credit_note", excludeCancelled: true });
    const netCgstSales   = round2(saleTaxEntries.reduce((s, e) => s + Number(e.cgst || 0), 0));
    const netCgstCN      = round2(cnTaxEntries.reduce((s, e)   => s + Number(e.cgst || 0), 0));
    const netCgst        = round2(netCgstSales - netCgstCN);
    const cgstLedger     = ledger.filter((e) => e.account === "Output CGST");
    const cgstLedgerNet  = round2(cgstLedger.reduce((s, e) => s + Number(e.credit || 0) - Number(e.debit || 0), 0));
    assertClose(netCgst, cgstLedgerNet,
      "TAX REGISTER CGST: tax_entries net (" + netCgst + ") must match ledger Output CGST net (" + cgstLedgerNet + ")", 0.05);
    const netSgstSales   = round2(saleTaxEntries.reduce((s, e) => s + Number(e.sgst || 0), 0));
    const netSgstCN      = round2(cnTaxEntries.reduce((s, e)   => s + Number(e.sgst || 0), 0));
    const netSgst        = round2(netSgstSales - netSgstCN);
    const sgstLedger     = ledger.filter((e) => e.account === "Output SGST");
    const sgstLedgerNet  = round2(sgstLedger.reduce((s, e) => s + Number(e.credit || 0) - Number(e.debit || 0), 0));
    assertClose(netSgst, sgstLedgerNet,
      "TAX REGISTER SGST: tax_entries net (" + netSgst + ") must match ledger Output SGST net (" + sgstLedgerNet + ")", 0.05);
  } finally {
    fixture.cleanup();
  }
}

async function testMultiCompanyIsolation() {
  const fixture = createFixture("gi-rc-multicompany-");
  try {
    await fixture.init();
    database.createCompany({ businessName: "Firm Alpha", state: "Kerala" });
    database.createItem({ name: "Alpha Widget", itemType: "product", sku: "AW-01", unit: "Pcs", salePrice: 100, taxRate: 18 });
    database.createCompany({ businessName: "Firm Beta", state: "Tamil Nadu" });
    database.createItem({ name: "Beta Gadget", itemType: "product", sku: "BG-01", unit: "Pcs", salePrice: 200, taxRate: 12 });
    database.setCurrentCompany("Firm Alpha");
    const alphaItems = database.getState().items;
    assert.ok(alphaItems.some((i) => i.name === "Alpha Widget"), "Firm Alpha must see its own items");
    assert.ok(!alphaItems.some((i) => i.name === "Beta Gadget"), "Firm Alpha must NOT see Firm Beta items");
    database.setCurrentCompany("Firm Beta");
    const betaItems = database.getState().items;
    assert.ok(betaItems.some((i) => i.name === "Beta Gadget"), "Firm Beta must see its own items");
    assert.ok(!betaItems.some((i) => i.name === "Alpha Widget"), "Firm Beta must NOT see Firm Alpha items");
  } finally {
    fixture.cleanup();
  }
}

async function testBackupAndRestore() {
  const fixtureA = createFixture("gi-rc-bkup-src-");
  const fixtureB = createFixture("gi-rc-bkup-dst-");
  try {
    await fixtureA.init();
    seedGiComputers(); seedParties(); seedItems();
    const backupPath = path.join(fixtureA.root, "test-backup.sqlite");
    database.backupTo(backupPath);
    assert.ok(fs.existsSync(backupPath), "Backup file must be created");
    const backupBytes = fs.readFileSync(backupPath);
    assert.ok(backupBytes.length > 16, "Backup file must have content");
    const header = backupBytes.subarray(0, 16).toString("utf8");
    assert.ok(header.startsWith("SQLite format 3"), "Backup must have valid SQLite header");
    // Corrupt file rejection
    const corruptPath = path.join(fixtureA.root, "corrupt.sqlite");
    fs.writeFileSync(corruptPath, Buffer.from("this is not a sqlite file at all!!! garbage data here!!!"));
    let corruptRejected = false;
    try {
      await database.restoreBackup(corruptPath);
    } catch (err) {
      corruptRejected = true;
      assert.ok(
        err.message.includes("Invalid backup") || err.message.includes("validation") || err.message.includes("header") || err.message.includes("Failed"),
        "Corrupt backup rejection error must be descriptive: " + err.message
      );
    }
    assert.ok(corruptRejected, "Corrupt backup file must be rejected");
    // Restore valid backup
    await database.initDatabase(fixtureB.root);
    await database.restoreBackup(backupPath, { userDataPath: fixtureB.root });
    const restoredState = database.getState();
    assert.ok(restoredState.companies.some((c) => c.name === "GI Computers"), "Restored DB must have GI Computers");
    assert.ok(restoredState.items.some((i) => i.name === "Dell Laptop 15"), "Restored DB must have seeded items");
    assert.ok(restoredState.parties.some((p) => p.name === "TechSolutions Kerala"), "Restored DB must have seeded parties");
  } finally {
    fixtureA.cleanup();
    fixtureB.cleanup();
  }
}

async function testDocumentNumbering() {
  const fixture = createFixture("gi-rc-docno-");
  try {
    await fixture.init();
    seedGiComputers(); seedParties(); seedItems();
    const state0 = database.getState();
    const laptop = state0.items.find((i) => i.name === "Dell Laptop 15");
    for (let n = 1; n <= 3; n++) {
      database.createTransaction({
        type: "sale", party: "Walk-In Customer",
        paymentType: "cash", supplyType: "b2c",
        placeOfSupply: INTRA_SUPPLY, firmState: FIRM_STATE, received: 64900,
        date: "2026-04-" + (9 + n) + "T00:00:00.000Z",
        items: [{ item: laptop.name, itemId: laptop.id, qty: 1, unit: "Pcs", price: 55000, discount: 0, taxRate: 18, hsnSac: "84713010" }],
      });
    }
    const state      = database.getState();
    const invoiceNos = state.invoices.map((i) => i.invoiceNo).filter(Boolean);
    assert.ok(invoiceNos.length >= 3, "Must have at least 3 invoices");
    const unique = new Set(invoiceNos);
    assert.equal(unique.size, invoiceNos.length, "All invoice numbers must be unique");
  } finally {
    fixture.cleanup();
  }
}

// --- Runner ---

const TESTS = [
  ["Company creation & persistence",        testCompanyCreationAndPersistence],
  ["Opening balance reconciliation",         testOpeningBalances],
  ["Intra-state purchase (CGST+SGST)",       testIntraStatePurchase],
  ["Inter-state purchase (IGST)",            testInterStatePurchase],
  ["Cash sale intra-state",                  testCashSaleIntraState],
  ["Credit sale + partial + full payment",   testCreditSaleAndPayment],
  ["Inter-state credit sale (IGST)",         testInterStateSale],
  ["Service sale — no stock movement",       testServiceSaleNoStock],
  ["Credit note — product stock restored",   testCreditNoteProduct],
  ["Expense workflow",                        testExpenseWorkflow],
  ["Decimal tax rounding",                   testDecimalTaxRounding],
  ["Four-way reconciliations",               testFourWayReconciliation],
  ["Multi-company data isolation",           testMultiCompanyIsolation],
  ["Backup / corrupt reject / safe restore", testBackupAndRestore],
  ["Document numbering & uniqueness",        testDocumentNumbering],
];

async function run() {
  let passed = 0;
  let failed = 0;
  const failures = [];
  console.log("");
  console.log("==================================================================");
  console.log("  GI Billing - Real-World Business Lifecycle Test Suite");
  console.log("  Business: GI Computers, Kerala  |  GSTIN: 32AABCG1234F1Z5");
  console.log("==================================================================");
  console.log("");
  for (const [name, fn] of TESTS) {
    process.stdout.write("  >> " + name + " ... ");
    try {
      await fn();
      console.log("PASS");
      passed++;
    } catch (err) {
      console.log("FAIL");
      failures.push({ name, err });
      failed++;
    }
  }
  console.log("");
  console.log("------------------------------------------------------------------");
  console.log("  Results: " + passed + " passed, " + failed + " failed out of " + TESTS.length + " tests");
  console.log("------------------------------------------------------------------");
  console.log("");
  if (failures.length > 0) {
    for (const { name, err } of failures) {
      console.error("FAILED: " + name);
      console.error("  " + err.message);
      if (err.stack) {
        err.stack.split("\n").slice(1, 5).forEach((l) => console.error("  " + l.trim()));
      }
    }
    process.exitCode = 1;
  } else {
    console.log("Real-world business lifecycle tests passed.");
  }
}

run().catch((err) => {
  console.error("Unexpected test runner error:", err);
  process.exitCode = 1;
});
