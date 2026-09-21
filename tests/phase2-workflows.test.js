const assert = require('assert');
const database = require('../database');
const { createFixture, seedMasters, sampleInvoice, inspectDatabase, reopen } = require('./database-fixtures');

async function run() {
  const fixture = await createFixture('gi-phase2-workflows-');
  try {
    const { customer, supplier, item } = seedMasters({});
    for (const type of ['sale', 'purchase']) {
      const party = type === 'sale' ? customer : supplier;
      const pay = type === 'sale' ? database.recordPaymentIn : database.recordPaymentOut;
      const invoice = sampleInvoice({ type, party, item, id: `allocation-${type}`, qty: 1 });
      database.createTransaction(invoice);
      const before = database.captureBusinessSnapshot();
      for (const amount of [-1, Infinity, NaN, 100000]) {
        assert.throws(() => pay({ partyId: party.id, amount: 100000, allocations: [{ invoiceId: invoice.invoiceId, amount }] }));
        assert.deepEqual(database.captureBusinessSnapshot(), before, 'bad allocations must roll back');
      }
      assert.throws(() => pay({ party: 'Unknown party', amount: 10 }));
      assert.throws(() => pay({ amount: 20, allocations: [{ invoiceId: invoice.invoiceId, amount: 10 }, { invoiceId: invoice.invoiceId, amount: 10 }] }), /Duplicate/);
      let state = pay({ amount: 30, allocations: [{ invoiceId: invoice.invoiceId, amount: 10 }] });
      const payments = state.payments.filter((payment) => payment.partyId === party.id);
      assert.equal(payments.reduce((sum, payment) => sum + payment.amount, 0), 30, 'allocation must preserve full cash amount including advance');
      assert.equal(state.invoices.find((row) => row.id === invoice.invoiceId).received, 10);
    }
    const other = database.createParty({ name: 'Other customer', type: 'customer' }).parties.find((party) => party.name === 'Other customer');
    const otherInvoice = sampleInvoice({ type: 'sale', party: other, item, id: 'other', qty: 1 });
    database.createTransaction(otherInvoice);
    assert.throws(() => database.recordPaymentIn({ amount: 2, allocations: [{ invoiceId: 'inv-allocation-sale', amount: 1 }, { invoiceId: otherInvoice.invoiceId, amount: 1 }] }), /same party/);

    const beforeStock = database.getState().items.find((row) => row.id === item.id).currentStock;
    for (const patch of [{ quantity: Infinity }, { quantity: -1 }, { direction: 'bogus' }, { unitPrice: -1 }, { quantity: beforeStock + 1 }]) {
      assert.throws(() => database.recordStockAdjustment({ itemId: item.id, quantity: 1, direction: 'reduce', reason: 'Stock take', ...patch }));
    }
    database.recordStockAdjustment({ itemId: item.id, quantity: 1, direction: 'reduce', reason: 'Damaged stock', unitPrice: 70 });
    assert.equal(database.getState().items.find((row) => row.id === item.id).currentStock, beforeStock - 1);

    for (const documentType of ['estimate', 'proforma', 'sale_order', 'delivery_challan', 'purchase_order']) {
      const purchase = documentType === 'purchase_order';
      const source = { ...sampleInvoice({ type: purchase ? 'purchase' : 'sale', party: purchase ? supplier : customer, item, id: documentType, qty: 1 }), estimateId: `doc-${documentType}`, documentType };
      const before = database.captureBusinessSnapshot();
      database.createEstimate(source);
      assert.deepEqual(database.captureBusinessSnapshot(), before, 'operational document must not post accounting or stock');
      const target = { ...source, id: `tx-convert-${documentType}`, invoiceId: `inv-convert-${documentType}`, invoiceNo: `CONVERT-${documentType}`, meta: { sourceEstimateId: source.estimateId } };
      database.createTransaction(target);
      const posted = database.captureBusinessSnapshot();
      assert.throws(() => database.createTransaction({ ...target, id: `${target.id}-again`, invoiceId: `${target.invoiceId}-again` }), /already converted/);
      assert.deepEqual(database.captureBusinessSnapshot(), posted);
    }
    await reopen(fixture.root);
    const inspected = await inspectDatabase(fixture.databasePath);
    assert.equal(inspected.query("SELECT COUNT(*) AS n FROM estimates WHERE status = 'converted'")[0].n, 5);
    const ledger = inspected.query('SELECT SUM(debit) AS debit, SUM(credit) AS credit FROM ledger_entries')[0];
    assert.ok(Math.abs(ledger.debit - ledger.credit) < 0.01);
    assert.equal(inspected.query('PRAGMA foreign_key_check').length, 0);
    inspected.close();
    console.log('Phase 2 workflow regression tests passed.');
  } finally { fixture.cleanup(); }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
