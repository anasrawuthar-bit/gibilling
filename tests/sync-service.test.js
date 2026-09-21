const assert = require("assert");
const { randomUUID } = require("crypto");
const database = require("../database");
const { SyncService } = require("../sync-service");
const { createFixture, inspectDatabase } = require("./database-fixtures");

class FakeSyncAdapter {
  constructor() {
    this.applied = new Set();
    this.changes = [];
    this.failPush = false;
  }

  async registerDevice({ device }) {
    return { deviceId: device.id };
  }

  async push({ events }) {
    if (this.failPush) throw Object.assign(new Error("offline"), { code: "OFFLINE" });
    return {
      results: events.map((event) => {
        const duplicate = this.applied.has(event.idempotencyKey);
        this.applied.add(event.idempotencyKey);
        return { id: event.id, status: duplicate ? "already_applied" : "accepted" };
      }),
    };
  }

  async pull({ cursor }) {
    const offset = Number(cursor || 0);
    return { changes: this.changes.slice(offset), cursor: String(this.changes.length) };
  }
}

async function run() {
  const fixture = await createFixture("gi-billing-sync-service-");
  try {
    const adapter = new FakeSyncAdapter();
    const service = new SyncService({ database, adapter, enabled: true, logger: { warn() {} } });

    database.createUnit({ name: "Cloud Box" });
    let status = await service.syncNow();
    assert.equal(status.queue.acknowledged, 1, "accepted events should be acknowledged");
    assert.equal(adapter.applied.size, 1, "an idempotency key should be applied only once");

    const remoteId = randomUUID();
    adapter.changes.push({
      eventId: randomUUID(),
      entityType: "item_category",
      entityId: remoteId,
      operation: "upsert",
      serverVersion: 1,
      payload: { name: "Remote Category" },
    });
    await service.syncNow();
    await service.syncNow();

    let inspected = await inspectDatabase(fixture.databasePath);
    assert.equal(inspected.query("SELECT COUNT(*) AS count FROM item_categories WHERE sync_id = ?", [remoteId])[0].count, 1, "repeated pulls must not duplicate data");
    assert.equal(inspected.query("SELECT COUNT(*) AS count FROM sync_inbox")[0].count, 1, "remote event should be recorded once");
    assert.equal(inspected.query("SELECT pull_cursor AS cursor FROM sync_cursors")[0].cursor, "1");
    inspected.close();

    database.createItemCategory({ name: "Retry Category" });
    adapter.failPush = true;
    await assert.rejects(service.syncNow(), /offline/);
    inspected = await inspectDatabase(fixture.databasePath);
    assert.equal(inspected.query("SELECT COUNT(*) AS count FROM sync_outbox WHERE status = 'retry'")[0].count, 1, "network failure must preserve retryable work");
    inspected.close();

    status = database.getSyncStatus();
    assert.ok(status.device.lastSyncAt, "successful cycles should update the device timestamp");
    const companyId = status.companyId;
    const change = { eventId: randomUUID(), entityType: 'unit', entityId: randomUUID(), operation: 'upsert', serverVersion: 1, payload: { name: 'Atomic remote' } };
    assert.throws(() => database.applySyncPull({ companyId, cursor: 'bad', changes: [change, { ...change, eventId: randomUUID(), entityType: 'invoice' }] }), /unsupported/);
    assert.equal(database.getSyncStatus(companyId).cursor, '1', 'failed page must preserve cursor');
    inspected = await inspectDatabase(fixture.databasePath);
    assert.equal(inspected.query('SELECT COUNT(*) AS count FROM units WHERE sync_id = ?', [change.entityId])[0].count, 0, 'failed page must roll back earlier rows');
    inspected.close();

    database.createUnit({ name: 'Interrupted unit' });
    const claimed = database.claimSyncOutbox(50, companyId);
    assert.ok(claimed.length);
    await database.initDatabase(fixture.root);
    assert.ok(!database.getSyncStatus(companyId).queue.uploading, 'startup must recover interrupted uploads');

    const partial = new SyncService({ database, enabled: true, adapter: {
      async registerDevice() { database.setCurrentCompany('Other company'); return {}; },
      async push({ companyId: sentCompany, events }) {
        assert.equal(sentCompany, companyId);
        assert.ok(events.every((event) => event.companyId === companyId));
        return { results: [] };
      },
      async pull({ companyId: pulledCompany }) {
        assert.equal(pulledCompany, companyId);
        return { changes: [change], cursor: '2' };
      },
    } });
    await partial.syncNow();
    assert.equal(database.getSyncStatus(companyId).cursor, '2');
    assert.equal(database.getSyncStatus().cursor, null, 'company switch must not redirect a pull');
    assert.ok(!database.getSyncStatus(companyId).queue.uploading, 'missing acknowledgements must be retried');

    inspected = await inspectDatabase(fixture.databasePath);
    const remoteUnit = inspected.query('SELECT id FROM units WHERE sync_id = ?', [change.entityId])[0];
    const companyName = inspected.query('SELECT name FROM companies WHERE id = ?', [companyId])[0].name;
    inspected.close();
    database.setCurrentCompany(companyName);
    database.updateUnit({ id: remoteUnit.id, name: 'Local edit' });
    database.applySyncPull({ companyId, cursor: '3', changes: [{ ...change, eventId: randomUUID(), serverVersion: 2, payload: { name: 'Concurrent remote edit' } }] });
    assert.equal(database.getSyncStatus(companyId).unresolvedConflicts, 1, 'equal-version concurrent edits must conflict');
    assert.ok(database.claimSyncOutbox(50, companyId).every((event) => event.entityId !== change.entityId), 'unresolved entities must not upload');
    console.log("Sync service tests passed.");
  } finally {
    fixture.cleanup();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
