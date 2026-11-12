const test = require('node:test');
const assert = require('node:assert');
const https = require('node:https');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');

const BASE_URL = 'https://dir.anasrawuthar.in';

test('Live Cloud Restore Test - Download, Verify Checksum, and Apply', async () => {
  // Fetch active token from master.sqlite
  const masterDb = new DatabaseSync(path.join(__dirname, '../server/data/master.sqlite'));
  const row = masterDb.prepare("SELECT token FROM device_tokens WHERE customer_id = 'cust_2095729065082d14' ORDER BY created_at DESC LIMIT 1").get();
  masterDb.close();

  assert.ok(row?.token, 'Must have an active token for customer');
  const token = row.token;

  // 1. Check backup status
  const statusRes = await new Promise((resolve, reject) => {
    https.get(`${BASE_URL}/api/v1/tenant/backup/status`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(body) }));
    }).on('error', reject);
  });

  assert.strictEqual(statusRes.status, 200);
  assert.strictEqual(statusRes.data.ok, true);
  assert.strictEqual(statusRes.data.hasBackup, true);
  assert.ok(statusRes.data.latest.recordCounts.invoices >= 16);
  assert.ok(statusRes.data.latest.recordCounts.parties >= 5);

  // 2. Download the backup
  const backupRes = await new Promise((resolve, reject) => {
    https.get(`${BASE_URL}/api/v1/tenant/backup/latest?format=json`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(body) }));
    }).on('error', reject);
  });

  assert.strictEqual(backupRes.status, 200);
  assert.strictEqual(backupRes.data.ok, true);
  assert.ok(backupRes.data.backupData, 'Must return base64 backup data');

  // 3. Verify SHA256 checksum
  const buffer = Buffer.from(backupRes.data.backupData, 'base64');
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  assert.strictEqual(checksum, backupRes.data.checksum, 'Checksums must match exactly');

  // 4. Verify SQLite contents
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'restore_verify_'));
  const tempDbPath = path.join(tempDir, 'restored.sqlite');
  fs.writeFileSync(tempDbPath, buffer);

  const restoredDb = new DatabaseSync(tempDbPath);
  const parties = restoredDb.prepare('SELECT name, phone FROM parties').all();
  assert.ok(parties.some(p => p.name === 'anas' && p.phone === '9048253862'), 'Party anas must be restored');

  const invoices = restoredDb.prepare('SELECT invoice_no, type, party, total FROM invoices').all();
  assert.ok(invoices.some(i => i.invoice_no === 'PB-2627-0001'), 'Purchase bill PB-2627-0001 must be restored');
  assert.ok(invoices.some(i => i.invoice_no === 'INV-2627-0009'), 'Invoice INV-2627-0009 must be restored');

  restoredDb.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});
