const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const database = require("../database");

async function run() {
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-billing-sale-test-"));

  try {
    await database.initDatabase(testRoot);
    let state = database.createParty({
      name: "Test Customer",
      type: "customer",
      phone: "9999999999",
      state: "Karnataka",
    });
    state = database.createParty({ name: "Supplier Only", type: "supplier", state: "Karnataka" });
    state = database.createItem({
      name: "Test Product",
      itemType: "product",
      unit: "Pcs",
      openingStock: 10,
      salePrice: 100,
      taxRate: 18,
      hsnSac: "1001",
    });

    const customer = state.parties.find((party) => party.name === "Test Customer");
    const supplier = state.parties.find((party) => party.name === "Supplier Only");
    const item = state.items.find((record) => record.name === "Test Product");
    const sale = {
      id: "txn-sale-1",
      invoiceId: "inv-sale-1",
      invoiceNo: "INV-TEST-1",
      type: "sale",
      party: customer.name,
      partyId: customer.id,
      paymentType: "credit",
      supplyType: "b2c",
      placeOfSupply: "Karnataka",
      received: 0,
      date: "2026-08-11T00:00:00.000Z",
      items: [{
        item: item.name,
        itemId: item.id,
        qty: 2,
        unit: "Pcs",
        price: 100,
        discount: 0,
        taxRate: 18,
      }],
    };

    state = database.createTransaction(sale);
    assert.equal(state.invoices.length, 1, "sale invoice should be created");
    assert.equal(state.invoiceItems.length, 1, "sale line should be created");
    assert.equal(state.stockMovements.length, 1, "sale stock movement should be created");
    assert.equal(currentStock(state, item.id), 8, "sale should reduce stock");

    const transactionCount = state.transactions.length;
    assert.throws(
      () => database.createTransaction({
        ...sale,
        id: "txn-unknown-party",
        invoiceId: "inv-unknown-party",
        invoiceNo: "INV-UNKNOWN-PARTY",
        party: "Unknown Customer",
        partyId: "",
      }),
      /existing customer/i,
    );
    assert.throws(
      () => database.createTransaction({
        ...sale,
        id: "txn-wrong-role",
        invoiceId: "inv-wrong-role",
        invoiceNo: "INV-WRONG-ROLE",
        party: supplier.name,
        partyId: supplier.id,
      }),
      /not configured as a customer/i,
    );
    assert.throws(
      () => database.createTransaction({
        ...sale,
        id: "txn-no-stock",
        invoiceId: "inv-no-stock",
        invoiceNo: "INV-NO-STOCK",
        items: [{ ...sale.items[0], qty: 99 }],
      }),
      /only 8 in stock/i,
    );
    assert.throws(
      () => database.createTransaction({ ...sale, invoiceNo: "INV-DUPLICATE-ID" }),
      /UNIQUE constraint failed/i,
    );

    state = database.getState();
    assert.equal(state.transactions.length, transactionCount, "failed saves should roll back");
    assert.equal(state.stockMovements.length, 1, "failed saves should not add stock movements");

    state = database.updateInvoice({ ...sale, items: [{ ...sale.items[0], qty: 9 }] });
    assert.equal(currentStock(state, item.id), 1, "edit should replace the original stock movement");
    assert.equal(invoiceLine(state, sale.invoiceId).qty, 9, "edit should replace the invoice line");
    assert.throws(
      () => database.updateInvoice({ ...sale, items: [{ ...sale.items[0], qty: 11 }] }),
      /only 10 in stock/i,
    );
    state = database.getState();
    assert.equal(currentStock(state, item.id), 1, "rejected edit should preserve stock");
    assert.equal(invoiceLine(state, sale.invoiceId).qty, 9, "rejected edit should preserve invoice lines");

    state = database.setInvoiceStatus({ invoiceId: sale.invoiceId, status: "cancelled", notes: "test" });
    assert.equal(state.invoices[0].status, "cancelled", "invoice should remain as a cancelled record");
    assert.equal(state.stockMovements.length, 0, "cancellation should reverse stock posting");
    assert.equal(state.ledgerEntries.length, 0, "cancellation should remove active ledger posting");
    assert.equal(currentStock(state, item.id), 10, "cancellation should restore stock");

    await database.initDatabase(testRoot);
    state = database.getState();
    assert.equal(state.invoices[0].status, "cancelled", "cancelled invoice should survive SQLite reopen");
    assert.equal(currentStock(state, item.id), 10, "restored stock should survive SQLite reopen");

    console.log("Sale foundation tests passed.");
  } finally {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
}

function currentStock(state, itemId) {
  return state.items.find((item) => Number(item.id) === Number(itemId)).currentStock;
}

function invoiceLine(state, invoiceId) {
  return state.invoiceItems.find((line) => line.invoiceId === invoiceId);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
