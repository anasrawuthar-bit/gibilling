const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load env
require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });
const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

function makeRequest(method, reqPath, headers = {}, bodyStreamOrBuffer = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(reqPath, BASE_URL);
    const req = http.request(
      url,
      {
        method,
        headers
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch (_) {}
          resolve({ status: res.statusCode, headers: res.headers, raw, json });
        });
      }
    );

    req.on('error', reject);

    if (bodyStreamOrBuffer) {
      if (Buffer.isBuffer(bodyStreamOrBuffer) || typeof bodyStreamOrBuffer === 'string') {
        req.end(bodyStreamOrBuffer);
      } else {
        bodyStreamOrBuffer.pipe(req);
      }
    } else {
      req.end();
    }
  });
}

  // Backup current latest.yml
  const downloadsLatestYml = path.join(__dirname, '..', 'server', 'public', 'downloads', 'latest.yml');
  const originalLatestContent = fs.existsSync(downloadsLatestYml) ? fs.readFileSync(downloadsLatestYml, 'utf8') : null;

  // 1. Login as Super Admin
  const adminEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@anas.in';
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD || 'Admin@123456';

  const loginRes = await makeRequest(
    'POST',
    '/api/v1/admin/login',
    { 'Content-Type': 'application/json' },
    JSON.stringify({ email: adminEmail, password: adminPassword })
  );

  assert.strictEqual(loginRes.status, 200, `Admin login failed: ${loginRes.raw}`);
  const token = loginRes.json.token;
  assert.ok(token, 'Admin token should be present');
  console.log('  [PASS] Super Admin authenticated');

  // 2. Generate a simulated 3 MB dummy installer file to upload in 3 chunks of 1 MB
  const dummyInstallerVersion = '9.9.1';
  const dummySize = 3 * 1024 * 1024; // 3 MB
  const dummyBuffer = crypto.randomBytes(dummySize);
  const expectedSha512 = crypto.createHash('sha512').update(dummyBuffer).digest('base64');
  const dummyFilename = `ZynBill Setup ${dummyInstallerVersion}.exe`;

  const chunkSize = 1024 * 1024; // 1 MB per chunk
  const totalChunks = Math.ceil(dummySize / chunkSize);
  const uploadId = `test_${Date.now()}`;

  console.log(`  Starting 3-chunk upload of ${dummyFilename} (${dummySize} bytes, 3 chunks)...`);

  for (let c = 0; c < totalChunks; c++) {
    const start = c * chunkSize;
    const end = Math.min(start + chunkSize, dummySize);
    const chunkBuffer = dummyBuffer.subarray(start, end);

    const chunkUrl = `/api/v1/admin/releases/upload?version=${dummyInstallerVersion}&filename=${encodeURIComponent(
      dummyFilename
    )}&fileType=installer&stage=true&chunkIndex=${c}&totalChunks=${totalChunks}&totalBytes=${dummySize}&uploadId=${uploadId}`;

    const chunkRes = await makeRequest(
      'POST',
      chunkUrl,
      {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream'
      },
      chunkBuffer
    );

    assert.strictEqual(chunkRes.status, 200, `Chunk ${c} upload failed: ${chunkRes.raw}`);
    if (c < totalChunks - 1) {
      assert.strictEqual(chunkRes.json.complete, false, `Chunk ${c} should not be marked complete`);
      assert.strictEqual(chunkRes.json.chunkIndex, c, `Chunk index mismatch`);
      console.log(`  [PASS] Chunk ${c + 1}/${totalChunks} uploaded and acknowledged`);
    } else {
      assert.strictEqual(chunkRes.json.complete, true, `Final chunk should be complete`);
      assert.strictEqual(chunkRes.json.sha512, expectedSha512, 'Calculated SHA-512 must match exactly');
      console.log(`  [PASS] Final chunk ${c + 1}/${totalChunks} uploaded and file reassembled with SHA-512 match!`);
    }
  }

  // 3. Verify file exists in staging directory and size matches
  const stagingExePath = path.join(
    __dirname,
    '..',
    'server',
    'data',
    'releases',
    'staging',
    dummyInstallerVersion,
    dummyFilename
  );
  // Also check server/data/staging
  const altStagingPath = path.join(
    __dirname,
    '..',
    'server',
    'data',
    'staging',
    dummyInstallerVersion,
    dummyFilename
  );

  const finalPath = fs.existsSync(stagingExePath) ? stagingExePath : altStagingPath;
  assert.ok(fs.existsSync(finalPath), `Staged exe file must exist on disk at ${finalPath}`);
  const diskSize = fs.statSync(finalPath).size;
  assert.strictEqual(diskSize, dummySize, 'Disk file size must match original buffer size exactly');
  console.log(`  [PASS] File verified on server disk with identical byte length (${diskSize} bytes)`);

  // 4. Test Single-Stream backward compatibility (manifest upload)
  const manifestContent = `version: ${dummyInstallerVersion}\npath: ${dummyFilename}\nsha512: ${expectedSha512}\n`;
  const manifestUrl = `/api/v1/admin/releases/upload?version=${dummyInstallerVersion}&filename=latest.yml&fileType=manifest&stage=true`;
  const manifestRes = await makeRequest(
    'POST',
    manifestUrl,
    {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream'
    },
    Buffer.from(manifestContent, 'utf8')
  );
  assert.strictEqual(manifestRes.status, 200, `Single-stream manifest upload failed: ${manifestRes.raw}`);
  console.log('  [PASS] Single-stream upload remains fully backward-compatible');

  // 5. Test Blockmap upload
  const blockmapUrl = `/api/v1/admin/releases/upload?version=${dummyInstallerVersion}&filename=${encodeURIComponent(
    dummyFilename + '.blockmap'
  )}&fileType=blockmap&stage=true`;
  const blockmapRes = await makeRequest(
    'POST',
    blockmapUrl,
    {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream'
    },
    Buffer.from('fake blockmap data content that is definitely larger than 100 bytes minimum check for test validation. Padding with extra characters: 1234567890 1234567890 1234567890 1234567890 1234567890', 'utf8')
  );
  assert.strictEqual(blockmapRes.status, 200, `Blockmap upload failed: ${blockmapRes.raw}`);
  console.log('  [PASS] Blockmap staging succeeded');

  // 6. Test Publishing the chunk-uploaded release
  const publishRes = await makeRequest(
    'POST',
    '/api/v1/admin/releases/publish',
    {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    JSON.stringify({ version: dummyInstallerVersion, notes: 'Automated chunked upload test release' })
  );
  assert.strictEqual(publishRes.status, 200, `Publish release failed: ${publishRes.raw}`);
  assert.ok(publishRes.json.ok, 'Publish release response ok');
  console.log('  [PASS] Atomically published chunk-uploaded release successfully!');

  // Clean up test release artifacts
  try {
    const pubRelDir = path.join(__dirname, '..', 'server', 'public', 'downloads', 'releases', dummyInstallerVersion);
    if (fs.existsSync(pubRelDir)) fs.rmSync(pubRelDir, { recursive: true, force: true });
    if (originalLatestContent && fs.existsSync(downloadsLatestYml)) {
      fs.writeFileSync(downloadsLatestYml, originalLatestContent, 'utf8');
    }
  } catch (_) {}

  console.log('\nAll Chunked Upload Verification Tests Passed Successfully!');
}

run().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
