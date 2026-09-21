const assert = require("assert");
const database = require("../database");
const { createFixture, seedMasters, sampleInvoice } = require("./database-fixtures");

async function run() {
  await testPartyOpeningBalanceReceivableAndPayable();
  await testServiceItemDoesNotLeakStock();
  await testCreditNoteLedgerAndTaxEntries();
  console.log("Accounting and party integrity tests passed.");
}

async function testPartyOpeningBalanceReceivableAndPayable() {
  const fixture = await createFixture("gi-accounting-party-");
  try {
    // 1. Party with receivable opening balance
    database.createParty({
      name: "Receivable Client",
      type: "customer",
      openingBalance: 1500,
      openingBalanceType: "receivable",
    });

    // 2. Party with payable opening balance
    database.createParty({
      name: "Payable Vendor",
      type: "supplier",
      openingBalance: 800,
      openingBalanceType: "payable",
    });

    let state = database.getState();
    const recvParty = state.parties.find((p) => p.name === "Receivable Client");
    const payParty = state.parties.find((p) => p.name === "Payable Vendor");

    assert.equal(recvParty.openingBalance, 1500);
    assert.equal(recvParty.openingBalanceType, "receivable");
    assert.equal(recvParty.receivable, 1500);
    assert.equal(recvParty.balance, 1500, "Receivable opening balance must be positive balance");

    assert.equal(payParty.openingBalance, 800);
    assert.equal(payParty.openingBalanceType, "payable");
    assert.equal(payParty.payable, 800);
    assert.equal(payParty.balance, -800, "Payable opening balance must be negative balance");

    // Add an invoice to Receivable Client
    const { item } = seedMasters();
    const sale = sampleInvoice({
      type: "sale",
      party: recvParty,
      item,
      id: "recv-sale",
      qty: 1,
      received: 0,
    });
    state = database.createTransaction(sale);
    const updatedRecv = state.parties.find((p) => p.name === "Receivable Client");
    // total was 118, opening balance 1500 -> balance 1618
    assert.equal(updatedRecv.receivable, 1618);
    assert.equal(updatedRecv.balance, 1618, "Balance must correctly accumulate with receivable opening balance");
  } finally {
    fixture.cleanup();
  }
}

async function testServiceItemDoesNotLeakStock() {
  const fixture = await createFixture("gi-service-stock-");
  try {
    const { customer } = seedMasters();
    let state = database.createItem({
      name: "Consulting Service",
      itemType: "service",
      sku: "SRV-01",
      unit: "Hr",
      salePrice: 500,
      taxRate: 18,
      hsnSac: "998311",
    });

    const serviceItem = state.items.find((i) => i.name === "Consulting Service");
    assert.equal(serviceItem.itemType, "service");
    assert.equal(serviceItem.currentStock, 0, "Service item must have 0 currentStock");

    // Sell service item
    const sale = {
      id: "txn-srv-sale",
      invoiceId: "inv-srv-sale",
      invoiceNo: "INV-SRV-01",
      type: "sale",
      party: customer.name,
      partyId: customer.id,
      paymentType: "cash",
      received: 590,
      supplyType: "b2c",
      placeOfSupply: "Karnataka",
      firmState: "Karnataka",
      date: "2026-09-01T00:00:00.000Z",
      items: [{
        item: serviceItem.name,
        itemId: serviceItem.id,
        qty: 5,
        unit: "Hr",
        price: 500,
        discount: 0,
        taxRate: 18,
        hsnSac: "998311",
      }],
    };

    state = database.createTransaction(sale);

    // Assert that NO stock movements were posted for the service sale
    const srvMovements = state.stockMovements.filter((m) => m.itemId === serviceItem.id);
    assert.equal(srvMovements.length, 0, "Service items must NEVER create stock movements on sales");

    // Issue a credit note on the service sale
    state = database.createCreditNote({
      creditNo: "CN-SRV-01",
      creditDate: "2026-09-02",
      invoiceNo: "INV-SRV-01",
      party: customer.name,
      partyId: customer.id,
      partyTaxType: "Consumer",
      placeOfSupply: "Karnataka",
      supplyType: "b2c",
      reason: "Billing Error",
      items: [{
        itemId: serviceItem.id,
        name: serviceItem.name,
        quantity: 1,
        unit: "Hr",
        price: 500,
        discount: 0,
        taxRate: 18,
        hsnSac: "998311",
      }],
    });

    const srvMovementsAfterCN = database.getState().stockMovements.filter((m) => m.itemId === serviceItem.id);
    assert.equal(srvMovementsAfterCN.length, 0, "Service items must NEVER create stock movements on credit notes");
  } finally {
    fixture.cleanup();
  }
}

async function testCreditNoteLedgerAndTaxEntries() {
  const fixture = await createFixture("gi-credit-accounting-");
  try {
    const { customer, item } = seedMasters();
    const sale = sampleInvoice({ type: "sale", party: customer, item, id: "cn-test-sale", qty: 2 });
    let state = database.createTransaction(sale);

    // Create credit note
    state = database.createCreditNote({
      creditNo: "CN-ACC-01",
      creditDate: "2026-09-05",
      invoiceNo: sale.invoiceNo,
      party: customer.name,
      partyId: customer.id,
      partyTaxType: "Consumer",
      placeOfSupply: "Karnataka",
      supplyType: "b2c",
      reason: "Sales Return",
      items: [{
        itemId: item.id,
        name: item.name,
        quantity: 1,
        unit: "Pcs",
        price: 100,
        discount: 0,
        taxRate: 18,
        hsnSac: "1001",
      }],
    });

    const creditNotes = state.creditNotes || [];
    const cn = creditNotes.find((c) => c.creditNo === "CN-ACC-01");
    assert.ok(cn, "Credit note must be created");

    // Tax entries should include the credit note
    const taxEntries = database.getTaxEntries({ sourceType: "credit_note" });
    assert.ok(taxEntries.length >= 1, "Credit note must post to tax_entries");
    const entry = taxEntries.find((e) => e.documentNo === "CN-ACC-01");
    assert.ok(entry, "Tax entry matching credit note number must exist");
    assert.equal(entry.taxableValue, 100);
    assert.equal(entry.isCancelled, 0);

    // Cancel credit note
    state = database.setCreditNoteStatus({ creditNoteId: cn.id, status: "cancelled" });
    const cancelledTaxEntries = database.getTaxEntries({ sourceType: "credit_note" });
    const cancelledEntry = cancelledTaxEntries.find((e) => e.documentNo === "CN-ACC-01");
    assert.equal(cancelledEntry.isCancelled, 1, "Cancelling credit note must mark tax entries as cancelled");
  } finally {
    fixture.cleanup();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
