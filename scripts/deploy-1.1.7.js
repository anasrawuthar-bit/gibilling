const fs = require('fs');
const path = require('path');
const { setSetting } = require('../server/db');

const distDir = path.resolve('dist');
const pubDownloads = path.resolve('server/public/downloads');
const releaseDir = path.join(pubDownloads, 'releases/1.1.7');

fs.mkdirSync(releaseDir, { recursive: true });

const installerName = 'ZynBill Setup 1.1.7.exe';
const installerAlias = 'ZynBill-Setup-1.1.7.exe';
const blockmapName = 'ZynBill Setup 1.1.7.exe.blockmap';
const blockmapAlias = 'ZynBill-Setup-1.1.7.exe.blockmap';

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

// Update release_filename setting in database
setSetting('release_filename', installerName);

console.log('Successfully deployed 1.1.7 release artifacts and updated release_filename to', installerName);
