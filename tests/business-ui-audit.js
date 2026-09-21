const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const database = require('../database');
const { seedMasters, sampleInvoice } = require('./database-fixtures');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gi-business-ui-audit-'));
app.setPath('userData', root);

app.whenReady().then(async () => {
  let window;
  const results = [];
  try {
    await database.initDatabase(root);
    const { customer, supplier, item } = seedMasters({});
    console.log('Audit masters seeded');
    database.createTransaction(sampleInvoice({ type: 'sale', party: customer, item, id: 'ui-sale', qty: 1 }));
    database.createTransaction(sampleInvoice({ type: 'purchase', party: supplier, item, id: 'ui-purchase', qty: 1 }));
    for (const documentType of ['estimate', 'proforma', 'sale_order', 'delivery_challan', 'purchase_order']) {
      database.createEstimate({ ...sampleInvoice({ type: 'sale', party: customer, item, id: `ui-${documentType}`, qty: 1 }), estimateId: `ui-${documentType}`, documentType });
    }
    console.log('Audit documents seeded');
    ipcMain.handle('db:get-state', () => database.getState());
    ipcMain.handle('db:set-current-company', (_event, name) => database.setCurrentCompany(name));
    window = new BrowserWindow({ show: false, width: 1366, height: 768,
      webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    window.webContents.on('did-fail-load', (_event, code, description) => console.error('Load failed', code, description));
    await window.loadURL('about:blank');
    window.webContents.debugger.attach('1.3');
    await window.webContents.debugger.sendCommand('Page.enable');
    console.log('Debugger attached');
    await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.__auditListeners = new WeakMap();
      const original = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function(type, handler, options) {
        const types = window.__auditListeners.get(this) || [];
        types.push(type); window.__auditListeners.set(this, types);
        return original.call(this, type, handler, options);
      };
    ` });
    console.log('Instrumentation installed');
    await window.loadFile(path.join(__dirname, '..', 'index.html'));
    await new Promise((resolve) => setTimeout(resolve, 350));
    console.log('Renderer loaded');
    await window.webContents.executeJavaScript('document.querySelector(".open-company-button").click(); undefined');
    await new Promise((resolve) => setTimeout(resolve, 350));
    const views = await window.webContents.executeJavaScript('Array.from(new Set(Array.from(document.querySelectorAll(".side-nav [data-view]")).map(el => el.dataset.view)))');
    const scenarios = views.map((view) => ({ name: view, script: `showView(${JSON.stringify(view)})` }));
    for (const type of ['sale', 'purchase', 'estimate', 'proforma', 'saleOrder', 'deliveryChallan', 'purchaseOrder', 'saleReturn', 'purchaseReturn']) {
      scenarios.push({ name: `${type}-editor`, script: `openTransactionEditor(${JSON.stringify(type)}, { skipDirtyCheck: true })` });
    }
    for (const type of ['overview', 'gstr1', 'gstr2', 'gstr3b', 'gstLiability', 'profitability', 'sale', 'purchase', 'expenseBreakdown', 'daybook', 'partyStatement', 'partyBalances', 'receivableAging', 'payableAging', 'stock', 'itemLedger', 'profitLoss', 'trialBalance', 'cashBank']) {
      scenarios.push({ name: `report-${type}`, script: `elements.featureView.innerHTML = reportsTemplate(${JSON.stringify(type)}); bindFeatureActions()` });
    }
    for (const [name, script] of [
      ['payment-in-modal', 'showView("paymentIn"); openPaymentInModal()'],
      ['payment-out-modal', 'showView("paymentOut"); openPaymentOutModal()'],
      ['stock-adjustment-modal', 'showView("items"); openStockAdjustmentModal()'],
      ['expense-modal', 'showView("expenses"); openExpenseModal()'],
      ['party-modal', 'showView("parties"); openEntryModal("party")'],
      ['item-modal', 'showView("items"); openEntryModal("item")'],
      ['bank-form', 'showView("cash"); openBankAccountForm()'],
      ['custom-fields-settings', 'showView("appSettings"); elements.featureView.innerHTML = settingsTemplate("CUSTOM FIELDS"); bindFeatureActions()'],
    ]) scenarios.push({ name, script });
    for (const scenario of scenarios) {
      try {
        console.log('Inspecting', scenario.name);
        const error = await window.webContents.executeJavaScript('(() => { try { ' + scenario.script + '; return null; } catch (error) { return error.stack; } })()');
        if (error) throw new Error(error);
        await window.webContents.executeJavaScript('document.querySelectorAll("details").forEach(el => el.open = true)');
        const actions = await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button, input, select, summary, textarea, [role="button"], a[href]')).filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden').map(el => ({
          tag: el.tagName, id: el.id, label: el.getAttribute('aria-label') || el.innerText || el.placeholder || el.name || '',
          attributes: Object.fromEntries(Array.from(el.attributes).filter(a => a.name.startsWith('data-') || ['name','type','href','onclick'].includes(a.name)).map(a => [a.name,a.value])),
          listeners: window.__auditListeners?.get(el) || [],
          formListeners: el.form ? window.__auditListeners?.get(el.form) || [] : [],
          disabled: el.disabled || false,
          semanticVerification: 'UNVERIFIED: listener presence alone does not establish intended behavior, restart persistence or error handling'
        }))`);
        results.push({ screen: scenario.name, render: 'PASS', actions });
      } catch (error) { results.push({ screen: scenario.name, render: 'BROKEN', error: error.message, actions: [] }); }
    }
    const out = path.join(__dirname, '..', 'audits');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'phase2-action-inventory.json'), JSON.stringify({ generatedAt: new Date().toISOString(), scope: 'Seeded isolated Electron UI; visible controls in enumerated screens, excludes unopened menus/modals', results }, null, 2));
    const safe = (text) => String(text || '').replace(/\|/g, '/').replace(/[\r\n]+/g, ' ').slice(0, 140);
    const matrix = ['# Phase 2 action matrix', '', 'Generated from an isolated seeded Electron session. Menus are expanded. Listed controls are an inventory, not proof of full operation. Every untested semantic/error/loading/restart result remains UNVERIFIED.', '', '| Screen | Control | Handler evidence | Backend/operation | Error/loading/refresh/restart |', '|---|---|---|---|---|'];
    for (const result of results) {
      for (const action of result.actions) matrix.push(`| ${safe(result.screen)} | ${safe(action.id || action.label || action.tag)} | ${safe([...action.listeners, ...action.formListeners].join(', ')) || 'UNVERIFIED/native/delegated'} | UNVERIFIED | UNVERIFIED |`);
    }
    fs.writeFileSync(path.join(out, 'phase2-action-matrix.md'), matrix.join('\n') + '\n');
    const broken = results.filter((result) => result.render === 'BROKEN');
    console.log(`${results.length} screens inspected; ${results.reduce((n, r) => n + r.actions.length, 0)} visible control instances; ${broken.length} render failures.`);
    broken.forEach((result) => console.error(result.screen, result.error));
    if (broken.length) process.exitCode = 1;
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally {
    window?.destroy();
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* Electron can retain its session files until quit. */ }
    app.exit(process.exitCode || 0);
  }
});
