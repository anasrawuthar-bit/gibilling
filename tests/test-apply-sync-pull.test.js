const assert = require('assert');
const path = require('path');
const os = require('os');
const database = require('../database');

async function testApplyPull() {
  console.log('Testing applySyncPull with party entity in isolated test DB...');
  const tmpDir = path.join(os.tmpdir(), `test_sync_pull_${Date.now()}`);
  require('fs').mkdirSync(tmpDir, { recursive: true });

  await database.initDatabase(tmpDir);
  const statusBefore = database.getSyncStatus();
  console.log('Test DB Company ID:', statusBefore.companyId);

  const testPartyChange = {
    eventId: 'test_ev_party_1',
    id: 'test_ev_party_1',
    entityType: 'party',
    entityId: 'sync_party_123',
    operation: 'upsert',
    serverVersion: 1,
    payload: {
      name: 'anas',
      phone: '9048253862',
      email: 'anas@test.local',
      party_type: 'party',
      gstin: '',
      state: 'Kerala',
      balance: -15000
    }
  };

  database.applySyncPull({
    changes: [testPartyChange],
    cursor: new Date().toISOString(),
    companyId: statusBefore.companyId
  });

  const state = database.getState();
  const parties = state.parties || [];
  console.log('Parties after pull:', parties);
  const found = parties.find(p => p.name === 'anas');
  assert.ok(found, 'Party anas should be present in database after sync pull');
  assert.strictEqual(found.phone, '9048253862', 'Phone must match');
  console.log('  [PASS] Remote party pulled and inserted into local SQLite database successfully!');

  // Clean up
  try { require('fs').rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
}

testApplyPull().catch(console.error);
