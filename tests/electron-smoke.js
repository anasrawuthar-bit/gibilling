const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-billing-electron-smoke-"));

app.setPath("userData", testRoot);

app.whenReady().then(async () => {
  const rendererErrors = [];

  try {
    await database.initDatabase(testRoot);
    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));

    const window = new BrowserWindow({
      width: 1400,
      height: 900,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    window.webContents.on("console-message", (_event, level, message) => {
      if (level >= 2) rendererErrors.push(message);
    });
    window.webContents.on("render-process-gone", (_event, details) => {
      rendererErrors.push(`Renderer exited: ${details.reason}`);
    });

    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((resolve) => setTimeout(resolve, 250));

    const initial = await window.webContents.executeJavaScript(`({
      companyVisible: !document.getElementById("companyScreen").classList.contains("hidden"),
      appHidden: document.getElementById("appShell").classList.contains("hidden"),
      activeCompany: document.getElementById("activeCompanyName").textContent,
      hasBridge: Boolean(window.giDB),
    })`);
    assert.equal(initial.companyVisible, false, "a valid active company should bypass Company Directory at startup");
    assert.equal(initial.appHidden, false, "workspace should open for the active company");
    assert.ok(initial.activeCompany, "the active company should be shown in the workspace");
    assert.equal(initial.hasBridge, true, "database preload bridge should be available");
    const dashboardActions = await window.webContents.executeJavaScript(`({
      sale: document.querySelectorAll('#homeView [data-home-action="sale"]').length,
      purchase: document.querySelectorAll('#homeView [data-home-action="purchase"]').length,
      queueSale: document.querySelectorAll('.right-panel [data-home-action="sale"]').length,
      queuePurchase: document.querySelectorAll('.right-panel [data-home-action="purchase"]').length,
    })`);
    assert.equal(dashboardActions.sale, 1, "dashboard should have one Sale action");
    assert.equal(dashboardActions.purchase, 1, "dashboard should have one Purchase action");
    assert.equal(dashboardActions.queueSale, 0, "Work Queue should not duplicate Sale");
    assert.equal(dashboardActions.queuePurchase, 0, "Work Queue should not duplicate Purchase");

    await window.webContents.executeJavaScript('window.dispatchEvent(new Event("gi-change-company"))');
    await new Promise((resolve) => setTimeout(resolve, 100));
    const directory = await window.webContents.executeJavaScript(`({
      visible: !document.getElementById("companyScreen").classList.contains("hidden"),
      count: document.querySelectorAll(".company-row").length,
    })`);
    assert.equal(directory.visible, true, "Switch Company should open Company Directory");
    assert.ok(directory.count > 0, "Company Directory should retain available companies");
    await window.webContents.executeJavaScript('document.getElementById("companySearchInput").value = "missing"; document.getElementById("companySearchInput").dispatchEvent(new Event("input", { bubbles: true }))');
    const emptySearchVisible = await window.webContents.executeJavaScript('Boolean(document.querySelector(".company-list-empty"))');
    assert.equal(emptySearchVisible, true, "company search should render an empty state");

    await window.webContents.executeJavaScript('document.getElementById("companySearchInput").value = ""; document.getElementById("companySearchInput").dispatchEvent(new Event("input", { bubbles: true })); document.querySelector(".open-company-button").click()');
    await new Promise((resolve) => setTimeout(resolve, 250));
    const workspaceVisible = await window.webContents.executeJavaScript('!document.getElementById("appShell").classList.contains("hidden")');
    assert.equal(workspaceVisible, true, "Open should enter the selected company workspace");

    const invoiceChecks = await window.webContents.executeJavaScript(`(() => {
      const saved = { id: 'preview-check', type: 'sale', party: 'Cash', partyId: null,
        invoiceNo: 'INV-CHECK-1', total: 10.25, received: 10.25, paymentType: 'cash',
        partyGstin: 'SAVED-GST', meta: { roundOff: false }, placeOfSupply: 'Karnataka' };
      const draft = invoiceDraftFromRecord(saved);
      openTransactionEditor('sale', { draft, skipDirtyCheck: true });
      const preview = invoicePreviewDataFromRecord(saved);
      return { party: draft.party, roundOff: document.querySelector('#roundOffToggle').checked,
        number: preview.invoiceNo, total: preview.total, gstin: preview.party.gstin,
        markup: invoicePreviewMarkup(preview).includes('INV-CHECK-1') };
    })()`);
    assert.equal(invoiceChecks.party, '', 'walk-in invoice must reopen without a required master customer');
    assert.equal(invoiceChecks.roundOff, false, 'saved rounding choice must survive reopening');
    assert.equal(invoiceChecks.number, 'INV-CHECK-1');
    assert.equal(invoiceChecks.total, 10.25);
    assert.equal(invoiceChecks.gstin, 'SAVED-GST');
    assert.ok(invoiceChecks.markup, 'print markup must contain the saved number');
    for (const width of [1280, 1366]) {
      window.setSize(width, 768);
      const layout = await window.webContents.executeJavaScript(`(() => {
        const form = document.querySelector('.transaction-editor-form');
        form.scrollTop = form.scrollHeight;
        const actions = document.querySelector('.transaction-editor-actions').getBoundingClientRect();
        const box = form.getBoundingClientRect();
        const table = document.querySelector('.editor-table-wrap');
        return { reachable: actions.bottom <= box.bottom + 2,
          fits: table.scrollWidth <= table.clientWidth + 2 };
      })()`);
      assert.ok(layout.reachable, 'sale actions must be reachable at ' + width);
      assert.ok(layout.fits, 'sale table must fit at ' + width);
    }

    await window.webContents.executeJavaScript(`openTransactionEditor('purchase', { skipDirtyCheck: true })`);
    const purchaseLayout = await window.webContents.executeJavaScript(`(() => {
      const form = document.querySelector('.transaction-editor-form');
      form.scrollTop = form.scrollHeight;
      const actions = document.querySelector('.transaction-editor-actions').getBoundingClientRect();
      const box = form.getBoundingClientRect();
      const subtotal = document.querySelector('#editorSubtotal').getBoundingClientRect();
      const discount = document.querySelector('#editorDiscountTotal').getBoundingClientRect();
      return {
        reachable: actions.bottom <= box.bottom + 2,
        noOverlap: subtotal.right <= discount.left + 5
      };
    })()`);
    assert.ok(purchaseLayout.reachable, 'purchase actions must be reachable');
    assert.ok(purchaseLayout.noOverlap, 'purchase subtotal and discount must not overlap');

    for (const type of ['sale', 'purchase']) {
      window.setSize(1280, 768);
      await window.webContents.executeJavaScript(`openTransactionEditor('${type}', { skipDirtyCheck: true })`);
      const compact = await window.webContents.executeJavaScript(`(() => {
        const table = document.querySelector('.editor-table').getBoundingClientRect();
        const summary = document.querySelector('.editor-bottom-grid').getBoundingClientRect();
        document.querySelector('[data-payment-mode="credit"]').click();
        const credit = document.querySelector('#editorPaymentType').value;
        document.querySelector('[data-payment-mode="cash"]').click();
        return { gap: summary.top - table.bottom, credit,
          paid: document.querySelector('#editorPaymentType').value };
      })()`);
      assert.ok(compact.gap < 40, 'summary must follow the last item');
      assert.equal(compact.credit, 'credit');
      assert.equal(compact.paid, 'cash');
      const picker = await window.webContents.executeJavaScript(`(() => {
        state.items = [{ id: 90001, name: 'Keyboard', itemType: 'product', unit: 'Pcs', currentStock: 4, salePrice: 500, purchasePrice: 300 }];
        const input = document.querySelector('#transactionRows [name="item"]');
        input.value = 'Key';
        renderItemLookupPanel(input);
        const panel = document.querySelector('.editor-item-lookup');
        const width = panel.getBoundingClientRect().width;
        const columnWidth = input.closest('td').getBoundingClientRect().width;
        const priceVisible = panel.textContent.includes('${type === 'purchase' ? '300' : '500'}');
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        return { width, columnWidth, priceVisible, selected: input.dataset.selectedItemId, closed: panel.classList.contains('hidden') };
      })()`);
      assert.ok(Math.abs(picker.width - picker.columnWidth) < 2, 'item picker must match the item column: ' + JSON.stringify(picker));
      assert.ok(picker.priceVisible, 'picker must show the relevant transaction price');
      assert.equal(picker.selected, '90001', 'keyboard selection must select the item');
      assert.ok(picker.closed, 'selection must close the picker');
      if (type === 'purchase') {
        const rates = await window.webContents.executeJavaScript(`(() => {
          state.invoices = [{ id: 'old-purchase', type: 'purchase', status: 'due', date: '2026-09-01', party: 'Supplier', invoiceNo: 'PB-1' }];
          state.invoiceItems = [{ id: 1, invoiceId: 'old-purchase', itemId: 90001, unit: 'Pcs', price: 550 }];
          const row = document.querySelector('#transactionRows tr');
          delete row.dataset.smartItem;
          applyEditorItemIntelligence(row);
          const price = row.querySelector('[name="price"]');
          const suggested = Number(price.value);
          price.value = '575';
          applyEditorItemIntelligence(row, true);
          const preserved = Number(price.value);
          state.items = [{ id: 90001, itemType: 'product', openingStock: 0, currentStock: 20, purchasePrice: 600 }];
          state.stockMovements = [{ itemId: 90001, movementType: 'in', quantity: 10, rate: 500 }, { itemId: 90001, movementType: 'in', quantity: 10, rate: 550 }];
          return { suggested, preserved, history: row.querySelector('.purchase-price-history').textContent,
            valuation: calculateInventoryValuation().closingStockValue };
        })()`);
        assert.equal(rates.suggested, 550);
        assert.equal(rates.preserved, 575);
        assert.ok(rates.history.includes('Supplier'));
        assert.equal(rates.valuation, 10500, 'weighted value must use actual receipt rates, not default price');
      }
      const screenshotPath = path.join(os.tmpdir(), 'gi-' + type + '-layout.png');
      fs.writeFileSync(screenshotPath, (await window.webContents.capturePage()).toPNG());
      console.log('Layout screenshot:', screenshotPath);

      const longInvoice = await window.webContents.executeJavaScript(`(() => {
        for (let i = 0; i < 20; i++) document.querySelector('#addEditorRow').click();
        document.querySelector('.editor-more-details').open = true;
        const form = document.querySelector('.transaction-editor-form');
        form.scrollTop = form.scrollHeight;
        const balance = document.querySelector('#editorBalance').getBoundingClientRect();
        const footer = document.querySelector('.transaction-editor-actions').getBoundingClientRect();
        const rows = document.querySelectorAll('#transactionRows tr');
        const input = rows[rows.length - 1].querySelector('[name="item"]');
        input.scrollIntoView({ block: 'center' });
        const panel = input.parentElement.querySelector('.editor-item-lookup');
        panel.innerHTML = '<button type="button">Test item</button>';
        panel.classList.remove('hidden');
        positionFloatingItemLookup(input, panel);
        const popup = panel.getBoundingClientRect();
        return { balanceClear: balance.bottom <= footer.top,
          popupFits: popup.top >= 0 && popup.bottom <= innerHeight,
          rowCount: rows.length };
      })()`);
      assert.ok(longInvoice.balanceClear, 'last totals must clear action bar');
      assert.ok(longInvoice.popupFits, 'item dropdown must remain in viewport');
      assert.equal(longInvoice.rowCount, 21);
      const resizing = await window.webContents.executeJavaScript(`(() => {
        const handle = document.querySelectorAll('.editor-column-resizer')[1];
        const header = handle.parentElement;
        const before = header.getBoundingClientRect().width;
        handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        const after = header.getBoundingClientRect().width;
        const saved = JSON.parse(localStorage.getItem('gi-editor-column-widths-v1'));
        handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        return { before, after, saved: saved[1], reset: localStorage.getItem('gi-editor-column-widths-v1') === null };
      })()`);
      assert.ok(resizing.after > resizing.before, 'column resize must change width');
      assert.ok(Math.abs(resizing.saved - resizing.after) < 2, 'resized width must persist');
      assert.ok(resizing.reset, 'double-click must reset widths');
    }

    await window.webContents.executeJavaScript(`openInvoicePreviewModal(invoicePreviewDataFromRecord({
      id: 'pdf-check', type: 'sale', party: 'Cash', invoiceNo: 'INV-PDF-CHECK', total: 10.25,
      subtotal: 10.25, received: 10.25, date: '2026-09-17', item: 'PDF test item'
    }))`);
    const pdf = await window.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-', 'invoice preview must export a PDF');
    assert.ok(pdf.length > 1000, 'PDF output should contain rendered content');

    assert.deepEqual(rendererErrors, [], `renderer errors: ${rendererErrors.join(" | ")}`);
    console.log("Electron startup smoke test passed.");
    window.destroy();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    try { fs.rmSync(testRoot, { recursive: true, force: true }); } catch { /* Windows may still hold the DB briefly. */ }
    app.exit(process.exitCode || 0);
  }
});
