const assert = require('assert');
const db = require('../database');
const { createFixture, reopen } = require('./database-fixtures');

(async () => {
  const fixture = await createFixture('gi-masters-crud-');
  try {
    let state = db.createUnit({ name: 'Test Unit', code: 'TU', allows_decimal_quantity: true });
    const unit = state.units.find(x => x.name === 'Test Unit');
    assert.equal(unit.code, 'TU');
    assert.equal(unit.allows_decimal_quantity, true);
    db.updateUnit({ ...unit, name: 'Updated Unit' });
    db.toggleUnitActive({ id: unit.id, is_active: false });
    assert.equal(db.getState().units.find(x => x.id === unit.id).is_active, false);
    db.deleteUnit({ id: unit.id });
    const defaultUnit = db.getState().units.find(x => x.name === 'Box');
    db.deleteUnit({ id: defaultUnit.id });
    state = db.createItemCategory({ name: 'Parent Test', code: 'PT' });
    const parent = state.itemCategories.find(x => x.name === 'Parent Test');
    state = db.createItemCategory({ name: 'Child Test', parent_category_id: parent.id });
    const child = state.itemCategories.find(x => x.name === 'Child Test');
    assert.equal(child.parent_category_id, parent.id);
    assert.throws(() => db.updateItemCategory({ ...parent, parent_category_id: child.id }), /cycle/);
    assert.throws(() => db.deleteItemCategory({ id: parent.id }), /subcategories/);
    db.updateItemCategory({ ...child, name: 'Updated Child' });
    db.toggleItemCategoryActive({ id: child.id, is_active: false });
    assert.equal(db.getState().itemCategories.find(x => x.id === child.id).is_active, false);
    db.deleteItemCategory({ id: child.id });
    db.deleteItemCategory({ id: parent.id });
    db.createItem({ name: 'Used Item', unit: 'Pcs', category: 'Electronics' });
    assert.throws(() => db.deleteUnit({ id: db.getState().units.find(x => x.name === 'Pcs').id }), /used/);
    await reopen(fixture.root);
    assert.ok(!db.getState().units.some(x => x.name === 'Box' || x.id === unit.id));
    assert.ok(!db.getState().itemCategories.some(x => x.id === child.id));
    db.validateDatabase();
    console.log('Units and Categories CRUD tests passed.');
  } finally { fixture.cleanup(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
