const fs = require('fs');
const assert = require('assert');

console.log('--- Testing Startup, Background Tray, and Close Behavior ---');

// 1. Verify main.js contains close event interception to hide instead of quit
const mainJs = fs.readFileSync('main.js', 'utf8');
assert.ok(mainJs.includes('window.on("close"'), 'main.js must intercept close event');
assert.ok(mainJs.includes('window.hide()'), 'main.js must hide window on close');
assert.ok(mainJs.includes('system:get-autostart'), 'main.js must have system:get-autostart handler');
assert.ok(mainJs.includes('system:set-autostart'), 'main.js must have system:set-autostart handler');
assert.ok(mainJs.includes('app.setLoginItemSettings'), 'main.js must use setLoginItemSettings');

// 2. Verify preload.js exposes getAutoStart and setAutoStart
const preloadJs = fs.readFileSync('preload.js', 'utf8');
assert.ok(preloadJs.includes('getAutoStart: () => ipcRenderer.invoke("system:get-autostart")'), 'preload.js must expose getAutoStart');
assert.ok(preloadJs.includes('setAutoStart: (enable) => ipcRenderer.invoke("system:set-autostart", enable)'), 'preload.js must expose setAutoStart');

// 3. Verify app.js no longer calls createSnapshot on beforeunload
const appJs = fs.readFileSync('app.js', 'utf8');
const beforeunloadBlock = appJs.slice(appJs.indexOf('window.addEventListener("beforeunload"'), appJs.indexOf('window.addEventListener("beforeunload"') + 400);
assert.ok(!beforeunloadBlock.includes('createSnapshot'), 'app.js beforeunload must not trigger createSnapshot');

// 4. Verify app.js UI elements for auto-start
assert.ok(appJs.includes('settingsAutoStartCheckbox'), 'app.js must include settingsAutoStartCheckbox');
assert.ok(appJs.includes('settingsAutoStartBadge'), 'app.js must include settingsAutoStartBadge');

// 5. Zero Malayalam in app.js and index.html
const malayalamRegex = /[\u0D00-\u0D7F]/;
assert.ok(!malayalamRegex.test(appJs), 'app.js must contain zero Malayalam characters');
const indexHtml = fs.readFileSync('index.html', 'utf8');
assert.ok(!malayalamRegex.test(indexHtml), 'index.html must contain zero Malayalam characters');

console.log('✓ All Startup, Background Tray, and Clean Close tests passed 100%!');
