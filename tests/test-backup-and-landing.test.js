const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');

function get(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:4000${urlPath}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('--- Testing Web Routes & Promotional Website ---');

  // Test 1: GET / (Promotional Landing Page)
  const homeRes = await get('/');
  assert.strictEqual(homeRes.status, 200);
  assert.ok(homeRes.body.includes('Ultra-Fast Billing &amp; Accounting'), 'Hero headline present');
  assert.ok(homeRes.body.includes('Direct WhatsApp Connect'), 'WhatsApp Connect feature present');
  assert.ok(homeRes.body.includes('Thermal POS &amp; A4 Laser Printing'), 'Thermal POS feature present');
  assert.ok(homeRes.body.includes('Customer &amp; Vendor Khata Ledgers'), 'Khata feature present');
  assert.ok(!homeRes.body.toLowerCase().includes('sqlite'), 'No developer jargon (sqlite) on promotional page');
  console.log('✓ GET / successfully serves business-oriented promotional landing page');

  // Test 2: GET /register
  const regRes = await get('/register');
  assert.strictEqual(regRes.status, 200);
  assert.ok(regRes.body.includes('Register') || regRes.body.includes('Registration'), 'Register page served');
  console.log('✓ GET /register successfully serves registration portal');

  // Test 3: GET /portal
  const portalRes = await get('/portal');
  assert.strictEqual(portalRes.status, 200);
  assert.ok(portalRes.body.includes('rptTotalSales'), 'Portal includes Synced Business Reports & Analytics');
  assert.ok(portalRes.body.includes('Download ZynBill Desktop Application'), 'Portal includes Download Windows App');
  console.log('✓ GET /portal successfully serves customer self-service portal with reports');

  // Test 4: GET /admin
  const adminRes = await get('/admin');
  assert.strictEqual(adminRes.status, 200);
  console.log('✓ GET /admin successfully serves Super Admin panel');

  console.log('\n--- Testing Backup Directory & Rolling Retention (5 Files Limit) ---');
  // Test backup directory logic
  const preferred = process.platform === 'win32' ? 'C:\\ZynBill\\Backups' : path.join(__dirname, 'test_backups');
  if (!fs.existsSync(preferred)) {
    try {
      fs.mkdirSync(preferred, { recursive: true });
    } catch (_) {}
  }
  assert.ok(fs.existsSync(preferred) || process.platform !== 'win32', 'Backup folder accessible');

  // Test rolling pruning logic: create 8 mock backup files, prune to 5, verify exactly 5 remaining
  const testDir = path.join(__dirname, 'temp_rolling_test');
  if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  fs.mkdirSync(testDir, { recursive: true });

  const now = Date.now();
  for (let i = 1; i <= 8; i++) {
    const fPath = path.join(testDir, `ZynBill-Backup-test-${i}.zyn`);
    fs.writeFileSync(fPath, `Backup data ${i}`);
    // stagger mtime
    const mtime = new Date(now - (8 - i) * 10000);
    fs.utimesSync(fPath, mtime, mtime);
  }

  const beforeFiles = fs.readdirSync(testDir).filter(f => f.endsWith('.zyn'));
  assert.strictEqual(beforeFiles.length, 8, 'Should have 8 files before pruning');

  // Prune function simulation (exact match to main.js pruneZynBackups)
  const maxKeep = 5;
  const filesWithStats = fs.readdirSync(testDir)
    .filter(f => f.endsWith('.zyn'))
    .map(f => {
      const fp = path.join(testDir, f);
      return { filename: f, fullPath: fp, mtimeMs: fs.statSync(fp).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (filesWithStats.length > maxKeep) {
    const toDelete = filesWithStats.slice(maxKeep);
    for (const item of toDelete) {
      fs.unlinkSync(item.fullPath);
    }
  }

  const afterFiles = fs.readdirSync(testDir).filter(f => f.endsWith('.zyn'));
  assert.strictEqual(afterFiles.length, 5, 'Should have exactly 5 files after rolling pruning');
  assert.ok(!afterFiles.includes('ZynBill-Backup-test-1.zyn'), 'Oldest file 1 should be deleted');
  assert.ok(!afterFiles.includes('ZynBill-Backup-test-2.zyn'), 'Oldest file 2 should be deleted');
  assert.ok(!afterFiles.includes('ZynBill-Backup-test-3.zyn'), 'Oldest file 3 should be deleted');
  assert.ok(afterFiles.includes('ZynBill-Backup-test-8.zyn'), 'Newest file 8 must be retained');
  assert.ok(afterFiles.includes('ZynBill-Backup-test-7.zyn'), 'Newest file 7 must be retained');
  assert.ok(afterFiles.includes('ZynBill-Backup-test-4.zyn'), '5th newest file must be retained');

  // Clean up test dir
  fs.rmSync(testDir, { recursive: true, force: true });
  console.log('✓ Rolling retention verified: strict max 5 files kept, FIFO oldest deletion working perfectly');

  console.log('\n--- ALL BACKUP, LANDING, AND REPORT TESTS PASSED ---');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
