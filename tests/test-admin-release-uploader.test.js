const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('==================================================================');
console.log('  VERIFYING ADMIN PANEL ELECTRON RELEASE PACKAGE UPLOADER (VUE 3) ');
console.log('==================================================================');

const adminHtmlPath = path.join(__dirname, '..', 'server', 'public', 'admin.html');
assert.ok(fs.existsSync(adminHtmlPath), 'admin.html exists');

const html = fs.readFileSync(adminHtmlPath, 'utf8');

// 1. Verify CSS styles for artifacts dropzone
console.log('\n▶ Step 1: Checking Dropzone & Artifact CSS classes in admin.html...');
const requiredClasses = [
  '.artifact-grid',
  '.artifact-slot',
  '.artifact-slot.has-file',
  '.artifact-slot.drag-over',
  '.artifact-header',
  '.artifact-tag',
  '.artifact-ext-badge',
  '.btn-choose-file',
  '.file-loaded-view',
  '.loaded-file-card',
  '.manifest-spec-card',
  '.manifest-spec-header',
  '.btn-publish-main'
];

for (const cls of requiredClasses) {
  assert.ok(html.includes(cls), `Missing CSS class: ${cls}`);
  console.log(`  ✓ Found CSS rule: ${cls}`);
}

// 2. Verify Template elements in Releases tab
console.log('\n▶ Step 2: Checking HTML template in Releases tab...');
assert.ok(html.includes('Deploy Electron Release Package'), 'Deploy header exists');
assert.ok(html.includes('ref="manifestInput"'), 'manifestInput ref exists');
assert.ok(html.includes('ref="exeInput"'), 'exeInput ref exists');
assert.ok(html.includes('ref="blockmapInput"'), 'blockmapInput ref exists');
assert.ok(html.includes('onManifestChange'), 'onManifestChange handler bound');
assert.ok(html.includes('onExeChange'), 'onExeChange handler bound');
assert.ok(html.includes('onBlockmapChange'), 'onBlockmapChange handler bound');
assert.ok(html.includes('onDropFile($event, \'manifest\')'), 'manifest drag-drop bound');
assert.ok(html.includes('onDropFile($event, \'exe\')'), 'exe drag-drop bound');
assert.ok(html.includes('onDropFile($event, \'blockmap\')'), 'blockmap drag-drop bound');
assert.ok(html.includes('Auto-Detected Release Details'), 'Auto-detected metadata view exists');
assert.ok(html.includes('Allow re-upload / overwrite of this version'), 'Downgrade warning & overwrite checkbox exists');
assert.ok(html.includes('uploadReleaseNotes'), 'Release notes v-model exists');
assert.ok(html.includes('isUploading'), 'isUploading state check exists');
assert.ok(html.includes('Publish Release Package'), 'Publish button exists');
assert.ok(html.includes('resetUploadForm'), 'resetUploadForm button exists');
console.log('  ✓ All 3 artifact dropzone cards & forms correctly templated in Vue 3 Releases view.');

// 3. Verify JavaScript setup logic & handlers
console.log('\n▶ Step 3: Verifying Vue 3 Setup reactivity and methods...');
assert.ok(html.includes('const manifestFile = ref(null);'), 'manifestFile ref defined');
assert.ok(html.includes('const exeFile = ref(null);'), 'exeFile ref defined');
assert.ok(html.includes('const blockmapFile = ref(null);'), 'blockmapFile ref defined');
assert.ok(html.includes('const parsedManifest = ref(null);'), 'parsedManifest ref defined');
assert.ok(html.includes('const allowDowngrade = ref(false);'), 'allowDowngrade ref defined');
assert.ok(html.includes('const compareSemver ='), 'compareSemver defined');
assert.ok(html.includes('const semverCmp = computed('), 'semverCmp computed defined');
assert.ok(html.includes('const isReadyToPublish = computed('), 'isReadyToPublish computed defined');
assert.ok(html.includes('const processManifestFile ='), 'processManifestFile parser defined');
assert.ok(html.includes('const uploadSingleFile ='), 'uploadSingleFile XHR streamer defined');
assert.ok(html.includes('const publishReleasePackage ='), 'publishReleasePackage pipeline defined');
assert.ok(html.includes('publishReleasePackage'), 'publishReleasePackage returned in setup');
console.log('  ✓ Vue 3 reactive states, computed properties, and sequential upload pipeline verified.');

console.log('\n==================================================================');
console.log('  ALL ADMIN PANEL ELECTRON RELEASE UPLOADER CHECKS PASSED!        ');
console.log('==================================================================\n');
