const assert = require('assert');
const fs = require('fs');
const path = require('path');
const database = require('../database');
const { createFixture, seedMasters, sampleInvoice, reopen } = require('./database-fixtures');

async function run() {
  const fixture = await createFixture('gi-invoice-readiness-');
  try {
    const { customer, supplier, item } = seedMasters({});
    const walkIn = sampleInvoice({ type: 'sale', party: customer, item, id: 'walk-in', qty: 1 });
    Object.assign(walkIn, { party: '', partyId: '', paymentType: 'cash', received: 118 });
    let cashState = database.createTransaction(walkIn);
    assert.equal(cashState.invoices.find((row) => row.id === walkIn.invoiceId).balance, 0);
    assert.throws(() => database.deleteInvoice({ invoiceId: walkIn.invoiceId }), /recorded payments/);
    assert.throws(() => database.setInvoiceStatus({ invoiceId: walkIn.invoiceId, status: 'unpaid' }), /calculated/);
    assert.throws(() => database.createTransaction({ ...walkIn, id: 'unpaid-walk', invoiceId: 'unpaid-walk', received: 1 }), /outstanding/);
    const rounded = sampleInvoice({ type: 'purchase', party: supplier, item, id: 'rounded', qty: 1 });
    rounded.items[0].price = 10.25;
    rounded.meta = { roundOff: true };
    cashState = database.createTransaction(rounded);
    assert.equal(cashState.invoices.find((row) => row.id === rounded.invoiceId).total, 12);
    const low = database.createItem({ name: 'Purchase-dependent stock', openingStock: 0, salePrice: 10 });
    const dependent = low.items.find((row) => row.name === 'Purchase-dependent stock');
    const buy = sampleInvoice({ type: 'purchase', party: supplier, item: dependent, id: 'stock-buy', qty: 2 });
    database.createTransaction(buy);
    database.createTransaction(sampleInvoice({ type: 'sale', party: customer, item: dependent, id: 'stock-sell', qty: 2 }));
    assert.throws(() => database.deleteInvoice({ invoiceId: buy.invoiceId }), /already used/);
    assert.throws(() => database.setInvoiceStatus({ invoiceId: buy.invoiceId, status: 'cancelled' }), /already used/);
    assert.throws(() => database.updateInvoice({ ...buy, items: [{ ...buy.items[0], qty: 1 }] }), /already used/);
    for (const type of ['sale', 'purchase']) {
      const entry = sampleInvoice({ type, party: type === 'sale' ? customer : supplier, item, id: `audit-${type}` });
      entry.items[0].taxRate = 0;
      let state = database.createTransaction(entry);
      let invoice = state.invoices.find((row) => row.id === entry.invoiceId);
      assert.equal(invoice.taxTotal, 0, 'explicit zero tax must override catalog tax');
      state = database.recordInvoicePayment({ invoiceId: entry.invoiceId, amount: 10, method: 'UPI', notes: 'Original receipt' });
      const payments = state.payments.filter((row) => row.invoiceId === entry.invoiceId);
      state = database.updateInvoice({ ...entry, received: 10, notes: 'Edited notes' });
      assert.deepEqual(state.payments.filter((row) => row.invoiceId === entry.invoiceId), payments, 'editing must preserve payment identities and details');
      assert.throws(() => database.updateInvoice({ ...entry, received: 0 }), /preserved/);
      assert.throws(() => database.recordInvoicePayment({ invoiceId: entry.invoiceId, amount: Infinity }), /finite/);
      for (const patch of [{ qty: -1 }, { qty: 0 }, { price: -1 }, { discount: 9999 }, { taxRate: -1 }]) {
        assert.throws(() => database.createTransaction({ ...entry, id: `bad-${type}`, invoiceId: `bad-${type}`, invoiceNo: `bad-${type}`, items: [{ ...entry.items[0], ...patch }] }));
      }
      await reopen(fixture.root);
      assert.deepEqual(database.getState().payments.filter((row) => row.invoiceId === entry.invoiceId), payments);
    }
    const snapshot = database.captureBusinessSnapshot();
    const savedPayments = database.getState().payments;
    const restoredRoot = path.join(fixture.root, 'restore-test');
    fs.mkdirSync(restoredRoot);
    database.backupTo(path.join(restoredRoot, 'gi-billing.sqlite'));
    await database.initDatabase(restoredRoot);
    assert.deepEqual(database.captureBusinessSnapshot(), snapshot, 'restored backup must preserve business totals and counts');
    assert.deepEqual(database.getState().payments, savedPayments, 'restored backup must preserve payment history');
    assert.equal(database.validateDatabase().integrity, 'ok');
    console.log('Sale and purchase readiness regression tests passed.');
  } finally { fixture.cleanup(); }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
