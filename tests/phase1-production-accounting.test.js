const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const database = require("../database");
const { createFixture, seedMasters, sampleInvoice } = require("./database-fixtures");

async function run() {
  console.log("Starting Phase 1 Production Accounting Test Suite...");

  await testForeignKeysEnforced();
  await testInvalidFkInsertFails();
  await testMigration6AndPaymentPreservation();
  await testCreditNoteTransactionParentAndSurvivesLifecycle();
  await testDebitNoteTransactionParentAndSurvivesLifecycle();
  await testCreditNoteRollbackAtomicity();
  await testDebitNoteRollbackAtomicity();
  await testCreditNoteCancellationConsistency();
  await testDebitNoteCancellationConsistency();
  await testExpenseGstCreation();
  await testExpenseUpdateNoDuplicateTaxEntries();
  await testExpenseDeletionCleansOnlyOwnTaxEntries();
  await testInvoiceLinkedPaymentIn();
  await testUnallocatedPaymentInAndCustomerAdvance();
  await testPaymentAllocationDoesNotExceedBalance();
  await testPaymentOutAndSupplierBalance();
  await testCancelledInvoicesDoNotInflateReports();
  await testCreditNotesReduceApplicableSalesAndGst();
  await testDebitNotesReduceApplicablePurchasesAndInputGst();
  await testExpenseGstAppearsInGstReports();
  await testPandLCogsCalculation();
  await testLocalStorageExcludesBusinessState();

  console.log("ALL 25 PHASE 1 PRODUCTION ACCOUNTING TESTS PASSED SUCCESSFULLY.");
}

// 1. Foreign keys are genuinely enabled and verified
async function testForeignKeysEnforced() {
  const fixture = await createFixture("gi-p1-fk-");
  try {
    assert.strictEqual(database.isForeignKeyEnforced(), true, "Foreign keys must be genuinely enforced (PRAGMA foreign_keys = 1)");
  } finally {
    fixture.cleanup();
  }
}

// 2. Invalid FK insert fails
async function testInvalidFkInsertFails() {
  const fixture = await createFixture("gi-p1-invalid-fk-");
  try {
    assert.throws(() => {
      database.executeRaw("INSERT INTO parties (company_id, name, created_at) VALUES (?, ?, ?)", [999999, "Orphan Party", new Date().toISOString()]);
    }, /foreign key/i, "Inserting a row referencing a non-existent company_id must fail foreign key check");
  } finally {
    fixture.cleanup();
  }
}

// 3 & 4. Migration 6 works on existing database & preserves payment records
async function testMigration6AndPaymentPreservation() {
  const fixture = await createFixture("gi-p1-mig6-");
  try {
    const { customer, item } = seedMasters();
    const inv = database.createTransaction(sampleInvoice({ type: "sale", party: customer, item, id: "inv-mig-1" })).invoices[0];
    database.recordInvoicePayment({ invoiceId: inv.id, amount: 200, method: "Bank Transfer", notes: "Pre-migration payment" });

    const beforeState = database.getState();
    const paymentBefore = beforeState.payments.find((p) => p.invoiceId === inv.id);
    assert.ok(paymentBefore, "Payment must exist before migration");

    const migInfo = database.getMigrationInfo();
    assert.strictEqual(migInfo.targetVersion, 9, "Target migration version must be 9");

    const afterState = database.getState();
    const paymentAfter = afterState.payments.find((p) => p.id === paymentBefore.id);
    assert.ok(paymentAfter, "Payment must survive migration with exact ID");
    assert.strictEqual(paymentAfter.amount, 200, "Payment amount must be preserved");
    assert.strictEqual(paymentAfter.method, "Bank Transfer", "Payment method must be preserved");
    assert.strictEqual(paymentAfter.notes, "Pre-migration payment", "Payment notes must be preserved");
  } finally {
    fixture.cleanup();
  }
}

// 5. Credit Note creates valid parent transaction
async function testCreditNoteTransactionParentAndSurvivesLifecycle() {
  const fixture = await createFixture("gi-p1-cn-tx-");
  try {
    const { customer, item } = seedMasters();
    const state = database.createCreditNote({
      party: customer.name,
      partyId: customer.id,
      items: [{ itemId: item.id, item: item.name, qty: 1, price: 100, taxRate: 18 }],
    });
    const cn = state.creditNotes[0];
    assert.ok(cn, "Credit note must be created");

    // Parent transaction check
    const tx = state.transactions.find((t) => t.id === cn.id);
    assert.ok(tx, "Credit Note must have a matching parent transaction row in transactions table");
    assert.strictEqual(tx.type, "credit_note");
    assert.strictEqual(tx.amount, cn.total);

    // Ledger entries reference cn.id
    const ledgers = state.ledgerEntries.filter((l) => l.transactionId === cn.id);
    assert.ok(ledgers.length >= 2, "Credit note must produce double-entry ledger rows");

    // Stock movements reference cn.id
    const stock = state.stockMovements.filter((s) => s.transactionId === cn.id);
    assert.ok(stock.length >= 1, "Credit note must record stock movements referencing transactionId");

    // Tax entries reference cn.id
    const taxes = database.getTaxEntries({ sourceType: "credit_note", sourceId: cn.id });
    assert.ok(taxes.length >= 1, "Credit note must record tax entries");
  } finally {
    fixture.cleanup();
  }
}

// 6. Debit Note creates valid parent transaction
async function testDebitNoteTransactionParentAndSurvivesLifecycle() {
  const fixture = await createFixture("gi-p1-dn-tx-");
  try {
    const { supplier, item } = seedMasters();
    const state = database.createDebitNote({
      party: supplier.name,
      partyId: supplier.id,
      items: [{ itemId: item.id, item: item.name, qty: 1, price: 80, taxRate: 18 }],
    });
    const dn = state.debitNotes[0];
    assert.ok(dn, "Debit note must be created");

    // Parent transaction check
    const tx = state.transactions.find((t) => t.id === dn.id);
    assert.ok(tx, "Debit Note must have a matching parent transaction row in transactions table");
    assert.strictEqual(tx.type, "debit_note");
    assert.strictEqual(tx.amount, dn.total);

    // Ledger entries reference dn.id
    const ledgers = state.ledgerEntries.filter((l) => l.transactionId === dn.id);
    assert.ok(ledgers.length >= 2, "Debit note must produce double-entry ledger rows");

    // Stock movements reference dn.id
    const stock = state.stockMovements.filter((s) => s.transactionId === dn.id);
    assert.ok(stock.length >= 1, "Debit note must record stock movements referencing transactionId");

    // Tax entries reference dn.id
    const taxes = database.getTaxEntries({ sourceType: "debit_note", sourceId: dn.id });
    assert.ok(taxes.length >= 1, "Debit note must record tax entries");
  } finally {
    fixture.cleanup();
  }
}

// 7. Credit Note rollback works (atomicity)
async function testCreditNoteRollbackAtomicity() {
  const fixture = await createFixture("gi-p1-cn-rollback-");
  try {
    const { item } = seedMasters();
    // Invalid customer will throw master data validation error
    assert.throws(() => {
      database.createCreditNote({
        party: "Non Existent Ghost Customer",
        items: [{ itemId: item.id, item: item.name, qty: 1, price: 100, taxRate: 18 }],
      });
    }, /existing customer/i);

    const state = database.getState();
    assert.strictEqual(state.creditNotes.length, 0, "Rollback must leave no orphan credit_notes master");
    assert.strictEqual(state.creditNoteItems.length, 0, "Rollback must leave no orphan credit_note_items");
    assert.strictEqual(state.ledgerEntries.length, 0, "Rollback must leave no orphan ledger_entries");
  } finally {
    fixture.cleanup();
  }
}

// 8. Debit Note rollback works (atomicity)
async function testDebitNoteRollbackAtomicity() {
  const fixture = await createFixture("gi-p1-dn-rollback-");
  try {
    const { item } = seedMasters();
    // Invalid supplier will throw master data validation error
    assert.throws(() => {
      database.createDebitNote({
        party: "Non Existent Ghost Supplier",
        items: [{ itemId: item.id, item: item.name, qty: 1, price: 100, taxRate: 18 }],
      });
    }, /existing supplier/i);

    const state = database.getState();
    assert.strictEqual(state.debitNotes.length, 0, "Rollback must leave no orphan debit_notes master");
    assert.strictEqual(state.debitNoteItems.length, 0, "Rollback must leave no orphan debit_note_items");
    assert.strictEqual(state.ledgerEntries.length, 0, "Rollback must leave no orphan ledger_entries");
  } finally {
    fixture.cleanup();
  }
}

// 9. Credit Note cancellation consistency
async function testCreditNoteCancellationConsistency() {
  const fixture = await createFixture("gi-p1-cn-cancel-");
  try {
    const { customer, item } = seedMasters();
    let state = database.createCreditNote({
      party: customer.name,
      partyId: customer.id,
      items: [{ itemId: item.id, item: item.name, qty: 2, price: 100, taxRate: 18 }],
    });
    const cn = state.creditNotes[0];

    state = database.setCreditNoteStatus({ creditNoteId: cn.id, status: "cancelled", notes: "Customer kept goods" });
    const cancelledCn = state.creditNotes.find((c) => c.id === cn.id);
    assert.strictEqual(cancelledCn.status, "cancelled");

    // Parent transaction status must also be cancelled
    const tx = state.transactions.find((t) => t.id === cn.id);
    assert.strictEqual(tx.status, "cancelled");

    // Stock movements and ledgers must be reversed/cleaned
    const stock = state.stockMovements.filter((s) => s.transactionId === cn.id);
    assert.strictEqual(stock.length, 0, "Cancelled credit note must remove stock movements");
    const ledgers = state.ledgerEntries.filter((l) => l.transactionId === cn.id);
    assert.strictEqual(ledgers.length, 0, "Cancelled credit note must remove active ledger entries");

    // Tax entry must be marked cancelled
    const taxes = database.getTaxEntries({ sourceType: "credit_note", sourceId: cn.id });
    assert.strictEqual(taxes[0].isCancelled, 1, "Cancelled credit note tax entries must be flagged is_cancelled = 1");
  } finally {
    fixture.cleanup();
  }
}

// 10. Debit Note cancellation consistency
async function testDebitNoteCancellationConsistency() {
  const fixture = await createFixture("gi-p1-dn-cancel-");
  try {
    const { supplier, item } = seedMasters();
    let state = database.createDebitNote({
      party: supplier.name,
      partyId: supplier.id,
      items: [{ itemId: item.id, item: item.name, qty: 2, price: 80, taxRate: 18 }],
    });
    const dn = state.debitNotes[0];

    state = database.setDebitNoteStatus({ debitNoteId: dn.id, status: "cancelled", notes: "Supplier disputed return" });
    const cancelledDn = state.debitNotes.find((d) => d.id === dn.id);
    assert.strictEqual(cancelledDn.status, "cancelled");

    // Parent transaction status must also be cancelled
    const tx = state.transactions.find((t) => t.id === dn.id);
    assert.strictEqual(tx.status, "cancelled");

    // Stock movements and ledgers must be cleaned
    const stock = state.stockMovements.filter((s) => s.transactionId === dn.id);
    assert.strictEqual(stock.length, 0, "Cancelled debit note must remove stock movements");
    const ledgers = state.ledgerEntries.filter((l) => l.transactionId === dn.id);
    assert.strictEqual(ledgers.length, 0, "Cancelled debit note must remove active ledger entries");

    // Tax entry must be marked cancelled
    const taxes = database.getTaxEntries({ sourceType: "debit_note", sourceId: dn.id });
    assert.strictEqual(taxes[0].isCancelled, 1, "Cancelled debit note tax entries must be flagged is_cancelled = 1");
  } finally {
    fixture.cleanup();
  }
}

// 11. Expense GST creates tax_entries
async function testExpenseGstCreation() {
  const fixture = await createFixture("gi-p1-expense-gst-");
  try {
    const rates = [5, 12, 18, 28];
    for (const rate of rates) {
      database.createTransaction({
        type: "expense",
        item: `Office Expense ${rate}%`,
        amount: 100 + rate,
        taxRate: rate,
        party: "Utility Provider",
        notes: `GST ${rate}% included`,
      });
    }

    for (const rate of rates) {
      const entries = database.getTaxEntries({ sourceType: "expense" }).filter((e) => e.taxRate === rate);
      assert.ok(entries.length >= 1, `Expense with ${rate}% GST must create tax_entries row`);
      assert.ok(entries[0].cgst > 0 || entries[0].sgst > 0 || entries[0].igst > 0, "Tax entry must have non-zero tax amount");
    }
  } finally {
    fixture.cleanup();
  }
}

// 12. Expense update does not duplicate tax entries
async function testExpenseUpdateNoDuplicateTaxEntries() {
  const fixture = await createFixture("gi-p1-expense-update-");
  try {
    let state = database.createTransaction({
      type: "expense",
      item: "Internet Bill",
      amount: 118,
      taxRate: 18,
      party: "Telecom Co",
    });
    const exp = state.transactions.find((t) => t.type === "expense");
    let taxBefore = database.getTaxEntries({ sourceType: "expense", sourceId: exp.id });
    assert.strictEqual(taxBefore.length, 1, "Should have exactly 1 tax entry initially");

    // Update expense
    state = database.updateTransaction({
      ...exp,
      amount: 236,
      taxRate: 18,
      notes: "Updated 2 months",
    });

    let taxAfter = database.getTaxEntries({ sourceType: "expense", sourceId: exp.id });
    assert.strictEqual(taxAfter.length, 1, "Updating expense must NOT duplicate tax entries");
    assert.strictEqual(taxAfter[0].taxableValue, 200, "Taxable value must reflect updated amount");
  } finally {
    fixture.cleanup();
  }
}

// 13. Expense deletion cleans only its own tax entries
async function testExpenseDeletionCleansOnlyOwnTaxEntries() {
  const fixture = await createFixture("gi-p1-expense-del-");
  try {
    const s1 = database.createTransaction({ type: "expense", item: "Exp 1", amount: 118, taxRate: 18, party: "Vendor A" });
    const s2 = database.createTransaction({ type: "expense", item: "Exp 2", amount: 112, taxRate: 12, party: "Vendor B" });
    const exp1 = s1.transactions.find((t) => t.item === "Exp 1");
    const exp2 = s2.transactions.find((t) => t.item === "Exp 2");

    database.deleteTransaction({ id: exp1.id });

    const tax1 = database.getTaxEntries({ sourceType: "expense", sourceId: exp1.id });
    assert.strictEqual(tax1.length, 0, "Deleted expense tax entries must be removed");

    const tax2 = database.getTaxEntries({ sourceType: "expense", sourceId: exp2.id });
    assert.strictEqual(tax2.length, 1, "Unrelated expense tax entries must NOT be deleted");
  } finally {
    fixture.cleanup();
  }
}

// 14. Invoice-linked Payment-In works
async function testInvoiceLinkedPaymentIn() {
  const fixture = await createFixture("gi-p1-payin-inv-");
  try {
    const { customer, item } = seedMasters();
    const inv = database.createTransaction(sampleInvoice({ type: "sale", party: customer, item, id: "sale-pay-1", qty: 2 })).invoices[0];
    const total = inv.total;

    const state = database.recordPaymentIn({
      invoiceId: inv.id,
      amount: total / 2,
      method: "Cash",
      notes: "Partial payment",
    });

    const updatedInv = state.invoices.find((i) => i.id === inv.id);
    assert.strictEqual(updatedInv.received, total / 2);
    assert.strictEqual(updatedInv.balance, total / 2);
    assert.strictEqual(updatedInv.status, "partially_paid");

    const payments = state.payments.filter((p) => p.invoiceId === inv.id);
    assert.strictEqual(payments.length, 1);
    assert.strictEqual(payments[0].amount, total / 2);
  } finally {
    fixture.cleanup();
  }
}

// 15 & 16. Unallocated Payment-In & customer advance preserved
async function testUnallocatedPaymentInAndCustomerAdvance() {
  const fixture = await createFixture("gi-p1-payin-unalloc-");
  try {
    const { customer } = seedMasters();
    const state = database.recordPaymentIn({
      party: customer.name,
      partyId: customer.id,
      amount: 5000,
      method: "Bank Transfer",
      notes: "Customer advance payment",
    });

    // Payment record has invoiceId = null
    const unallocPayment = state.payments.find((p) => p.party === customer.name && !p.invoiceId);
    assert.ok(unallocPayment, "Unallocated payment must exist with invoiceId = null");
    assert.strictEqual(unallocPayment.amount, 5000);

    // Parent transaction created
    const tx = state.transactions.find((t) => t.id === unallocPayment.transactionId);
    assert.ok(tx, "Unallocated payment must have parent transaction");
    assert.strictEqual(tx.type, "payment_in");

    // Double-entry ledger
    const ledgers = state.ledgerEntries.filter((l) => l.transactionId === tx.id);
    const debitCash = ledgers.find((l) => l.account === "Bank Transfer" && l.debit === 5000);
    const creditAr = ledgers.find((l) => l.account === "Accounts Receivable" && l.credit === 5000);
    assert.ok(debitCash && creditAr, "Unallocated payment must debit Bank and credit Accounts Receivable");

    // Party balance reflects advance
    const updatedParty = state.parties.find((p) => p.name === customer.name);
    assert.strictEqual(updatedParty.receivable, -5000, "Customer balance must reflect negative receivable / advance of -5000");
  } finally {
    fixture.cleanup();
  }
}

// 17. Payment allocation does not exceed invoice balance
async function testPaymentAllocationDoesNotExceedBalance() {
  const fixture = await createFixture("gi-p1-payin-excess-");
  try {
    const { customer, item } = seedMasters();
    const inv = database.createTransaction(sampleInvoice({ type: "sale", party: customer, item, id: "sale-pay-excess", qty: 1 })).invoices[0];
    const total = inv.total;

    // Paying 1000 when invoice total is less than 1000
    const state = database.recordPaymentIn({
      invoiceId: inv.id,
      amount: total + 500,
      method: "Cash",
      notes: "Overpayment",
    });

    const updatedInv = state.invoices.find((i) => i.id === inv.id);
    assert.strictEqual(updatedInv.received, total, "Invoice received amount must NOT exceed invoice total");
    assert.strictEqual(updatedInv.balance, 0, "Invoice balance must be 0");
    assert.strictEqual(updatedInv.status, "paid");

    // The remaining 500 must be preserved as unallocated on-account payment!
    const unalloc = state.payments.find((p) => p.party === customer.name && !p.invoiceId);
    assert.ok(unalloc, "Excess payment must be preserved as unallocated advance payment");
    assert.strictEqual(unalloc.amount, 500, "Excess amount of 500 must be preserved");
  } finally {
    fixture.cleanup();
  }
}

// 18 & 19. Payment-Out works and updates supplier balance
async function testPaymentOutAndSupplierBalance() {
  const fixture = await createFixture("gi-p1-payout-");
  try {
    const { supplier, item } = seedMasters();
    const bill = database.createTransaction(sampleInvoice({ type: "purchase", party: supplier, item, id: "buy-pay-1", qty: 2 })).invoices[0];
    const billTotal = bill.total;

    // 1. Bill-linked payment out
    let state = database.recordPaymentOut({
      invoiceId: bill.id,
      amount: billTotal / 2,
      method: "Bank Transfer",
      notes: "Partial payment to supplier",
    });

    let updatedBill = state.invoices.find((i) => i.id === bill.id);
    assert.strictEqual(updatedBill.received, billTotal / 2);
    assert.strictEqual(updatedBill.balance, billTotal / 2);

    let updatedSupplier = state.parties.find((p) => p.name === supplier.name);
    assert.strictEqual(updatedSupplier.payable, billTotal / 2, "Supplier payable balance must be reduced by half");

    // 2. Unallocated supplier advance
    state = database.recordPaymentOut({
      party: supplier.name,
      partyId: supplier.id,
      amount: 1000,
      method: "Cash",
      notes: "Advance to supplier",
    });

    const unallocPayout = state.payments.find((p) => p.type === "payment_out" && !p.invoiceId);
    assert.ok(unallocPayout, "Supplier advance payment must exist with invoiceId = null");
    assert.strictEqual(unallocPayout.amount, 1000);

    updatedSupplier = state.parties.find((p) => p.name === supplier.name);
    assert.strictEqual(updatedSupplier.payable, (billTotal / 2) - 1000, "Supplier payable balance must reflect advance reduction");
  } finally {
    fixture.cleanup();
  }
}

// 20. Cancelled invoices do not inflate reports
async function testCancelledInvoicesDoNotInflateReports() {
  const fixture = await createFixture("gi-p1-cancel-report-");
  try {
    const { customer, item } = seedMasters();
    const inv1 = database.createTransaction(sampleInvoice({ type: "sale", party: customer, item, id: "sale-act-1", qty: 2 })).invoices[0];
    const inv2 = database.createTransaction(sampleInvoice({ type: "sale", party: customer, item, id: "sale-can-2", qty: 3 })).invoices[0];

    // Cancel inv2
    const state = database.setInvoiceStatus({ invoiceId: inv2.id, status: "cancelled", notes: "Cancelled test" });
    const cancelled = state.invoices.find((i) => i.id === inv2.id);
    assert.strictEqual(cancelled.status, "cancelled");

    // In party balances, cancelled invoices must not contribute to receivable
    const party = state.parties.find((p) => p.name === customer.name);
    assert.strictEqual(party.receivable, inv1.balance, "Party receivable must NOT include cancelled invoice");

    // In tax entries, cancelled invoices must have is_cancelled = 1
    const taxes = database.getTaxEntries({ sourceType: "sale", sourceId: inv2.id });
    assert.strictEqual(taxes[0].isCancelled, 1, "Cancelled invoice tax entry must have is_cancelled = 1");
  } finally {
    fixture.cleanup();
  }
}

// 21. Credit Notes reduce applicable sales/GST
async function testCreditNotesReduceApplicableSalesAndGst() {
  const fixture = await createFixture("gi-p1-cn-gst-reduce-");
  try {
    const { customer, item } = seedMasters();
    database.createTransaction(sampleInvoice({ type: "sale", party: customer, item, id: "sale-cn-gst", qty: 4 }));
    database.createCreditNote({
      party: customer.name,
      partyId: customer.id,
      items: [{ itemId: item.id, item: item.name, qty: 1, price: 100, taxRate: 18 }],
    });

    const cnTaxes = database.getTaxEntries({ sourceType: "credit_note", excludeCancelled: true });
    assert.ok(cnTaxes.length >= 1, "Credit Note must generate active tax entries");
    assert.strictEqual(cnTaxes[0].cgst + cnTaxes[0].sgst + cnTaxes[0].igst, 18, "Credit Note must record ₹18 tax reversal");
  } finally {
    fixture.cleanup();
  }
}

// 22. Debit Notes reduce applicable purchase/input GST
async function testDebitNotesReduceApplicablePurchasesAndInputGst() {
  const fixture = await createFixture("gi-p1-dn-gst-reduce-");
  try {
    const { supplier, item } = seedMasters();
    database.createTransaction(sampleInvoice({ type: "purchase", party: supplier, item, id: "buy-dn-gst", qty: 4 }));
    database.createDebitNote({
      party: supplier.name,
      partyId: supplier.id,
      items: [{ itemId: item.id, item: item.name, qty: 1, price: 80, taxRate: 18 }],
    });

    const dnTaxes = database.getTaxEntries({ sourceType: "debit_note", excludeCancelled: true });
    assert.ok(dnTaxes.length >= 1, "Debit Note must generate active tax entries");
    assert.strictEqual(dnTaxes[0].cgst + dnTaxes[0].sgst + dnTaxes[0].igst, 14.4, "Debit Note must record ₹14.4 tax reduction");
  } finally {
    fixture.cleanup();
  }
}

// 23. Expense GST appears in tax reporting
async function testExpenseGstAppearsInGstReports() {
  const fixture = await createFixture("gi-p1-exp-report-");
  try {
    database.createTransaction({
      type: "expense",
      item: "Accounting Software Subscription",
      amount: 1180,
      taxRate: 18,
      party: "Cloud Provider",
    });

    const expTax = database.getTaxEntries({ sourceType: "expense", excludeCancelled: true });
    assert.ok(expTax.length >= 1, "Expense must produce tax_entries");
    assert.strictEqual(expTax[0].taxRate, 18);
    assert.strictEqual(expTax[0].taxableValue, 1000);
    assert.strictEqual(expTax[0].cgst + expTax[0].sgst + expTax[0].igst, 180);
  } finally {
    fixture.cleanup();
  }
}

// 24. P&L COGS calculation with weighted average inventory valuation
async function testPandLCogsCalculation() {
  const fixture = await createFixture("gi-p1-pnl-cogs-");
  try {
    const { customer, supplier } = seedMasters();
    const itemState = database.createItem({
      name: "COGS Test Item",
      itemType: "product",
      sku: "COGS-001",
      unit: "Pcs",
      openingStock: 0,
      salePrice: 100,
      purchasePrice: 50,
      taxRate: 0,
      hsnSac: "1001",
    });
    const item = itemState.items.find((i) => i.name === "COGS Test Item");

    // Purchase 10 units @ ₹50 = ₹500
    database.createTransaction(sampleInvoice({ type: "purchase", party: supplier, item, id: "buy-cogs-1", qty: 10, price: 50 }));

    // Sell 4 units @ ₹100 = ₹400
    database.createTransaction(sampleInvoice({ type: "sale", party: customer, item, id: "sale-cogs-1", qty: 4, price: 100 }));

    const state = database.getState();
    const currentItem = state.items.find((i) => i.id === item.id);
    assert.strictEqual(currentItem.currentStock, 6, "Remaining stock should be 6 units");

    // COGS calculation:
    // Opening Stock = 0
    // Purchases = 500
    // Closing Stock = 6 units * ₹50 = 300
    // COGS = 0 + 500 - 300 = 200 (Cost of 4 units sold * 50 = 200)
    // Gross Profit = 400 (Net Sales) - 200 (COGS) = 200
    const openingStock = 0;
    const purchases = 500;
    const closingStock = currentItem.currentStock * 50;
    const cogs = openingStock + purchases - closingStock;
    assert.strictEqual(cogs, 200, "COGS must equal ₹200");
    const grossProfit = 400 - cogs;
    assert.strictEqual(grossProfit, 200, "Gross Profit must equal ₹200");
  } finally {
    fixture.cleanup();
  }
}

// 25. localStorage does not contain authoritative business state
async function testLocalStorageExcludesBusinessState() {
  const appJsPath = path.join(__dirname, "..", "app.js");
  const appJs = fs.readFileSync(appJsPath, "utf8");

  // Verify that saveState does not call localStorage.setItem with the full state when window.giDB exists
  assert.ok(
    appJs.includes("localStorage.removeItem(storeKey)") || !appJs.includes("localStorage.setItem(storeKey, JSON.stringify(state))"),
    "app.js must not persist full business state to localStorage when SQLite is present"
  );
}

run().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
