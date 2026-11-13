/**
 * Verification test for Check Update mechanism across Cloud & Desktop
 */
const assert = require('node:assert');
const test = require('node:test');
const https = require('node:https');
const http = require('node:http');

const BASE_URL = 'https://dir.anasrawuthar.in';

function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const req = client.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

function compareSemver(latestVersion, currentVersion) {
  const pLatest = latestVersion.split('.').map(n => parseInt(n, 10) || 0);
  const pCurrent = currentVersion.split('.').map(n => parseInt(n, 10) || 0);
  let isNewer = false;
  for (let i = 0; i < Math.max(pLatest.length, pCurrent.length); i++) {
    const l = pLatest[i] || 0;
    const c = pCurrent[i] || 0;
    if (l > c) { isNewer = true; break; }
    if (l < c) { break; }
  }
  return isNewer;
}

test('1. Cloud updates check endpoint returns correct v1.2.0 metadata', async () => {
  const res = await fetchUrl(`${BASE_URL}/api/v1/updates/check?version=1.1.9&platform=win32&arch=x64`);
  assert.strictEqual(res.status, 200, 'Endpoint should return 200 OK');
  const json = JSON.parse(res.body);
  assert.strictEqual(json.ok, true, 'Response ok should be true');
  assert.strictEqual(json.latestVersion, '1.2.0', 'Latest version must be 1.2.0');
  assert.ok(json.fileName.includes('1.2.0'), 'File name should contain 1.2.0');
  assert.strictEqual(json.downloadUrl, '/api/v1/download/app', 'Download URL should be /api/v1/download/app');
  assert.ok(json.releaseNotes && json.releaseNotes.length > 0, 'Release notes must be present');
});

test('2. Installer download endpoint is accessible and returns complete binary', async () => {
  const res = await fetchUrl(`${BASE_URL}/api/v1/download/app`, { method: 'HEAD' });
  assert.strictEqual(res.status, 200, 'Download endpoint should return 200 OK');
  assert.strictEqual(res.headers['content-type'], 'application/octet-stream', 'Should be octet-stream');
  const length = parseInt(res.headers['content-length'], 10);
  assert.ok(length > 100000000, `Binary size must be ~120MB, got: ${length}`);
  assert.ok(res.headers['content-disposition'].includes('ZynBill Setup 1.2.0.exe'), 'Content disposition header must name installer');
});

test('3. Generic auto-updater manifest latest.yml is valid and accessible', async () => {
  const res = await fetchUrl(`${BASE_URL}/downloads/latest.yml`);
  assert.strictEqual(res.status, 200, 'latest.yml must be 200 OK');
  assert.ok(res.body.includes('version: 1.2.0'), 'latest.yml must declare version 1.2.0');
  assert.ok(res.body.includes('sha512:'), 'latest.yml must declare sha512 checksum');
  assert.ok(res.body.includes('path:'), 'latest.yml must specify installer binary path');
});

test('4. Semver update logic accurately identifies update availability', () => {
  assert.strictEqual(compareSemver('1.2.0', '1.1.0'), true, '1.2.0 is newer than 1.1.0');
  assert.strictEqual(compareSemver('1.2.0', '1.1.8'), true, '1.2.0 is newer than 1.1.8');
  assert.strictEqual(compareSemver('1.2.0', '1.1.9'), true, '1.2.0 is newer than 1.1.9');
  assert.strictEqual(compareSemver('1.2.0', '1.2.0'), false, '1.2.0 is up to date on 1.2.0');
  assert.strictEqual(compareSemver('1.2.0', '1.2.1'), false, '1.2.0 is older than future 1.2.1');
});
