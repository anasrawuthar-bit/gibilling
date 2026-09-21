const assert = require("assert");
const fs = require("fs");
const path = require("path");
const database = require("../database");
const { createFixture, seedMasters, sampleInvoice, reopen } = require("./database-fixtures");

async function run() {
  await testValidBackupAndRestore();
  await testCorruptBackupRejection();
  await testSafetyBackupPreservedOnRestore();
  console.log("Database recovery and restore tests passed.");
}

async function testValidBackupAndRestore() {
  const fixture = await createFixture("gi-restore-valid-");
  try {
    const { customer, item } = seedMasters();
    const sale = sampleInvoice({ type: "sale", party: customer, item, id: "restore-test-1", qty: 3 });
    database.createTransaction(sale);

    const backupPath = path.join(fixture.root, "valid-backup.sqlite");
    database.backupTo(backupPath);
    assert.ok(fs.existsSync(backupPath), "Backup file should exist");

    // Add another transaction that should be wiped out on restore
    const sale2 = sampleInvoice({ type: "sale", party: customer, item, id: "restore-test-2", qty: 5 });
    let state = database.createTransaction(sale2);
    assert.equal(state.invoices.length, 2, "Should have 2 invoices prior to restore");

    // Restore from backup
    const result = await database.restoreBackup(backupPath, { userDataPath: fixture.root });
    assert.equal(result.success, true, "Restore should report success");
    assert.ok(result.safetyBackupPath, "Safety backup path should be provided");
    assert.ok(fs.existsSync(result.safetyBackupPath), "Pre-restore safety backup file must exist");

    // Check restored state
    const restoredState = database.getState();
    assert.equal(restoredState.invoices.length, 1, "Restored database should only have the original 1 invoice");
    assert.equal(restoredState.invoices[0].id, sale.invoiceId, "Restored invoice must match original");
  } finally {
    fixture.cleanup();
  }
}

async function testCorruptBackupRejection() {
  const fixture = await createFixture("gi-restore-corrupt-");
  try {
    const { customer, item } = seedMasters();
    const sale = sampleInvoice({ type: "sale", party: customer, item, id: "restore-corrupt-test", qty: 2 });
    database.createTransaction(sale);
    const originalBytes = fs.readFileSync(fixture.databasePath);

    const corruptPath = path.join(fixture.root, "corrupted.sqlite");
    fs.writeFileSync(corruptPath, "INVALID_SQLITE_HEADER_CONTENT_DATA_CORRUPT");

    let threw = false;
    try {
      await database.restoreBackup(corruptPath, { userDataPath: fixture.root });
    } catch (err) {
      threw = true;
      assert.match(err.message, /SQLite database header/i, "Should reject file with bad header");
    }
    assert.ok(threw, "Corrupted backup restore must throw");

    // Active database must remain identical and operational
    const currentBytes = fs.readFileSync(fixture.databasePath);
    assert.deepEqual(currentBytes, originalBytes, "Corrupted restore must not modify active database file");
    assert.equal(database.getState().invoices.length, 1, "Active database must remain operational");
  } finally {
    fixture.cleanup();
  }
}

async function testSafetyBackupPreservedOnRestore() {
  const fixture = await createFixture("gi-restore-safety-");
  try {
    const { customer, item } = seedMasters();
    database.createTransaction(sampleInvoice({ type: "sale", party: customer, item, id: "safety-1", qty: 1 }));

    const backupPath = path.join(fixture.root, "safety-test-backup.sqlite");
    database.backupTo(backupPath);

    // Make changes
    database.createTransaction(sampleInvoice({ type: "sale", party: customer, item, id: "safety-2", qty: 2 }));

    const restoreResult = await database.restoreBackup(backupPath, { userDataPath: fixture.root });
    assert.ok(fs.existsSync(restoreResult.safetyBackupPath), "Pre-restore safety backup file must exist");

    // Verify safety backup actually contains the 2nd transaction
    await reopen(fixture.root);
    assert.equal(database.getState().invoices.length, 1);
  } finally {
    fixture.cleanup();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
