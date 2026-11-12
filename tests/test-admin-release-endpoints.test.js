const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');
const { spawn } = require('child_process');

console.log('==================================================================');
console.log('  TESTING LIVE RELEASE STAGING & PUBLISH ENDPOINTS WITH SERVER    ');
console.log('==================================================================');

const TEST_PORT = 4099;
process.env.PORT = String(TEST_PORT);
process.env.ADMIN_JWT_SECRET = 'test_secret_for_release_staging_992837418293';
process.env.NODE_ENV = 'test';

const serverProc = spawn('node', ['server/server.js'], {
  env: { ...process.env, PORT: String(TEST_PORT) },
  stdio: ['ignore', 'pipe', 'pipe']
});

let serverOutput = '';
serverProc.stdout.on('data', d => { serverOutput += d.toString(); });
serverProc.stderr.on('data', d => { serverOutput += d.toString(); });

function cleanup() {
  try {
    if (!serverProc.killed) {
      serverProc.kill();
    }
  } catch (_) {}
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function start() {
  await wait(2000);

  // 1. Admin login
  console.log('\n▶ Step 1: Logging in as Super Admin...');
  const loginRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/v1/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@yourdomain.in', password: 'Admin@123456' })
  });
  const loginData = await loginRes.json();
  assert.ok(loginData.ok, 'Admin login succeeded');
  const token = loginData.token;
  console.log('  ✓ Admin logged in. Token acquired.');

  // 2. Prepare test release files
  const testVersion = '1.9.99';
  const testExeContent = Buffer.alloc(1024 * 1024 + 1024, 'M'); // 1MB + 1KB
  const testExeSha512 = crypto.createHash('sha512').update(testExeContent).digest('base64');
  const testBlockmapContent = Buffer.alloc(1024, 'B'); // 1KB mock blockmap
  const testYmlContent = Buffer.from(`version: ${testVersion}\nfiles:\n  - url: ZynBill Setup ${testVersion}.exe\n    sha512: ${testExeSha512}\n    size: ${testExeContent.length}\npath: ZynBill Setup ${testVersion}.exe\nsha512: ${testExeSha512}\nreleaseDate: '${new Date().toISOString()}'\n`);

  // 3. Stage manifest
  console.log('\n▶ Step 2: Staging latest.yml...');
  const ymlRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/v1/admin/releases/upload?version=${testVersion}&filename=latest.yml&fileType=manifest&stage=true`, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/octet-stream'
    },
    body: testYmlContent
  });
  const ymlData = await ymlRes.json();
  assert.ok(ymlData.ok, 'latest.yml staged successfully: ' + JSON.stringify(ymlData));
  console.log('  ✓ latest.yml staged.');

  // 4. Stage .exe
  console.log('\n▶ Step 3: Staging .exe installer...');
  const exeRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/v1/admin/releases/upload?version=${testVersion}&filename=ZynBill Setup ${testVersion}.exe&fileType=installer&stage=true`, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/octet-stream'
    },
    body: testExeContent
  });
  const exeData = await exeRes.json();
  assert.ok(exeData.ok, '.exe staged successfully: ' + JSON.stringify(exeData));
  console.log('  ✓ .exe installer staged.');

  // 5. Stage .blockmap
  console.log('\n▶ Step 4: Staging .blockmap...');
  const blockmapRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/v1/admin/releases/upload?version=${testVersion}&filename=ZynBill Setup ${testVersion}.exe.blockmap&fileType=blockmap&stage=true`, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/octet-stream'
    },
    body: testBlockmapContent
  });
  const blockmapData = await blockmapRes.json();
  assert.ok(blockmapData.ok, '.blockmap staged successfully: ' + JSON.stringify(blockmapData));
  console.log('  ✓ .blockmap staged.');

  // 6. Publish release
  console.log('\n▶ Step 5: Atomically publishing release package...');
  const pubRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/v1/admin/releases/publish`, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ version: testVersion, notes: 'Automated test release 1.9.99' })
  });
  const pubData = await pubRes.json();
  assert.ok(pubData.ok, 'Release published: ' + JSON.stringify(pubData));
  console.log('  ✓ Atomically published version v' + testVersion);

  // 7. Verify in releases list
  console.log('\n▶ Step 6: Verifying release appears in GET /api/v1/admin/releases...');
  const listRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/v1/admin/releases`, {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const listData = await listRes.json();
  assert.ok(listData.ok, 'Releases listed');
  const found = (listData.versions || []).find(v => v.version === testVersion);
  assert.ok(found, `Version ${testVersion} found in releases repository`);
  console.log(`  ✓ Found release v${testVersion}: exe=${found.exe?.name}, blockmap=${found.blockmap?.name}`);

  // 8. Clean up test version
  console.log('\n▶ Step 7: Cleaning up test release...');
  const delRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/v1/admin/releases/version?version=${testVersion}`, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const delData = await delRes.json();
  assert.ok(delData.ok, 'Release deleted: ' + JSON.stringify(delData));
  console.log('  ✓ Test release cleaned up.');

  console.log('\n==================================================================');
  console.log('  ALL LIVE ENDPOINT TESTS PASSED WITH 100% SUCCESS!               ');
  console.log('==================================================================\n');

  cleanup();
  setTimeout(() => process.exit(0), 500);
}

start().catch(err => {
  console.error('Test Failed:', err);
  cleanup();
  setTimeout(() => process.exit(1), 500);
});
