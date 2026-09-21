const assert = require("assert");
const database = require("../database");
const { createFixture, seedMasters, sampleInvoice } = require("./database-fixtures");

async function run() {
  console.log("Running Debit Note and FY Regression Test Suite...");
  await testDebitNoteCreationAndItems();
  await testPhysicalProductStockDecrease();
  await testServiceItemZeroStockMovement();
  await testInputGstLedgerReversal();
  await testDebitNoteTaxEntries();
  await testSupplierPayableReduction();
  await testDoubleEntryLedgerEquilibrium();
  await testDebitNoteCancellation();
  await testMultiGstRates();
  await testIntraVsInterStateGst();
  await testMultiCompanyIsolation();
  await testDocumentSequencePerFY();
  await testAuditTrailLogging();
  await testFYBoundaryCalculation();
  await testTrialBalanceEquilibriumAcrossFullLifecycle();
  console.log("ALL 15 DEBIT NOTE AND FY TESTS PASSED SUCCESSFULLY.");
}

async function testDebitNoteCreationAndItems() {
  const fixture = await createFixture("gi-dn-create-");
  try {
    const { supplier, item } = seedMasters();
    const purchase = sampleInvoice({ type: "purchase", party: supplier, item, id: "dn-p1", qty: 10, received: 0 });
    database.createTransaction(purchase);

    const debitNoteData = {
      debitNo: "DN-2627-0001",
      debitDate: "2026-08-15",
      invoiceNo: purchase.invoiceNo,
      party: supplier.name,
      partyId: supplier.id,
      partyTaxType: "Registered",
      placeOfSupply: "Karnataka",
      supplyType: "b2b",
      reason: "Defective goods returned",
      items: [{
        itemId: item.id,
        name: item.name,
        quantity: 2,
        unit: "Pcs",
        price: 70,
        discount: 0,
        taxRate: 18,
        hsnSac: "1001",
      }],
    };

    const state = database.createDebitNote(debitNoteData);
    assert.ok(state.debitNotes, "state.debitNotes must exist");
    assert.equal(state.debitNotes.length, 1);
    const dn = state.debitNotes[0];
    assert.equal(dn.debitNo, "DN-2627-0001");
    assert.equal(dn.partyId, supplier.id);
    assert.equal(dn.originalInvoiceNo, purchase.invoiceNo);
    assert.equal(dn.subtotal, 140);
    assert.equal(dn.cgstTotal, 12.6);
    assert.equal(dn.sgstTotal, 12.6);
    assert.equal(dn.igstTotal, 0);
    assert.equal(dn.taxTotal, 25.2);
    assert.equal(dn.total, 165.2);
    assert.equal(dn.status, "open");

    assert.ok(state.debitNoteItems, "state.debitNoteItems must exist");
    assert.equal(state.debitNoteItems.length, 1);
    const dnItem = state.debitNoteItems[0];
    assert.equal(dnItem.debitNoteId, dn.id);
    assert.equal(dnItem.itemId, item.id);
    assert.equal(dnItem.qty, 2);
    assert.equal(dnItem.price, 70);
    assert.equal(dnItem.taxableValue, 140);
    assert.equal(dnItem.taxAmount, 25.2);
    assert.equal(dnItem.lineTotal, 165.2);
  } finally {
    fixture.cleanup();
  }
}

async function testPhysicalProductStockDecrease() {
  const fixture = await createFixture("gi-dn-stock-");
  try {
    const { supplier, item } = seedMasters();
    // item opening stock is 20
    let state = database.getState();
    const initialItem = state.items.find((i) => i.id === item.id);
    assert.equal(initialItem.currentStock, 20);

    // Purchase 10 -> stock becomes 30
    const purchase = sampleInvoice({ type: "purchase", party: supplier, item, id: "dn-stk-p", qty: 10 });
    state = database.createTransaction(purchase);
    const afterPurchaseItem = state.items.find((i) => i.id === item.id);
    assert.equal(afterPurchaseItem.currentStock, 30);

    // Purchase Return (Debit Note) of 4 -> stock must decrease to 26
    state = database.createDebitNote({
      debitNo: "DN-STK-01",
      debitDate: "2026-08-16",
      invoiceNo: purchase.invoiceNo,
      party: supplier.name,
      partyId: supplier.id,
      placeOfSupply: "Karnataka",
      supplyType: "b2b",
      items: [{
        itemId: item.id,
        name: item.name,
        quantity: 4,
        unit: "Pcs",
        price: 70,
        taxRate: 18,
      }],
    });

    const afterReturnItem = state.items.find((i) => i.id === item.id);
    assert.equal(afterReturnItem.currentStock, 26, "Stock must decrease by returned quantity");

    const movements = state.stockMovements.filter((m) => m.debitNoteId === state.debitNotes[0].id);
    assert.equal(movements.length, 1);
    assert.equal(movements[0].movementType, "out", "Stock movement type for debit note must be 'out'");
    assert.equal(movements[0].quantity, 4);
  } finally {
    fixture.cleanup();
  }
}

async function testServiceItemZeroStockMovement() {
  const fixture = await createFixture("gi-dn-service-");
  try {
    const { supplier } = seedMasters();
    let state = database.createItem({
      name: "Equipment Maintenance",
      itemType: "service",
      sku: "SRV-MAINT",
      unit: "Job",
      purchasePrice: 1000,
      taxRate: 18,
      hsnSac: "998719",
    });
    const srvItem = state.items.find((i) => i.name === "Equipment Maintenance");

    // Purchase service bill
    const purchase = {
      id: "txn-srv-p",
      invoiceId: "inv-srv-p",
      invoiceNo: "PB-SRV-01",
      type: "purchase",
      party: supplier.name,
      partyId: supplier.id,
      paymentType: "credit",
      supplyType: "b2b",
      placeOfSupply: "Karnataka",
      firmState: "Karnataka",
      received: 0,
      date: "2026-08-17",
      items: [{
        item: srvItem.name,
        itemId: srvItem.id,
        qty: 1,
        unit: "Job",
        price: 1000,
        taxRate: 18,
        hsnSac: "998719",
      }],
    };
    state = database.createTransaction(purchase);

    // Verify 0 stock movements on service purchase
    const srvPurchMovements = state.stockMovements.filter((m) => m.itemId === srvItem.id);
    assert.equal(srvPurchMovements.length, 0, "Service purchase must never create stock movements");

    // Debit Note on service
    state = database.createDebitNote({
      debitNo: "DN-SRV-01",
      debitDate: "2026-08-18",
      invoiceNo: "PB-SRV-01",
      party: supplier.name,
      partyId: supplier.id,
      placeOfSupply: "Karnataka",
      supplyType: "b2b",
      items: [{
        itemId: srvItem.id,
        name: srvItem.name,
        quantity: 1,
        unit: "Job",
        price: 500,
        taxRate: 18,
        hsnSac: "998719",
      }],
    });

    const srvReturnMovements = state.stockMovements.filter((m) => m.itemId === srvItem.id);
    assert.equal(srvReturnMovements.length, 0, "Service debit note return must NEVER create stock movements");
  } finally {
    fixture.cleanup();
  }
}

async function testInputGstLedgerReversal() {
  const fixture = await createFixture("gi-dn-ledger-");
  try {
    const { supplier, item } = seedMasters();
    const purchase = sampleInvoice({ type: "purchase", party: supplier, item, id: "dn-ledg-p", qty: 10 });
    database.createTransaction(purchase);

    const state = database.createDebitNote({
      debitNo: "DN-LEDG-01",
      debitDate: "2026-08-19",
      invoiceNo: purchase.invoiceNo,
      party: supplier.name,
      partyId: supplier.id,
      placeOfSupply: "Karnataka",
      supplyType: "b2b",
      items: [{
        itemId: item.id,
        name: item.name,
        quantity: 2,
        unit: "Pcs",
        price: 70,
        taxRate: 18,
      }],
    });

    const dn = state.debitNotes[0];
    const ledger = state.ledgerEntries.filter((e) => e.transactionId === dn.id);
    assert.ok(ledger.length >= 3, "Debit note ledger must have entries for Payable, Purchases, and Tax");

    const payableEntry = ledger.find((e) => e.account === "Accounts Payable");
    const purchaseEntry = ledger.find((e) => e.account === "Purchases");
    const cgstEntry = ledger.find((e) => e.account === "Input CGST");
    const sgstEntry = ledger.find((e) => e.account === "Input SGST");

    assert.ok(payableEntry, "Accounts Payable entry must exist");
    assert.equal(payableEntry.debit, 165.2, "Accounts Payable must be DEBITED to reduce liability");
    assert.equal(payableEntry.credit, 0);

    assert.ok(purchaseEntry, "Purchases entry must exist");
    assert.equal(purchaseEntry.credit, 140, "Purchases must be CREDITED to reduce expense");
    assert.equal(purchaseEntry.debit, 0);

    assert.ok(cgstEntry, "Input CGST entry must exist");
    assert.equal(cgstEntry.credit, 12.6, "Input CGST must be CREDITED to reverse ITC");
    assert.equal(cgstEntry.debit, 0);

    assert.ok(sgstEntry, "Input SGST entry must exist");
    assert.equal(sgstEntry.credit, 12.6, "Input SGST must be CREDITED to reverse ITC");
    assert.equal(sgstEntry.debit, 0);

    const totalDebits = ledger.reduce((sum, e) => sum + Number(e.debit || 0), 0);
    const totalCredits = ledger.reduce((sum, e) => sum + Number(e.credit || 0), 0);
    assert.equal(totalDebits.toFixed(2), totalCredits.toFixed(2), "Total Debits must equal Total Credits for debit note");
  } finally {
    fixture.cleanup();
  }
}

async function testDebitNoteTaxEntries() {
  const fixture = await createFixture("gi-dn-tax-");
  try {
    const { supplier, item } = seedMasters();
    const purchase = sampleInvoice({ type: "purchase", party: supplier, item, id: "dn-tax-p", qty: 5 });
    database.createTransaction(purchase);

    database.createDebitNote({
      debitNo: "DN-TAX-01",
      debitDate: "2026-08-20",
      invoiceNo: purchase.invoiceNo,
      party: supplier.name,
      partyId: supplier.id,
      placeOfSupply: "Karnataka",
      supplyType: "b2b",
      items: [{
        itemId: item.id,
        name: item.name,
        quantity: 2,
        unit: "Pcs",
        price: 70,
        taxRate: 18,
        hsnSac: "1001",
      }],
    });

    const taxEntries = database.getTaxEntries({ sourceType: "debit_note" });
    assert.equal(taxEntries.length, 1, "Exactly one tax_entry must be posted for debit note");
    const entry = taxEntries[0];
    assert.equal(entry.documentNo, "DN-TAX-01");
    assert.equal(entry.taxableValue, 140);
    assert.equal(entry.cgst, 12.6);
    assert.equal(entry.sgst, 12.6);
    assert.equal(entry.igst, 0);
    assert.equal(entry.isCancelled, 0);
  } finally {
    fixture.cleanup();
  }
}

async function testSupplierPayableReduction() {
  const fixture = await createFixture("gi-dn-payable-");
  try {
    const { supplier, item } = seedMasters();
    // Purchase bill of 10 items @ 70 + 18% tax = 700 + 126 = 826
    const purchase = sampleInvoice({ type: "purchase", party: supplier, item, id: "dn-pay-p", qty: 10, received: 0 });
    let state = database.createTransaction(purchase);

    let party = state.parties.find((p) => p.id === supplier.id);
    assert.equal(party.payable, 826, "Supplier payable must initially be 826");
    assert.equal(party.balance, -826, "Supplier balance must initially be -826");

    // Return 3 items @ 70 + 18% tax = 210 + 37.8 = 247.8
    state = database.createDebitNote({
      debitNo: "DN-PAY-01",
      debitDate: "2026-08-21",
      invoiceNo: purchase.invoiceNo,
      party: supplier.name,
      partyId: supplier.id,
      placeOfSupply: "Karnataka",
      supplyType: "b2b",
      items: [{
        itemId: item.id,
        name: item.name,
        quantity: 3,
        unit: "Pcs",
        price: 70,
        taxRate: 18,
      }],
    });

    party = state.parties.find((p) => p.id === supplier.id);
    const expectedPayable = 826 - 247.8; // 578.2
    assert.equal(party.payable, Number(expectedPayable.toFixed(2)), "Supplier payable must decrease by debit note total");
    assert.equal(party.balance, -Number(expectedPayable.toFixed(2)), "Supplier balance must reflect reduced liability");
  } finally {
    fixture.cleanup();
  }
}

async function testDoubleEntryLedgerEquilibrium() {
  const fixture = await createFixture("gi-dn-equilibrium-");
  try {
    const { supplier, item } = seedMasters();
    const purchase = sampleInvoice({ type: "purchase", party: supplier, item, id: "dn-eq-p", qty: 8 });
    database.createTransaction(purchase);

    const state = database.createDebitNote({
      debitNo: "DN-EQ-01",
      debitDate: "2026-08-22",
      invoiceNo: purchase.invoiceNo,
      party: supplier.name,
      partyId: supplier.id,
      placeOfSupply: "Karnataka",
      supplyType: "b2b",
      items: [{
        itemId: item.id,
        name: item.name,
        quantity: 3,
        unit: "Pcs",
        price: 73.33,
        discount: 5.5,
        taxRate: 18,
      }],
    });

    const dn = state.debitNotes[0];
    const entries = state.ledgerEntries.filter((e) => e.transactionId === dn.id);
    const sumDebit = entries.reduce((s, e) => s + Number(e.debit || 0), 0);
    const sumCredit = entries.reduce((s, e) => s + Number(e.credit || 0), 0);
    assert.ok(Math.abs(sumDebit - sumCredit) < 0.001, `Ledger equilibrium must hold: Debit=${sumDebit} Credit=${sumCredit}`);
  } finally {
    fixture.cleanup();
  }
}

async function testDebitNoteCancellation() {
  const fixture = await createFixture("gi-dn-cancel-");
  try {
    const { supplier, item } = seedMasters();
    const purchase = sampleInvoice({ type: "purchase", party: supplier, item, id: "dn-canc-p", qty: 10 });
    database.createTransaction(purchase);

    let state = database.createDebitNote({
      debitNo: "DN-CANC-01",
      debitDate: "2026-08-23",
      invoiceNo: purchase.invoiceNo,
      party: supplier.name,
      partyId: supplier.id,
      placeOfSupply: "Karnataka",
      supplyType: "b2b",
      items: [{
        itemId: item.id,
        name: item.name,
        quantity: 2,
        unit: "Pcs",
        price: 70,
        taxRate: 18,
      }],
    });

    const dn = state.debitNotes[0];
    assert.equal(state.items.find((i) => i.id === item.id).currentStock, 28);

    // Cancel Debit Note
    state = database.setDebitNoteStatus({
      debitNoteId: dn.id,
      status: "cancelled",
      notes: "Cancellation test",
    });

    const cancelledDn = state.debitNotes.find((d) => d.id === dn.id);
    assert.equal(cancelledDn.status, "cancelled");

    // Stock must restore back to 30
    assert.equal(state.items.find((i) => i.id === item.id).currentStock, 30, "Stock must restore when debit note is cancelled");
    const dnMovements = state.stockMovements.filter((m) => m.debitNoteId === dn.id);
    assert.equal(dnMovements.length, 0, "Cancelled debit note stock movements must be deleted");

    // Tax entry must be marked cancelled
    const taxEntries = database.getTaxEntries({ sourceType: "debit_note" });
    const taxEntry = taxEntries.find((e) => e.documentNo === "DN-CANC-01");
    assert.equal(taxEntry.isCancelled, 1, "Tax entry must be cancelled");

    // Cancelled debit note ledger entries must be removed, and total ledger must remain balanced
    const dnLedger = state.ledgerEntries.filter((e) => e.transactionId === dn.id);
    assert.equal(dnLedger.length, 0, "Cancelled debit note ledger entries must be cleared");
    const totalDebits = state.ledgerEntries.reduce((s, e) => s + Number(e.debit || 0), 0);
    const totalCredits = state.ledgerEntries.reduce((s, e) => s + Number(e.credit || 0), 0);
    assert.ok(Math.abs(totalDebits - totalCredits) < 0.001, "Ledger must remain balanced after cancellation");
  } finally {
    fixture.cleanup();
  }
}

async function testMultiGstRates() {
  const fixture = await createFixture("gi-dn-multigst-");
  try {
    const { supplier } = seedMasters();
    const item5 = database.createItem({ name: "Sugar 5%", sku: "S5", unit: "Kg", purchasePrice: 40, taxRate: 5 }).items.find((i) => i.sku === "S5");
    const item12 = database.createItem({ name: "Butter 12%", sku: "B12", unit: "Kg", purchasePrice: 200, taxRate: 12 }).items.find((i) => i.sku === "B12");
    const item18 = database.createItem({ name: "Soap 18%", sku: "S18", unit: "Pcs", purchasePrice: 50, taxRate: 18 }).items.find((i) => i.sku === "S18");
    const item28 = database.createItem({ name: "AC Part 28%", sku: "A28", unit: "Pcs", purchasePrice: 1000, taxRate: 28 }).items.find((i) => i.sku === "A28");

    const state = database.createDebitNote({
      debitNo: "DN-MULTI-01",
      debitDate: "2026-08-24",
      party: supplier.name,
      partyId: supplier.id,
      placeOfSupply: "Karnataka",
      supplyType: "b2b",
      items: [
        { itemId: item5.id, name: item5.name, quantity: 10, unit: "Kg", price: 40, taxRate: 5 },       // 400 + 20 (CGST 10, SGST 10)
        { itemId: item12.id, name: item12.name, quantity: 2, unit: "Kg", price: 200, taxRate: 12 },    // 400 + 48 (CGST 24, SGST 24)
        { itemId: item18.id, name: item18.name, quantity: 4, unit: "Pcs", price: 50, taxRate: 18 },     // 200 + 36 (CGST 18, SGST 18)
        { itemId: item28.id, name: item28.name, quantity: 1, unit: "Pcs", price: 1000, taxRate: 28 },   // 1000 + 280 (CGST 140, SGST 140)
      ],
    });

    const dn = state.debitNotes[0];
    assert.equal(dn.subtotal, 2000);
    assert.equal(dn.cgstTotal, 192);
    assert.equal(dn.sgstTotal, 192);
    assert.equal(dn.igstTotal, 0);
    assert.equal(dn.taxTotal, 384);
    assert.equal(dn.total, 2384);

    const taxEntries = database.getTaxEntries({ sourceType: "debit_note" });
    assert.equal(taxEntries.length, 4, "Must create 4 tax entries, one per tax rate line");
  } finally {
    fixture.cleanup();
  }
}

async function testIntraVsInterStateGst() {
  const fixture = await createFixture("gi-dn-interstate-");
  try {
    const { supplier, item } = seedMasters();

    // Inter-state return to Maharashtra from Karnataka firm
    const state = database.createDebitNote({
      debitNo: "DN-INTER-01",
      debitDate: "2026-08-25",
      party: supplier.name,
      partyId: supplier.id,
      placeOfSupply: "Maharashtra",
      supplyType: "b2b",
      items: [{
        itemId: item.id,
        name: item.name,
        quantity: 1,
        unit: "Pcs",
        price: 1000,
        taxRate: 18,
      }],
    });

    const dn = state.debitNotes[0];
    assert.equal(dn.cgstTotal, 0, "Inter-state must have 0 CGST");
    assert.equal(dn.sgstTotal, 0, "Inter-state must have 0 SGST");
    assert.equal(dn.igstTotal, 180, "Inter-state must have 180 IGST");
    assert.equal(dn.total, 1180);

    const ledger = state.ledgerEntries.filter((e) => e.transactionId === dn.id);
    const igstEntry = ledger.find((e) => e.account === "Input IGST");
    assert.ok(igstEntry, "Input IGST ledger entry must exist for inter-state");
    assert.equal(igstEntry.credit, 180);
  } finally {
    fixture.cleanup();
  }
}

async function testMultiCompanyIsolation() {
  const fixture = await createFixture("gi-dn-multicompany-");
  try {
    // Current company: Company A (default testt)
    const { supplier, item } = seedMasters();
    database.createDebitNote({
      debitNo: "DN-COMPA-01",
      debitDate: "2026-08-26",
      party: supplier.name,
      partyId: supplier.id,
      items: [{ itemId: item.id, name: item.name, quantity: 1, unit: "Pcs", price: 100, taxRate: 18 }],
    });

    let stateA = database.getState();
    assert.equal(stateA.debitNotes.length, 1);

    // Switch to Company B
    database.setCurrentCompany("Branch Company Beta");
    let stateB = database.getState();
    assert.equal(stateB.debitNotes.length, 0, "Company B must have 0 debit notes (isolation guaranteed)");
    assert.equal(stateB.parties.length, 0, "Company B must not see Company A parties");

    // Switch back to Company A
    database.setCurrentCompany("testt");
    stateA = database.getState();
    assert.equal(stateA.debitNotes.length, 1, "Company A must retain its debit note");
  } finally {
    fixture.cleanup();
  }
}

async function testDocumentSequencePerFY() {
  const fixture = await createFixture("gi-dn-sequence-");
  try {
    const compId = database.getState().companies[0].id;

    // Financial Year 25-26 (June 2025)
    const seq1 = database.nextInvoiceNumber(compId, "debit_note", "2025-06-15");
    assert.equal(seq1, "DN-2526-0001", "Debit note sequence in FY25-26 must be DN-2526-0001");

    // Financial Year 26-27 (June 2026)
    const seq2 = database.nextInvoiceNumber(compId, "debit_note", "2026-06-15");
    assert.equal(seq2, "DN-2627-0001", "Debit note sequence in FY26-27 must reset to DN-2627-0001");
  } finally {
    fixture.cleanup();
  }
}

async function testAuditTrailLogging() {
  const fixture = await createFixture("gi-dn-audit-");
  try {
    const { supplier, item } = seedMasters();
    let state = database.createDebitNote({
      debitNo: "DN-AUDIT-01",
      debitDate: "2026-08-27",
      party: supplier.name,
      partyId: supplier.id,
      items: [{ itemId: item.id, name: item.name, quantity: 1, unit: "Pcs", price: 100, taxRate: 18 }],
    });

    const dn = state.debitNotes[0];

    // Check audit trail for creation
    let logs = database.getAuditTrail({ entityType: "debit_note" });
    assert.ok(logs.some((l) => l.action === "create" && l.entityId === dn.id), "Audit trail must log debit note create");

    // Cancel and check audit trail
    database.setDebitNoteStatus({ debitNoteId: dn.id, status: "cancelled", notes: "Audit cancel" });
    logs = database.getAuditTrail({ entityType: "debit_note" });
    assert.ok(logs.some((l) => l.action === "status_change" && l.entityId === dn.id), "Audit trail must log debit note status_change");

    // Delete and check audit trail
    database.deleteDebitNote({ debitNoteId: dn.id });
    logs = database.getAuditTrail({ entityType: "debit_note" });
    assert.ok(logs.some((l) => l.action === "delete" && l.entityId === dn.id), "Audit trail must log debit note delete");
  } finally {
    fixture.cleanup();
  }
}

async function testFYBoundaryCalculation() {
  // Direct test of local ISO regex date FY parsing
  const fy1 = database.currentFinancialYear("2026-03-31T23:59:59.999");
  assert.equal(fy1, "2526", "31 March 23:59:59 must belong to FY 25-26");

  const fy2 = database.currentFinancialYear("2026-04-01T00:00:00.000");
  assert.equal(fy2, "2627", "1 April 00:00:00 must belong to FY 26-27");

  const fy3 = database.currentFinancialYear("2026-03-31");
  assert.equal(fy3, "2526", "2026-03-31 must be FY 25-26");

  const fy4 = database.currentFinancialYear("2026-04-01");
  assert.equal(fy4, "2627", "2026-04-01 must be FY 26-27");
}

async function testTrialBalanceEquilibriumAcrossFullLifecycle() {
  const fixture = await createFixture("gi-dn-lifecycle-tb-");
  try {
    const { customer, supplier, item } = seedMasters();

    // 1. Sale Invoice: 5 items @ 100 + 18% = 590
    const sale = sampleInvoice({ type: "sale", party: customer, item, id: "tb-sale", qty: 5, received: 200 });
    database.createTransaction(sale);

    // 2. Purchase Bill: 10 items @ 70 + 18% = 826
    const purchase = sampleInvoice({ type: "purchase", party: supplier, item, id: "tb-purch", qty: 10, received: 300 });
    database.createTransaction(purchase);

    // 3. Sale Return (Credit Note): 1 item @ 100 + 18% = 118
    database.createCreditNote({
      creditNo: "CN-TB-01",
      creditDate: "2026-08-28",
      invoiceNo: sale.invoiceNo,
      party: customer.name,
      partyId: customer.id,
      supplyType: "b2c",
      placeOfSupply: "Karnataka",
      items: [{ itemId: item.id, name: item.name, quantity: 1, unit: "Pcs", price: 100, taxRate: 18 }],
    });

    // 4. Purchase Return (Debit Note): 2 items @ 70 + 18% = 165.2
    database.createDebitNote({
      debitNo: "DN-TB-01",
      debitDate: "2026-08-28",
      invoiceNo: purchase.invoiceNo,
      party: supplier.name,
      partyId: supplier.id,
      supplyType: "b2b",
      placeOfSupply: "Karnataka",
      items: [{ itemId: item.id, name: item.name, quantity: 2, unit: "Pcs", price: 70, taxRate: 18 }],
    });

    // 5. Expense: Office Rent 500
    database.createTransaction({
      id: "txn-tb-exp",
      type: "expense",
      category: "Rent",
      amount: 500,
      paymentMethod: "Bank",
      date: "2026-08-29",
      notes: "Office rent",
    });

    const state = database.getState();
    const ledger = state.ledgerEntries || [];
    assert.ok(ledger.length >= 10, "Multiple transactions must produce rich ledger entries");

    const totalDebits = ledger.reduce((sum, e) => sum + Number(e.debit || 0), 0);
    const totalCredits = ledger.reduce((sum, e) => sum + Number(e.credit || 0), 0);

    const diff = Math.abs(totalDebits - totalCredits);
    assert.ok(
      diff < 0.01,
      `TRIAL BALANCE EQUILIBRIUM FAILED: Total Debits = ${totalDebits.toFixed(2)}, Total Credits = ${totalCredits.toFixed(2)}, Diff = ${diff}`
    );
  } finally {
    fixture.cleanup();
  }
}

run().catch((error) => {
  console.error("Test failure:", error);
  process.exitCode = 1;
});
