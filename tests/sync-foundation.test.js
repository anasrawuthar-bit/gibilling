const assert = require("assert");
const database = require("../database");
const { createFixture, inspectDatabase, reopen } = require("./database-fixtures");

async function run() {
  const fixture = await createFixture("gi-billing-sync-foundation-");
  try {
    let inspected = await inspectDatabase(fixture.databasePath);
    const device = inspected.query("SELECT id, installation_id AS installationId FROM sync_devices");
    assert.equal(device.length, 1, "fresh installation should have one local device identity");
    assert.ok(device[0].id && device[0].installationId);
    inspected.close();

    database.createUnit({ name: "Sync Unit" });
    database.createItemCategory({ name: "Sync Category" });
    inspected = await inspectDatabase(fixture.databasePath);
    let events = inspected.query("SELECT entity_type AS entityType, entity_id AS entityId, status, idempotency_key AS idempotencyKey FROM sync_outbox ORDER BY created_at");
    assert.equal(events.length, 2);
    assert.deepEqual(events.map((event) => event.entityType).sort(), ["item_category", "unit"]);
    assert.ok(events.every((event) => event.status === "pending" && event.entityId && event.idempotencyKey));
    assert.equal(new Set(events.map((event) => event.idempotencyKey)).size, events.length);

    const unit = inspected.query("SELECT id, sync_id AS syncId, sync_version AS syncVersion FROM units WHERE name = 'Sync Unit'")[0];
    assert.ok(unit.syncId);
    assert.equal(unit.syncVersion, 1);
    inspected.close();

    database.updateUnit({ id: unit.id, name: "Sync Unit Updated" });
    inspected = await inspectDatabase(fixture.databasePath);
    assert.equal(inspected.query("SELECT sync_version AS version FROM units WHERE id = ?", [unit.id])[0].version, 2);
    assert.equal(inspected.query("SELECT COUNT(*) AS count FROM sync_outbox")[0].count, 3);
    const beforeFailure = inspected.query("SELECT COUNT(*) AS count FROM sync_outbox")[0].count;
    const existingUnit = inspected.query("SELECT id FROM units WHERE name = 'Pcs'")[0];
    inspected.close();

    assert.throws(() => database.updateUnit({ id: unit.id, name: "Pcs" }), /already exists/i);
    inspected = await inspectDatabase(fixture.databasePath);
    assert.equal(inspected.query("SELECT COUNT(*) AS count FROM sync_outbox")[0].count, beforeFailure, "failed master mutation must not enqueue an event");
    assert.equal(inspected.query("SELECT name FROM units WHERE id = ?", [unit.id])[0].name, "Sync Unit Updated");
    assert.ok(existingUnit.id);
    inspected.close();

    await reopen(fixture.root);
    inspected = await inspectDatabase(fixture.databasePath);
    assert.equal(inspected.query("SELECT COUNT(*) AS count FROM sync_devices")[0].count, 1, "reopen should preserve device identity");
    assert.equal(inspected.query("SELECT COUNT(*) AS count FROM sync_outbox WHERE status = 'pending'")[0].count, 3, "reopen should preserve pending work");
    inspected.close();
    console.log("Local sync foundation tests passed.");
  } finally {
    fixture.cleanup();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
