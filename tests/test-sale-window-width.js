const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const database = require('../database');
const os = require('os');
const assert = require('assert');

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gi-sale-width-test-'));
app.setPath('userData', testRoot);

app.whenReady().then(async () => {
  try {
    await database.initDatabase(testRoot);
    ipcMain.handle('db:get-state', () => database.getState());
    ipcMain.handle('db:set-current-company', (_e, name) => database.setCurrentCompany(name));

    const win = new BrowserWindow({
      width: 1200,
      height: 700,
      show: true,
      webPreferences: { preload: path.join(__dirname, '..', 'preload.js') },
    });

    await win.loadFile(path.join(__dirname, '..', 'index.html'));
    await new Promise(r => setTimeout(r, 600));

    await win.webContents.executeJavaScript(`
      document.querySelector('.open-company-button').click();
    `);
    await new Promise(r => setTimeout(r, 800));

    // Test 1: Open Sale with sidebar expanded (default)
    const test1 = await win.webContents.executeJavaScript(`(() => {
      openTransactionEditor('sale');
      const ed = document.querySelector('.transaction-editor');
      const rect = ed.getBoundingClientRect();
      const sbCS = window.getComputedStyle(document.querySelector('.sidebar'));
      return { width: rect.width, sidebarDisplay: sbCS.display };
    })()`);
    console.log('Test 1 (Expanded sidebar -> Sale):', test1);
    assert(test1.width > 1100, `Expected sale width > 1100, got ${test1.width}`);
    assert.strictEqual(test1.sidebarDisplay, 'none');

    // Close Sale back to home
    await win.webContents.executeJavaScript(`
      showView('home');
    `);
    await new Promise(r => setTimeout(r, 300));

    const test1Close = await win.webContents.executeJavaScript(`(() => {
      const sbCS = window.getComputedStyle(document.querySelector('.sidebar'));
      return { sidebarDisplay: sbCS.display, sidebarWidth: sbCS.width };
    })()`);
    console.log('Test 1 after close (Sidebar restored):', test1Close);
    assert.strictEqual(test1Close.sidebarDisplay, 'flex');
    assert.strictEqual(test1Close.sidebarWidth, '248px');

    // Test 2: Collapse sidebar
    await win.webContents.executeJavaScript(`
      document.getElementById('sidebarToggleBtn').click();
    `);
    await new Promise(r => setTimeout(r, 300));

    const test2Collapse = await win.webContents.executeJavaScript(`(() => {
      const sbCS = window.getComputedStyle(document.querySelector('.sidebar'));
      return { sidebarWidth: sbCS.width, isCollapsed: document.body.classList.contains('sidebar-collapsed') };
    })()`);
    console.log('Test 2 (Sidebar collapsed):', test2Collapse);
    assert.strictEqual(test2Collapse.isCollapsed, true);
    assert.strictEqual(test2Collapse.sidebarWidth, '60px');

    // Test 3: Open Sale with sidebar collapsed
    const test3 = await win.webContents.executeJavaScript(`(() => {
      openTransactionEditor('sale');
      const ed = document.querySelector('.transaction-editor');
      const rect = ed.getBoundingClientRect();
      const sbCS = window.getComputedStyle(document.querySelector('.sidebar'));
      return { width: rect.width, sidebarDisplay: sbCS.display };
    })()`);
    console.log('Test 3 (Collapsed sidebar -> Sale):', test3);
    assert(test3.width > 1100, `Expected sale width > 1100 with collapsed sidebar, got ${test3.width}`);
    assert.strictEqual(test3.sidebarDisplay, 'none');

    // Capture screenshot of Sale
    const imgSale = await win.webContents.capturePage();
    fs.writeFileSync('C:/Users/ANAS/.gemini/antigravity/brain/bed9650d-397d-4216-aa80-c0ae1c3c4fcb/sale_window_fullwidth_verified.png', imgSale.toPNG());

    // Test 4: Open Purchase with sidebar collapsed
    const test4 = await win.webContents.executeJavaScript(`(() => {
      openTransactionEditor('purchase', { skipDirtyCheck: true });
      const ed = document.querySelector('.transaction-editor');
      const rect = ed.getBoundingClientRect();
      const sbCS = window.getComputedStyle(document.querySelector('.sidebar'));
      return { width: rect.width, sidebarDisplay: sbCS.display, title: document.querySelector('.transaction-editor .editor-page-title')?.textContent || document.body.dataset.view };
    })()`);
    console.log('Test 4 (Collapsed sidebar -> Purchase):', test4);
    assert(test4.width > 1100, `Expected purchase width > 1100 with collapsed sidebar, got ${test4.width}`);
    assert.strictEqual(test4.sidebarDisplay, 'none');

    // Capture screenshot of Purchase
    await new Promise(r => setTimeout(r, 400));
    const imgPurch = await win.webContents.capturePage();
    fs.writeFileSync('C:/Users/ANAS/.gemini/antigravity/brain/bed9650d-397d-4216-aa80-c0ae1c3c4fcb/purchase_window_fullwidth_verified.png', imgPurch.toPNG());

    // Test 5: Close Purchase back to home, verify collapsed sidebar is preserved
    await win.webContents.executeJavaScript(`
      showView('home');
    `);
    await new Promise(r => setTimeout(r, 300));

    const test5Close = await win.webContents.executeJavaScript(`(() => {
      const sbCS = window.getComputedStyle(document.querySelector('.sidebar'));
      return { sidebarDisplay: sbCS.display, sidebarWidth: sbCS.width, isCollapsed: document.body.classList.contains('sidebar-collapsed') };
    })()`);
    console.log('Test 5 (Return home preserves collapsed sidebar):', test5Close);
    assert.strictEqual(test5Close.isCollapsed, true);
    assert.strictEqual(test5Close.sidebarDisplay, 'flex');
    assert.strictEqual(test5Close.sidebarWidth, '60px');

    // Test 6: Check other transaction editors (estimate, saleReturn, purchaseReturn)
    for (const type of ['estimate', 'saleReturn', 'purchaseReturn']) {
      const res = await win.webContents.executeJavaScript(`(() => {
        openTransactionEditor('${type}', { skipDirtyCheck: true });
        const ed = document.querySelector('.transaction-editor');
        return { width: ed.getBoundingClientRect().width };
      })()`);
      console.log('Test 6 (' + type + '):', res);
      assert(res.width > 1100, 'Expected ' + type + ' width > 1100, got ' + res.width);
    }

    console.log('ALL TRANSACTION WINDOW WIDTH TESTS PASSED SUCCESSFULLY!');
    app.quit();
  } catch (err) {
    console.error('TEST FAILED:', err);
    app.exit(1);
  }
});
