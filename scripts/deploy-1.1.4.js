const fs = require('fs');
const path = require('path');

const distDir = path.resolve('dist');
const pubDownloads = path.resolve('server/public/downloads');
const releaseDir = path.join(pubDownloads, 'releases/1.1.4');

fs.mkdirSync(releaseDir, { recursive: true });

const installerName = 'ZynBill Setup 1.1.4.exe';
const installerAlias = 'ZynBill-Setup-1.1.4.exe';
const blockmapName = 'ZynBill Setup 1.1.4.exe.blockmap';
const blockmapAlias = 'ZynBill-Setup-1.1.4.exe.blockmap';

// Copy installer
fs.copyFileSync(path.join(distDir, installerName), path.join(pubDownloads, installerName));
fs.copyFileSync(path.join(distDir, installerName), path.join(pubDownloads, installerAlias));
fs.copyFileSync(path.join(distDir, installerName), path.join(releaseDir, installerName));
fs.copyFileSync(path.join(distDir, installerName), path.join(releaseDir, installerAlias));

// Copy blockmap
fs.copyFileSync(path.join(distDir, blockmapName), path.join(pubDownloads, blockmapName));
fs.copyFileSync(path.join(distDir, blockmapName), path.join(pubDownloads, blockmapAlias));
fs.copyFileSync(path.join(distDir, blockmapName), path.join(releaseDir, blockmapName));
fs.copyFileSync(path.join(distDir, blockmapName), path.join(releaseDir, blockmapAlias));

// Read latest.yml and copy
let latestYml = fs.readFileSync(path.join(distDir, 'latest.yml'), 'utf8');
fs.writeFileSync(path.join(pubDownloads, 'latest.yml'), latestYml, 'utf8');
fs.writeFileSync(path.join(releaseDir, 'latest.yml'), latestYml, 'utf8');

console.log('Successfully deployed 1.1.4 release artifacts to downloads/ and releases/1.1.4/.');
