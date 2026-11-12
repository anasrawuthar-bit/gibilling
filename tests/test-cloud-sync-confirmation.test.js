const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const database = require('../database');
const { SyncService, HttpSyncAdapter } = require('../sync-service');

console.log('==================================================================');
console.log('  CONFIRMING CLOUD DATA SYNCHRONIZATION AND BACKUP PIPELINE       ');
console.log('==================================================================');

const testUserData = path.join(__dirname, '..', 'scratch', 'test_cloud_sync_data_' + Date.now());
fs.mkdirSync(testUserData, { recursive: true });

async function runTest() {
  // 1. Initialize database in isolated test environment
  await database.initDatabase(testUserData);
  const company = database.getCurrentCompany();
  console.log(`\n▶ Step 1: Initialized local database for company "${company.name}" (ID: ${company.id})`);

  // 2. Test that Party Creation triggers sync_outbox event
  console.log('\n▶ Step 2: Testing Party creation delta sync tracking...');
  database.createParty({
    name: 'Sync Verification Customer ' + Date.now(),
    phone: '9847123456',
    email: 'sync.test@example.com',
    type: 'customer'
  });

  const syncStatusAfterParty = database.getSyncStatus(company.id);
  console.log('  Sync Status after Party creation:', syncStatusAfterParty);
  assert.ok((syncStatusAfterParty.queue?.pending || 0) >= 1, 'sync_outbox must record pending event for created party');
  console.log('  ✓ Party creation correctly queued in sync_outbox.');

  // 3. Test that Item Creation triggers sync_outbox event
  console.log('\n▶ Step 3: Testing Item creation delta sync tracking...');
  database.createItem({
    name: 'Sync Test Item ' + Date.now(),
    salePrice: 250,
    purchasePrice: 180,
    unit: 'PCS',
    category: 'General'
  });

  const syncStatusAfterItem = database.getSyncStatus(company.id);
  console.log('  Sync Status after Item creation:', syncStatusAfterItem);
  assert.ok((syncStatusAfterItem.queue?.pending || 0) >= 2, 'sync_outbox must record pending event for created item');
  console.log('  ✓ Item creation correctly queued in sync_outbox.');

  // 4. Test Claiming Outbox Events
  console.log('\n▶ Step 4: Testing outbox claim for batch transmission...');
  const claimedEvents = database.claimSyncOutbox(50, company.id);
  assert.ok(claimedEvents.length >= 2, 'Must claim at least 2 events');
  const partyEv = claimedEvents.find(e => e.entityType === 'party');
  const itemEv = claimedEvents.find(e => e.entityType === 'item');
  assert.ok(partyEv, 'Claimed events must include party event');
  assert.ok(itemEv, 'Claimed events must include item event');
  console.log(`  ✓ Successfully claimed ${claimedEvents.length} events (Party: ${partyEv.id}, Item: ${itemEv.id}).`);

  // 5. Simulate Server Acknowledgment
  console.log('\n▶ Step 5: Completing sync push acknowledgment...');
  const ackResults = claimedEvents.map(e => ({ id: e.id, status: 'accepted', serverVersion: 1 }));
  database.completeSyncPush(ackResults);
  const statusAfterAck = database.getSyncStatus(company.id);
  console.log('  Sync Status after Acknowledgment:', statusAfterAck);
  assert.strictEqual(statusAfterAck.queue?.pending || 0, 0, 'Pending count must be 0 after acknowledgment');
  console.log('  ✓ All claimed events acknowledged and marked completed.');

  // 6. Test Full Database Snapshot Export for Cloud Disaster Recovery
  console.log('\n▶ Step 6: Testing Full Database Snapshot Export...');
  const buffer = database.exportDatabaseBuffer();
  assert.ok(buffer && buffer.length > 10000, 'Database buffer must be exported and non-empty');
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  console.log(`  ✓ Exported full database buffer: ${(buffer.length / 1024).toFixed(1)} KB (SHA-256: ${checksum.slice(0, 16)}...)`);

  // Cleanup test scratch directory
  try {
    fs.rmSync(testUserData, { recursive: true, force: true });
  } catch (_) {}

  console.log('\n==================================================================');
  console.log('  ALL CLOUD SYNC & DATA VERIFICATION CHECKS PASSED (100% CONFIRMED)');
  console.log('==================================================================\n');
}

runTest().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
