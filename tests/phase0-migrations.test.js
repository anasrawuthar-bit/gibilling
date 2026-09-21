const assert = require("assert");
const fs = require("fs");
const path = require("path");
const database = require("../database");
const { MigrationError } = require("../database-migrations");
const {
  assertSnapshotsEqual,
  convertToLegacyDatabase,
  createBackup,
  createFixture,
  inspectDatabase,
  reopen,
  sampleInvoice,
  seedMasters,
  snapshot,
} = require("./database-fixtures");

async function run() {
  await testFreshDatabaseAndCurrentBehavior();
  await testCompanyIsolation();
  await testLegacyMigrationAndRepeatRun();
  await testFailedMigrationRollback();
  await testVersionSixMissingDocumentType();
  console.log("Phase 0 migration and characterization tests passed.");
}

async function testFreshDatabaseAndCurrentBehavior() {
  const fixture = await createFixture("gi-billing-fresh-");
  try {
    const { customer, supplier, item } = seedMasters();
    const openingStock = currentStock(database.getState(), item.id);

    const sale = sampleInvoice({ type: "sale", party: customer, item, id: "sale-credit", qty: 2 });
    let state = database.createTransaction(sale);
    const saleInvoice = state.invoices.find((invoice) => invoice.id === sale.invoiceId);
    const saleLines = state.invoiceItems.filter((line) => line.invoiceId === sale.invoiceId);
    assert.equal(saleInvoice.total, 236, "sale total should preserve current GST calculation");
    assert.equal(saleInvoice.balance, 236, "credit sale should initially remain outstanding");
    assert.equal(saleLines.length, 1, "sale should persist its invoice line");
    assert.equal(currentStock(state, item.id), openingStock - 2, "sale should reduce stock");
    assert.equal(state.stockMovements.filter((row) => row.invoiceId === sale.invoiceId).length, 1, "sale should create a stock movement");

    state = database.recordInvoicePayment({ invoiceId: sale.invoiceId, amount: 100, method: "Cash", paymentDate: "2026-08-13" });
    assert.equal(invoiceById(state, sale.invoiceId).received, 100, "partial payment should update received amount");
    assert.equal(invoiceById(state, sale.invoiceId).balance, 136, "partial payment should preserve outstanding balance");

    state = database.recordInvoicePayment({ invoiceId: sale.invoiceId, amount: 136, method: "Bank", paymentDate: "2026-08-14" });
    assert.equal(invoiceById(state, sale.invoiceId).balance, 0, "full payment should clear the balance");
    assert.equal(invoiceById(state, sale.invoiceId).status, "paid", "full payment should mark invoice paid");

    const editableSale = sampleInvoice({ type: "sale", party: customer, item, id: "sale-edit", qty: 1 });
    state = database.createTransaction(editableSale);
    state = database.updateInvoice({ ...editableSale, items: [{ ...editableSale.items[0], qty: 3 }] });
    assert.equal(state.invoiceItems.find((line) => line.invoiceId === editableSale.invoiceId).qty, 3, "editing should replace quantity");
    state = database.setInvoiceStatus({ invoiceId: editableSale.invoiceId, status: "cancelled", notes: "fixture cancellation" });
    assert.equal(invoiceById(state, editableSale.invoiceId).status, "cancelled", "cancellation should retain invoice history");
    assert.equal(state.stockMovements.filter((row) => row.invoiceId === editableSale.invoiceId).length, 0, "cancellation should remove active stock movement");

    const beforePurchase = currentStock(state, item.id);
    const purchase = sampleInvoice({ type: "purchase", party: supplier, item, id: "purchase", qty: 4 });
    state = database.createTransaction(purchase);
    assert.equal(invoiceById(state, purchase.invoiceId).total, 330.4, "purchase total should preserve current GST calculation");
    assert.equal(currentStock(state, item.id), beforePurchase + 4, "purchase should increase stock");

    const beforeReopen = snapshot();
    await reopen(fixture.root);
    assertSnapshotsEqual(snapshot(), beforeReopen, "reopening should preserve representative business totals");
    assert.ok(database.getState().invoices.some((invoice) => invoice.id === purchase.invoiceId), "reopened database should expose invoices");

    const backupPath = path.join(fixture.root, "manual-test-backup.sqlite");
    const backup = createBackup(backupPath);
    assert.equal(backup.path, backupPath);
    const inspected = await inspectDatabase(backupPath);
    assert.equal(String(inspected.query("PRAGMA integrity_check")[0].integrity_check).toLowerCase(), "ok");
    inspected.close();
  } finally {
    fixture.cleanup();
  }
}

async function testVersionSixMissingDocumentType() {
  const fixture = await createFixture("gi-billing-v6-document-type-");
  try {
    seedMasters();
    const expected = snapshot();
    const SQL = await require("sql.js")();
    const legacy = new SQL.Database(fs.readFileSync(fixture.databasePath));
    legacy.run("DELETE FROM schema_migrations WHERE version >= 7");
    legacy.run("ALTER TABLE estimates DROP COLUMN document_type");
    const original = Buffer.from(legacy.export());
    legacy.close();
    fs.writeFileSync(fixture.databasePath, original);

    await reopen(fixture.root);
    const info = database.getMigrationInfo();
    assert.deepEqual(info.lastResult.applied, [7, 8]);
    assert.deepEqual(fs.readFileSync(info.lastResult.backup.path), original);
    assertSnapshotsEqual(snapshot(), expected, "version 7 must preserve business records");
    assert.ok(Array.isArray(database.getState().estimates));
    await reopen(fixture.root);
    assert.deepEqual(database.getMigrationInfo().lastResult.applied, []);
  } finally {
    fixture.cleanup();
  }
}

async function testCompanyIsolation() {
  const fixture = await createFixture("gi-billing-company-");
  try {
    database.createParty({ name: "Company One Customer", type: "customer" });
    database.setCurrentCompany("Second Company");
    let state = database.getState();
    assert.equal(state.parties.some((party) => party.name === "Company One Customer"), false, "party should not leak into another company");
    database.createParty({ name: "Company Two Customer", type: "customer" });
    database.setCurrentCompany("testt");
    state = database.getState();
    assert.equal(state.parties.some((party) => party.name === "Company One Customer"), true);
    assert.equal(state.parties.some((party) => party.name === "Company Two Customer"), false);
  } finally {
    fixture.cleanup();
  }
}

async function testLegacyMigrationAndRepeatRun() {
  const fixture = await createFixture("gi-billing-legacy-");
  try {
    const { customer, item } = seedMasters({ customerName: "Legacy Customer", itemName: "Legacy Item" });
    database.createTransaction(sampleInvoice({ type: "sale", party: customer, item, id: "legacy-sale", qty: 2 }));
    const expected = snapshot();
    await convertToLegacyDatabase(fixture.databasePath);

    await reopen(fixture.root);
    assertSnapshotsEqual(snapshot(), expected, "legacy migration must preserve business data");
    const firstInfo = database.getMigrationInfo();
    assert.deepEqual(firstInfo.lastResult.applied, [1, 2, 3, 4, 5, 6, 7, 8], "legacy database should receive all required migrations");
    assert.ok(firstInfo.lastResult.backup?.validated, "legacy migration should create a validated backup");
    assert.ok(fs.existsSync(firstInfo.lastResult.backup.path), "pre-migration backup should remain available");

    await reopen(fixture.root);
    assertSnapshotsEqual(snapshot(), expected, "repeated migration run must preserve data");
    const secondInfo = database.getMigrationInfo();
    assert.deepEqual(secondInfo.lastResult.applied, [], "already applied migration should not run again");
    assert.equal(secondInfo.currentVersion, 8);
  } finally {
    fixture.cleanup();
  }
}

async function testFailedMigrationRollback() {
  const fixture = await createFixture("gi-billing-failure-");
  try {
    const { customer, item } = seedMasters({ customerName: "Rollback Customer", itemName: "Rollback Item" });
    database.createTransaction(sampleInvoice({ type: "sale", party: customer, item, id: "rollback-sale", qty: 1 }));
    const originalBytes = fs.readFileSync(fixture.databasePath);
    const expected = snapshot();
    let failure = null;

    try {
      await reopen(fixture.root, {
        additionalMigrations: [{
          version: 9,
          name: "deliberate_test_failure",
          up(migrationDb) {
            migrationDb.run("CREATE TABLE should_be_rolled_back (id INTEGER PRIMARY KEY)");
            throw new Error("deliberate migration failure");
          },
        }],
        migrationLogger() {},
      });
    } catch (error) {
      failure = error;
    }

    assert.ok(failure instanceof MigrationError, "failed migration should return a migration-specific error");
    assert.equal(failure.code, "MIGRATION_FAILED");
    assert.match(failure.userMessage, /original database/i);
    assert.deepEqual(fs.readFileSync(fixture.databasePath), originalBytes, "failed migration must not overwrite the original database file");

    const backups = fs.readdirSync(path.join(fixture.root, "migration-backups")).filter((name) => name.endsWith(".sqlite"));
    assert.ok(backups.length >= 1, "failed migration should preserve a pre-migration backup");
    const inspected = await inspectDatabase(fixture.databasePath);
    assert.equal(inspected.query("SELECT name FROM sqlite_master WHERE type='table' AND name='should_be_rolled_back'").length, 0);
    assert.equal(inspected.query("SELECT version FROM schema_migrations WHERE version=9").length, 0);
    inspected.close();

    await reopen(fixture.root);
    assertSnapshotsEqual(snapshot(), expected, "database should reopen unchanged after failed migration");
  } finally {
    fixture.cleanup();
  }
}

function currentStock(state, itemId) {
  return state.items.find((item) => Number(item.id) === Number(itemId)).currentStock;
}

function invoiceById(state, invoiceId) {
  return state.invoices.find((invoice) => invoice.id === invoiceId);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
