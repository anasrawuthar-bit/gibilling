const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const database = require("../database");
const { createFixture, sampleInvoice } = require("./database-fixtures");
const { queryRows } = require("../database-migrations");

async function runRuntimeAudit() {
  console.log("=== STARTING PHASE 1 RUNTIME INTEGRITY & LIFECYCLE AUDIT ===");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gi-p1-runtime-audit-"));
  console.log(`Database initialized at: ${tempDir}`);

  try {
    await database.initDatabase(tempDir);
    assert.strictEqual(database.isForeignKeyEnforced(), true, "Connection must enforce foreign keys");

    // 1. Create test company
    console.log("1. Creating test company...");
    database.createCompany({ businessName: "Phase 1 Runtime Enterprise" });
    const company = database.getState().companies.find((c) => c.name === "Phase 1 Runtime Enterprise");
    assert.ok(company, "Company should exist");
    database.setCurrentCompany("Phase 1 Runtime Enterprise");

    // 2. Create customer
    console.log("2. Creating customer...");
    let state = database.createParty({
      name: "Apex Retailers",
      type: "customer",
      phone: "9876543210",
      gstin: "29AAAAA0000A1Z5",
      state: "Karnataka",
    });
    const customer = state.parties.find((p) => p.name === "Apex Retailers");
    assert.ok(customer, "Customer created");

    // 3. Create supplier
    console.log("3. Creating supplier...");
    state = database.createParty({
      name: "Zenith Wholesalers",
      type: "supplier",
      phone: "9876543211",
      gstin: "29BBBBB0000B1Z6",
      state: "Karnataka",
    });
    const supplier = state.parties.find((p) => p.name === "Zenith Wholesalers");
    assert.ok(supplier, "Supplier created");

    // 4. Create products
    console.log("4. Creating product...");
    state = database.createItem({
      name: "Premium Widget",
      itemType: "product",
      sku: "WIDGET-001",
      unit: "Pcs",
      openingStock: 10,
      purchasePrice: 100,
      salePrice: 150,
      taxRate: 18,
      hsnSac: "8471",
    });
    const item = state.items.find((i) => i.name === "Premium Widget");
    assert.ok(item, "Item created");
    assert.strictEqual(item.currentStock, 10, "Opening stock should be 10");

    // 5. Purchase stock: 50 units @ 100 + 18% GST = 5,000 + 900 = 5,900
    console.log("5. Purchasing stock...");
    state = database.createTransaction({
      type: "purchase",
      party: supplier.name,
      partyId: supplier.id,
      paymentType: "credit",
      items: [{
        item: item.name,
        itemId: item.id,
        qty: 50,
        unit: "Pcs",
        price: 100,
        taxRate: 18,
        hsnSac: "8471",
      }],
    });
    const purchaseInvoice = state.invoices.find((inv) => inv.type === "purchase");
    assert.ok(purchaseInvoice, "Purchase invoice created");
    assert.strictEqual(purchaseInvoice.total, 5900);

    // Stock should now be 10 + 50 = 60
    const itemAfterPurchase = database.getState().items.find((i) => i.id === item.id);
    assert.strictEqual(itemAfterPurchase.currentStock, 60, "Stock after purchase must be 60");

    // 6. Create sale: 20 units @ 150 + 18% GST = 3,000 + 540 = 3,540
    console.log("6. Creating sale invoice...");
    state = database.createTransaction({
      type: "sale",
      party: customer.name,
      partyId: customer.id,
      paymentType: "credit",
      items: [{
        item: item.name,
        itemId: item.id,
        qty: 20,
        unit: "Pcs",
        price: 150,
        taxRate: 18,
        hsnSac: "8471",
      }],
    });
    const saleInvoice = state.invoices.find((inv) => inv.type === "sale");
    assert.ok(saleInvoice, "Sale invoice created");
    assert.strictEqual(saleInvoice.total, 3540);

    // Stock should now be 60 - 20 = 40
    const itemAfterSale = database.getState().items.find((i) => i.id === item.id);
    assert.strictEqual(itemAfterSale.currentStock, 40, "Stock after sale must be 40");

    // 7. Receive invoice-linked payment: ₹1,500 linked to saleInvoice
    console.log("7. Receiving invoice-linked payment (₹1,500)...");
    state = database.recordPaymentIn({
      partyId: customer.id,
      partyName: customer.name,
      amount: 1500,
      invoiceId: saleInvoice.id,
      method: "Bank Transfer",
      notes: "Partial payment for sale invoice",
    });
    const linkedPay = state.payments.find((p) => p.invoiceId === saleInvoice.id);
    assert.ok(linkedPay, "Linked payment must exist");
    assert.strictEqual(linkedPay.amount, 1500);

    // 8. Receive unallocated customer payment: ₹1,000 on-account advance
    console.log("8. Receiving unallocated customer payment (₹1,000)...");
    state = database.recordPaymentIn({
      partyId: customer.id,
      partyName: customer.name,
      amount: 1000,
      method: "Cash",
      notes: "On-account advance payment",
    });
    const unallocatedPay = state.payments.find((p) => p.partyId === customer.id && !p.invoiceId);
    assert.ok(unallocatedPay, "Unallocated payment must exist");
    assert.strictEqual(unallocatedPay.amount, 1000);
    assert.strictEqual(unallocatedPay.invoiceId, null);

    // Customer receivable check:
    // Invoice total = 3540. Linked paid = 1500. Outstanding invoice balance = 2040.
    // Unallocated on-account credit = 1000.
    // Net receivable balance = 2040 - 1000 = 1040.
    const custAfterPay = database.getState().parties.find((p) => p.id === customer.id);
    assert.strictEqual(custAfterPay.receivable, 1040, "Net receivable balance must be ₹1,040");

    // 9. Create Credit Note: 2 units returned by customer @ 150 + 18% GST = 300 + 54 = 354
    console.log("9. Creating Credit Note (2 units returned)...");
    state = database.createCreditNote({
      originalInvoiceId: saleInvoice.id,
      originalInvoiceNo: saleInvoice.invoiceNo,
      party: customer.name,
      partyId: customer.id,
      items: [{
        item: item.name,
        itemId: item.id,
        qty: 2,
        price: 150,
        taxRate: 18,
      }],
    });
    const cn = state.creditNotes[0];
    assert.ok(cn, "Credit note created");
    assert.strictEqual(cn.total, 354);

    // Stock should increase by 2: 40 + 2 = 42
    const itemAfterCN = database.getState().items.find((i) => i.id === item.id);
    assert.strictEqual(itemAfterCN.currentStock, 42, "Stock after sales return must be 42");

    // Parent transaction check for Credit Note
    const cnTx = state.transactions.find((t) => t.id === cn.id);
    assert.ok(cnTx, "Credit Note must have parent transaction");
    assert.strictEqual(cnTx.type, "credit_note");

    // 10. Create Debit Note: 5 units returned to supplier @ 100 + 18% GST = 500 + 90 = 590
    console.log("10. Creating Debit Note (5 units returned)...");
    state = database.createDebitNote({
      originalPurchaseId: purchaseInvoice.id,
      originalPurchaseNo: purchaseInvoice.invoiceNo,
      party: supplier.name,
      partyId: supplier.id,
      items: [{
        item: item.name,
        itemId: item.id,
        qty: 5,
        price: 100,
        taxRate: 18,
      }],
    });
    const dn = state.debitNotes[0];
    assert.ok(dn, "Debit note created");
    assert.strictEqual(dn.total, 590);

    // Stock should decrease by 5: 42 - 5 = 37
    const itemAfterDN = database.getState().items.find((i) => i.id === item.id);
    assert.strictEqual(itemAfterDN.currentStock, 37, "Stock after purchase return must be 37");

    // Parent transaction check for Debit Note
    const dnTx = state.transactions.find((t) => t.id === dn.id);
    assert.ok(dnTx, "Debit Note must have parent transaction");
    assert.strictEqual(dnTx.type, "debit_note");

    // 11. Create GST Expense: "Office Electricity" ₹2,360 with 18% GST (Taxable: 2000, GST: 360)
    console.log("11. Creating GST Expense (₹2,360 with 18% GST)...");
    state = database.createTransaction({
      type: "expense",
      item: "Office Electricity",
      amount: 2360,
      taxRate: 18,
      party: "Power Corporation",
      notes: "August electricity bill",
    });
    const expenseTax = database.getTaxEntries({ sourceType: "expense" });
    assert.ok(expenseTax.length >= 1, "Expense must produce tax_entries");
    assert.strictEqual(expenseTax[0].taxRate, 18);
    assert.strictEqual(expenseTax[0].taxableValue, 2000);
    assert.strictEqual(expenseTax[0].cgst + expenseTax[0].sgst + expenseTax[0].igst, 360);

    // 12. Make Supplier Payment (Payment-Out): ₹2,500 to supplier
    console.log("12. Making Payment-Out to supplier (₹2,500)...");
    state = database.recordPaymentOut({
      partyId: supplier.id,
      partyName: supplier.name,
      amount: 2500,
      invoiceId: purchaseInvoice.id,
      method: "Bank Transfer",
      notes: "Partial payment for purchase bill",
    });
    const payOut = state.payments.find((p) => p.type === "payment_out" && p.partyId === supplier.id);
    assert.ok(payOut, "Payment-out must be recorded");
    assert.strictEqual(payOut.amount, 2500);

    // Supplier balance check:
    // Purchase bill = 5900.
    // Paid = 2500. Remaining bill = 3400.
    // Debit note = 590.
    // Net payable balance = 5900 - 2500 - 590 = 2810.
    const suppAfterPay = database.getState().parties.find((p) => p.id === supplier.id);
    assert.strictEqual(suppAfterPay.payable, 2810, "Supplier payable balance must be ₹2,810");

    // 13. Create & Cancel a test invoice
    console.log("13. Creating and cancelling a test invoice...");
    state = database.createTransaction({
      type: "sale",
      party: customer.name,
      partyId: customer.id,
      paymentType: "credit",
      items: [{
        item: item.name,
        itemId: item.id,
        qty: 3,
        unit: "Pcs",
        price: 150,
        taxRate: 18,
      }],
    });
    const cancelledInv = state.invoices.find((inv) => inv.type === "sale" && inv.id !== saleInvoice.id);
    assert.ok(cancelledInv, "Test invoice created");
    database.setInvoiceStatus({ invoiceId: cancelledInv.id, status: "cancelled" });
    const reloadedInv = database.getState().invoices.find((i) => i.id === cancelledInv.id);
    assert.strictEqual(reloadedInv.status, "cancelled", "Invoice must be cancelled");

    // Stock must be restored after cancellation: 37 units
    const itemAfterCancel = database.getState().items.find((i) => i.id === item.id);
    assert.strictEqual(itemAfterCancel.currentStock, 37, "Cancelled invoice must restore stock to 37");

    // 14. Report verifications
    console.log("14. Verifying reports...");
    const activeSalesTax = database.getTaxEntries({ sourceType: "sale", excludeCancelled: true });
    assert.strictEqual(activeSalesTax.length, 1, "Only 1 active sale tax entry (cancelled invoice excluded)");

    const creditTax = database.getTaxEntries({ sourceType: "credit_note" });
    assert.strictEqual(creditTax.length, 1, "1 Credit note tax entry");

    const debitTax = database.getTaxEntries({ sourceType: "debit_note" });
    assert.strictEqual(debitTax.length, 1, "1 Debit note tax entry");

    // 15. Restart application / re-initialize DB
    console.log("15. Simulating application restart (reloading SQLite database)...");
    await database.initDatabase(tempDir);
    assert.strictEqual(database.isForeignKeyEnforced(), true, "Foreign keys still enforced after restart");

    const reloadedState = database.getState();
    assert.strictEqual(reloadedState.companies.length >= 1, true, "Company preserved after restart");
    assert.strictEqual(reloadedState.parties.length >= 2, true, "Parties preserved after restart");
    assert.strictEqual(reloadedState.items.length >= 1, true, "Items preserved after restart");
    assert.strictEqual(reloadedState.invoices.length >= 3, true, "Invoices preserved after restart");
    assert.strictEqual(reloadedState.payments.length >= 3, true, "Payments preserved after restart");
    assert.strictEqual(reloadedState.creditNotes.length, 1, "Credit note preserved after restart");
    assert.strictEqual(reloadedState.debitNotes.length, 1, "Debit note preserved after restart");

    // 16. PRAGMA integrity_check and foreign_key_check
    console.log("16. Running PRAGMA integrity_check & foreign_key_check...");
    // Verify using database.validateDatabase()
    const dbValidation = database.validateDatabase();
    assert.strictEqual(dbValidation.integrity, "ok", "Database integrity_check must be 'ok'");
    assert.strictEqual(dbValidation.foreignKeys, "ok", "Database foreign_key_check must be 'ok'");

    // 17. Verify no orphan records
    console.log("17. Verifying zero orphan records across all tables...");
    const orphanLedgers = database.getState().ledgerEntries.filter((l) => {
      return !database.getState().transactions.some((t) => t.id === l.transactionId);
    });
    assert.strictEqual(orphanLedgers.length, 0, "No orphan ledger entries");

    const orphanPayments = database.getState().payments.filter((p) => {
      if (p.invoiceId && !database.getState().invoices.some((i) => i.id === p.invoiceId)) return true;
      if (p.partyId && !database.getState().parties.some((pt) => pt.id === p.partyId)) return true;
      return false;
    });
    assert.strictEqual(orphanPayments.length, 0, "No orphan payments");

    const orphanTaxEntries = database.getState().taxEntries.filter((te) => {
      if (te.sourceType === "sale" || te.sourceType === "purchase") {
        return !database.getState().invoices.some((i) => i.id === te.sourceId);
      }
      if (te.sourceType === "credit_note") {
        return !database.getState().creditNotes.some((cn) => cn.id === te.sourceId);
      }
      if (te.sourceType === "debit_note") {
        return !database.getState().debitNotes.some((dn) => dn.id === te.sourceId);
      }
      if (te.sourceType === "expense") {
        return !database.getState().transactions.some((tx) => tx.id === te.sourceId);
      }
      return false;
    });
    assert.strictEqual(orphanTaxEntries.length, 0, "No orphan tax entries");

    // 18. Double-entry journal balance check
    console.log("18. Verifying double-entry ledger balance...");
    const allLedgers = database.getState().ledgerEntries;
    const totalDebit = allLedgers.reduce((sum, row) => sum + Number(row.debit || 0), 0);
    const totalCredit = allLedgers.reduce((sum, row) => sum + Number(row.credit || 0), 0);
    console.log(`Total Debit: ₹${totalDebit.toFixed(2)}, Total Credit: ₹${totalCredit.toFixed(2)}`);
    assert.strictEqual(Math.round(totalDebit * 100), Math.round(totalCredit * 100), "Double-entry total debits must equal total credits");

    console.log("=== PHASE 1 RUNTIME INTEGRITY & LIFECYCLE AUDIT PASSED 100% ===");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

runRuntimeAudit().catch((err) => {
  console.error("Runtime Audit Failed:", err);
  process.exit(1);
});
