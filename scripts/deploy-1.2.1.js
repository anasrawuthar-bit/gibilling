const fs = require('fs');
const path = require('path');
const { setSetting } = require('../server/db');

const distDir = path.resolve('dist');
const pubDownloads = path.resolve('server/public/downloads');
const releaseDir = path.join(pubDownloads, 'releases/1.2.1');

fs.mkdirSync(releaseDir, { recursive: true });

const installerName = 'ZynBill Setup 1.2.1.exe';
const installerAlias = 'ZynBill-Setup-1.2.1.exe';
const blockmapName = 'ZynBill Setup 1.2.1.exe.blockmap';
const blockmapAlias = 'ZynBill-Setup-1.2.1.exe.blockmap';

if (fs.existsSync(path.join(distDir, installerName))) {
  fs.copyFileSync(path.join(distDir, installerName), path.join(pubDownloads, installerName));
  fs.copyFileSync(path.join(distDir, installerName), path.join(pubDownloads, installerAlias));
  fs.copyFileSync(path.join(distDir, installerName), path.join(releaseDir, installerName));
  fs.copyFileSync(path.join(distDir, installerName), path.join(releaseDir, installerAlias));
}

if (fs.existsSync(path.join(distDir, blockmapName))) {
  fs.copyFileSync(path.join(distDir, blockmapName), path.join(pubDownloads, blockmapName));
  fs.copyFileSync(path.join(distDir, blockmapName), path.join(pubDownloads, blockmapAlias));
  fs.copyFileSync(path.join(distDir, blockmapName), path.join(releaseDir, blockmapName));
  fs.copyFileSync(path.join(distDir, blockmapName), path.join(releaseDir, blockmapAlias));
}

if (fs.existsSync(path.join(distDir, 'latest.yml'))) {
  fs.copyFileSync(path.join(distDir, 'latest.yml'), path.join(pubDownloads, 'latest.yml'));
  fs.copyFileSync(path.join(distDir, 'latest.yml'), path.join(releaseDir, 'latest.yml'));
}

setSetting('release_filename', installerName);
setSetting('latest_version', '1.2.1');

console.log('Successfully deployed 1.2.1 release artifacts and updated release_filename to', installerName);
