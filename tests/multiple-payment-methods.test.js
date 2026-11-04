/**
 * Test Suite: Multiple / Split Payment Methods
 * Verifies multi-payment receiving and making across all modules:
 * 1. Sale Invoice creation with split payment (Cash + UPI)
 * 2. Purchase Bill creation with split payment (Cash + Bank)
 * 3. Payment-In with split payment (Cash + UPI)
 * 4. Payment-Out with split payment (Cash + Cheque)
 * 5. recordInvoicePayment with split payment
 * 6. Full Double-Entry Trial Balance & Ledger Reconciliation
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

async function runTests() {
  console.log("=== STARTING MULTIPLE PAYMENT METHODS TEST SUITE ===");
  const fixture = await createFixture("gi-split-payments-").init();

  try {
    // 1. Setup Company
    console.log("▶ Step 1: Setting up company & master data...");
    await database.createCompany({
      businessName: "Galaxy Retailers Pvt Ltd",
      gstin: "32AAAAA0000A1Z5",
      pan: "AAAAA0000A",
      state: "Kerala",
      address: "MG Road, Kochi",
    });

    const partyCust = await database.createParty({
      name: "Anas Tech Solutions",
      type: "customer",
      phone: "9846000001",
      state: "Kerala",
    });

    const partySupp = await database.createParty({
      name: "National Hardware Mart",
      type: "supplier",
      phone: "9846000002",
      state: "Kerala",
    });

    const itemWidget = await database.createItem({
      name: "Wireless Mouse",
      salePrice: 1000,
      purchasePrice: 600,
      unit: "Pcs",
      taxRate: 0,
      openingStock: 100,
    });

    // 2. Test A: Sale Invoice with split payment (Cash ₹2,000 + UPI ₹3,000 for 5 units @ ₹1000 = ₹5,000)
    console.log("▶ Step 2: Testing Sale Invoice with split payment (Cash ₹2,000 + UPI ₹3,000)...");
    const saleResult = await database.createTransaction({
      type: "sale",
      party: "Anas Tech Solutions",
      partyId: partyCust.id || 1,
      items: [{ item: "Wireless Mouse", qty: 5, price: 1000, taxRate: 0, lineTotal: 5000 }],
      amount: 5000,
      received: 5000,
      splitPayments: [
        { method: "Cash", amount: 2000, notes: "Cash portion" },
        { method: "UPI", amount: 3000, notes: "GPay payment" },
      ],
    });

    const saleInv = saleResult.invoices.find((i) => i.party === "Anas Tech Solutions");
    assert(saleInv, "Sale invoice should exist");
    assert.strictEqual(Number(saleInv.total), 5000, "Invoice total should be 5000");
    assert.strictEqual(Number(saleInv.received), 5000, "Invoice received should be 5000");
    assert.strictEqual(Number(saleInv.balance), 0, "Invoice balance should be 0");
    assert.strictEqual(saleInv.status, "paid", "Invoice status should be paid");

    // Verify payments table has 2 rows for this invoice
    const salePayments = saleResult.payments.filter((p) => p.invoiceId === saleInv.id);
    assert.strictEqual(salePayments.length, 2, "Should have 2 payment rows in payments table");
    const cashPmt = salePayments.find((p) => p.method === "Cash");
    const upiPmt = salePayments.find((p) => p.method === "UPI");
    assert(cashPmt && Number(cashPmt.amount) === 2000, "Cash payment of ₹2,000 recorded");
    assert(upiPmt && Number(upiPmt.amount) === 3000, "UPI payment of ₹3,000 recorded");
    console.log("  ✓ Sale Invoice split payments verified: Cash ₹2,000 + UPI ₹3,000");

    // 3. Test B: Purchase Bill with split payment (Cash ₹2,400 + Bank ₹3,600 for 10 units @ ₹600 = ₹6,000)
    console.log("▶ Step 3: Testing Purchase Bill with split payment (Cash ₹2,400 + Bank ₹3,600)...");
    const purchResult = await database.createTransaction({
      type: "purchase",
      party: "National Hardware Mart",
      partyId: partySupp.id || 2,
      items: [{ item: "Wireless Mouse", qty: 10, price: 600, taxRate: 0, lineTotal: 6000 }],
      amount: 6000,
      received: 6000,
      splitPayments: [
        { method: "Cash", amount: 2400 },
        { method: "Bank", amount: 3600 },
      ],
    });

    const purchBill = purchResult.invoices.find((i) => i.type === "purchase" && i.party === "National Hardware Mart");
    assert(purchBill, "Purchase bill should exist");
    assert.strictEqual(Number(purchBill.total), 6000, "Purchase total should be 6000");
    assert.strictEqual(Number(purchBill.received), 6000, "Purchase received should be 6000");
    assert.strictEqual(Number(purchBill.balance), 0, "Purchase balance should be 0");

    const purchPayments = purchResult.payments.filter((p) => p.invoiceId === purchBill.id);
    assert.strictEqual(purchPayments.length, 2, "Should have 2 payment rows for purchase bill");
    const purchCash = purchPayments.find((p) => p.method === "Cash");
    const purchBank = purchPayments.find((p) => p.method === "Bank");
    assert(purchCash && Number(purchCash.amount) === 2400, "Cash paid ₹2,400");
    assert(purchBank && Number(purchBank.amount) === 3600, "Bank paid ₹3,600");
    console.log("  ✓ Purchase Bill split payments verified: Cash ₹2,400 + Bank ₹3,600");

    // 4. Test C: Create an unpaid Sale Invoice and record Payment-In with split payment
    console.log("▶ Step 4: Testing Payment-In with split payment against unpaid invoice...");
    const unpaidSaleResult = await database.createTransaction({
      type: "sale",
      party: "Anas Tech Solutions",
      partyId: partyCust.id || 1,
      items: [{ item: "Wireless Mouse", qty: 10, price: 1000, taxRate: 0, lineTotal: 10000 }],
      amount: 10000,
      received: 0,
      paymentType: "credit",
    });

    const unpaidInv = unpaidSaleResult.invoices.find((i) => Number(i.total) === 10000);
    assert(unpaidInv, "Unpaid invoice should exist");
    assert.strictEqual(Number(unpaidInv.balance), 10000, "Balance should be 10000");

    // Pay ₹7,000 using split payment: Cash ₹3,000 + UPI ₹4,000
    const payInResult = await database.recordPaymentIn({
      invoiceId: unpaidInv.id,
      party: "Anas Tech Solutions",
      payments: [
        { method: "Cash", amount: 3000, notes: "Counter cash" },
        { method: "UPI", amount: 4000, notes: "QR scan" },
      ],
    });

    const updatedInv = payInResult.invoices.find((i) => i.id === unpaidInv.id);
    assert.strictEqual(Number(updatedInv.received), 7000, "Received should now be 7000");
    assert.strictEqual(Number(updatedInv.balance), 3000, "Balance should now be 3000");
    assert.strictEqual(updatedInv.status, "partially_paid", "Status should be partially_paid");

    const newPayments = payInResult.payments.filter((p) => p.invoiceId === unpaidInv.id);
    assert.strictEqual(newPayments.length, 2, "Should have 2 payment rows for the Payment-In");
    console.log("  ✓ Payment-In split payment verified: Received ₹7,000 (Cash ₹3,000 + UPI ₹4,000), Balance ₹3,000");

    // 5. Test D: Create an unpaid Purchase Bill and record Payment-Out with split payment
    console.log("▶ Step 5: Testing Payment-Out with split payment against unpaid purchase bill...");
    const unpaidPurchResult = await database.createTransaction({
      type: "purchase",
      party: "National Hardware Mart",
      partyId: partySupp.id || 2,
      items: [{ item: "Wireless Mouse", qty: 20, price: 600, taxRate: 0, lineTotal: 12000 }],
      amount: 12000,
      received: 0,
      paymentType: "credit",
    });

    const unpaidBill = unpaidPurchResult.invoices.find((i) => i.type === "purchase" && Number(i.total) === 12000);
    assert(unpaidBill, "Unpaid bill should exist");

    // Pay ₹8,000 using split payment: Cash ₹3,000 + Cheque ₹5,000
    const payOutResult = await database.recordPaymentOut({
      invoiceId: unpaidBill.id,
      party: "National Hardware Mart",
      payments: [
        { method: "Cash", amount: 3000, notes: "Immediate cash" },
        { method: "Cheque", amount: 5000, notes: "Cheque #881920" },
      ],
    });

    const updatedBill = payOutResult.invoices.find((i) => i.id === unpaidBill.id);
    assert.strictEqual(Number(updatedBill.received), 8000, "Received should be 8000");
    assert.strictEqual(Number(updatedBill.balance), 4000, "Balance should be 4000");

    const billPmts = payOutResult.payments.filter((p) => p.invoiceId === unpaidBill.id);
    assert.strictEqual(billPmts.length, 2, "2 payment rows recorded for supplier");
    console.log("  ✓ Payment-Out split payment verified: Paid ₹8,000 (Cash ₹3,000 + Cheque ₹5,000), Balance ₹4,000");

    // 6. Test E: recordInvoicePayment with split payments (pay off remaining balance)
    console.log("▶ Step 6: Testing recordInvoicePayment with split payment for remaining balance...");
    const finalInvoicePayResult = await database.recordInvoicePayment({
      invoiceId: unpaidInv.id,
      payments: [
        { method: "Cash", amount: 1000 },
        { method: "UPI", amount: 2000 },
      ],
    });

    const fullyPaidInv = finalInvoicePayResult.invoices.find((i) => i.id === unpaidInv.id);
    assert.strictEqual(Number(fullyPaidInv.balance), 0, "Invoice should now be 0 balance");
    assert.strictEqual(fullyPaidInv.status, "paid", "Invoice should now be fully paid");
    console.log("  ✓ recordInvoicePayment split payment verified: Invoice fully settled");

    // 7. Test F: Trial Balance & Double Entry Integrity
    console.log("▶ Step 7: Verifying double-entry ledger trial balance...");
    const state = database.getState();
    const totalDebit = state.ledgerEntries.reduce((s, e) => s + Number(e.debit || 0), 0);
    const totalCredit = state.ledgerEntries.reduce((s, e) => s + Number(e.credit || 0), 0);
    console.log(`  Total Debits: ₹${totalDebit.toFixed(2)}, Total Credits: ₹${totalCredit.toFixed(2)}`);
    assert.strictEqual(
      Math.abs(totalDebit - totalCredit) < 0.001,
      true,
      "Double-entry trial balance must be perfectly balanced"
    );
    console.log("  ✓ Trial balance is perfectly balanced!");

    console.log("\n==========================================================");
    console.log("   ALL MULTIPLE PAYMENT METHOD TESTS PASSED 100%!         ");
    console.log("==========================================================\n");
  } finally {
    fixture.cleanup();
  }
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
