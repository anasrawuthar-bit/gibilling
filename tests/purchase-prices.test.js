const assert = require('assert');
const database = require('../database');
const { createFixture, seedMasters, sampleInvoice, reopen } = require('./database-fixtures');

(async () => {
  const fixture = await createFixture('gi-purchase-prices-');
  try {
    const { supplier, item } = seedMasters();
    const bill = (id, price, updatePurchaseDefaults = false) => {
      const entry = sampleInvoice({ type: 'purchase', party: supplier, item, id, qty: 10 });
      entry.items[0].price = price;
      entry.updatePurchaseDefaults = updatePurchaseDefaults;
      return entry;
    };
    database.createTransaction(bill('first', 500));
    database.createTransaction(bill('second', 550));
    let state = database.getState();
    assert.equal(state.items.find(x => x.id === item.id).purchasePrice, 70);
    assert.equal(state.invoiceItems.find(x => x.invoiceId === 'inv-first').price, 500);
    assert.equal(state.invoiceItems.find(x => x.invoiceId === 'inv-second').price, 550);
    database.createTransaction(bill('third', 600, true));
    state = database.getState();
    assert.equal(state.items.find(x => x.id === item.id).purchasePrice, 600);
    assert.equal(state.items.find(x => x.id === item.id).salePrice, 100);
    assert.equal(state.items.find(x => x.id === item.id).openingStockValue, 1400);
    assert.equal(state.invoiceItems.find(x => x.invoiceId === 'inv-first').price, 500);
    const conflict = bill('conflict', 650, true);
    conflict.items.push({ ...conflict.items[0], price: 700 });
    assert.throws(() => database.createTransaction(conflict), /different rates/);
    assert.ok(!database.getState().invoices.some(x => x.id === 'inv-conflict'));
    const edited = bill('second', 575);
    database.updateInvoice(edited);
    await reopen(fixture.root);
    state = database.getState();
    assert.equal(state.invoiceItems.find(x => x.invoiceId === 'inv-first').price, 500);
    assert.equal(state.invoiceItems.find(x => x.invoiceId === 'inv-second').price, 575);
    assert.equal(state.items.find(x => x.id === item.id).purchasePrice, 600);
    database.validateDatabase();
    console.log('Purchase price independence, default update, rollback and restart tests passed.');
  } finally { fixture.cleanup(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
