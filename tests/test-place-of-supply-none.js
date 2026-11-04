const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const database = require("../database");

const screenshotDir = path.join(
  "C:",
  "Users",
  "ANAS",
  ".gemini",
  "antigravity",
  "brain",
  "bed9650d-397d-4216-aa80-c0ae1c3c4fcb"
);
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-pos-none-test-"));
app.setPath("userData", testRoot);

app.whenReady().then(async () => {
  let win = null;
  try {
    await database.initDatabase(testRoot);

    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
    ipcMain.handle("db:create-party", (_event, party) => database.createParty(party));
    ipcMain.handle("db:update-party", (_event, party) => database.updateParty(party));
    ipcMain.handle("db:create-item", (_event, item) => database.createItem(item));
    ipcMain.handle("db:create-transaction", (_event, txn) => database.createTransaction(txn));
    ipcMain.handle("db:preview-next-invoice-number", (_event, type, date) => database.previewNextInvoiceNumber(type, date));

    win = new BrowserWindow({
      show: false,
      width: 1366,
      height: 768,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 1200));

    console.log("TEST 1: Opening Sale Transaction Editor and checking Place of Supply dropdown...");
    const salePosCheck = await win.webContents.executeJavaScript(`
      (() => {
        openTransactionEditor("sale");
        const select = document.querySelector('.sale-editor select[name="state"]');
        if (!select) return { found: false };
        const options = [...select.options].map(o => ({ value: o.value, text: o.textContent.trim() }));
        const firstOption = options[0];
        const hasNone = options.some(o => o.value === "" && o.text.toLowerCase() === "none");
        return {
          found: true,
          optionsCount: options.length,
          firstOption,
          hasNone,
          currentValue: select.value,
        };
      })()
    `);

    assert.strictEqual(salePosCheck.found, true, "Place of Supply select must exist in Sale editor");
    assert.strictEqual(salePosCheck.hasNone, true, "None option must exist in Place of Supply select");
    assert.strictEqual(salePosCheck.firstOption.value, "", "None option must have empty string value");
    assert.strictEqual(salePosCheck.firstOption.text, "None", "First option text must be None");
    console.log("✓ Verified: Place of Supply has None option with value ''");

    console.log("TEST 2: Selecting None in Place of Supply for a new Sale...");
    const selectNoneResult = await win.webContents.executeJavaScript(`
      (() => {
        const select = document.querySelector('.sale-editor select[name="state"]');
        select.value = "";
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return {
          selectedValue: select.value,
          selectedText: select.options[select.selectedIndex]?.textContent.trim(),
        };
      })()
    `);

    assert.strictEqual(selectNoneResult.selectedValue, "", "Selecting None must yield empty string value");
    assert.strictEqual(selectNoneResult.selectedText, "None", "Selected option label must be None");
    console.log("✓ Verified: None selected, value is empty");

    console.log("TEST 3: Creating and saving an invoice with Place of Supply = None...");
    const saveInvoiceResult = await win.webContents.executeJavaScript(`
      (async () => {
        let testCustomer = (state.parties || []).find(p => p.type === "customer" || !p.type);
        if (!testCustomer && window.giDB?.createParty) {
          state = normalizeState(await window.giDB.createParty({
            name: "POS None Test Customer",
            phone: "9876543210",
            type: "customer",
            taxType: "unregistered"
          }));
          testCustomer = (state.parties || []).find(p => p.name === "POS None Test Customer");
        }

        let testItem = (state.items || [])[0];
        if (!testItem && window.giDB?.createItem) {
          state = normalizeState(await window.giDB.createItem({
            name: "POS None Test Product",
            salePrice: 750,
            unit: "Pcs",
            taxRate: 18,
            taxType: "GST@18%"
          }));
          testItem = (state.items || []).find(i => i.name === "POS None Test Product");
        }

        const form = document.querySelector("#transactionEditorForm");
        if (testCustomer) {
          selectTransactionParty(testCustomer);
        }
        
        // Select item in first row
        const firstRow = document.querySelector("#transactionRows tr");
        if (firstRow && testItem) {
          selectTransactionItem(firstRow, testItem);
          const qtyInput = firstRow.querySelector('[name="qty"]');
          if (qtyInput) qtyInput.value = "2";
          recalcTransactionEditor();
        }

        // Explicitly choose Place of Supply as None
        const stateSelect = form.querySelector('select[name="state"]');
        stateSelect.value = "";
        stateSelect.dispatchEvent(new Event("change", { bubbles: true }));

        const invoiceNo = form.querySelector('[name="invoiceNo"]').value;

        // Submit form
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

        await new Promise(r => setTimeout(r, 1500));

        // Find saved invoice in state
        const savedInv = (state.invoices || []).find(inv => inv.invoiceNo === invoiceNo)
          || (state.transactions || []).find(t => t.invoiceNo === invoiceNo);
        
        return {
          saved: !!savedInv,
          invoiceNo,
          placeOfSupply: savedInv ? savedInv.placeOfSupply : null,
        };
      })()
    `);

    assert.strictEqual(saveInvoiceResult.saved, true, "Invoice should be saved");
    assert.strictEqual(saveInvoiceResult.placeOfSupply, "", "Saved invoice placeOfSupply must be empty string ''");
    console.log("✓ Verified: Saved invoice has placeOfSupply = ''");

    console.log("TEST 4: Inspecting Invoice Preview for None Place of Supply...");
    const previewResult = await win.webContents.executeJavaScript(`
      (() => {
        const inv = (state.invoices || []).find(t => t.invoiceNo === "${saveInvoiceResult.invoiceNo}")
          || state.transactions.find(t => t.invoiceNo === "${saveInvoiceResult.invoiceNo}");
        const previewData = invoicePreviewDataFromRecord(inv);
        openInvoicePreviewModal(previewData);
        
        const modal = document.querySelector("#invoicePreviewModal");
        const previewText = modal ? modal.textContent : "";
        const hasFallbackStateInPos = /Place of Supply[:\s]+(Kerala|Karnataka)/i.test(previewText);
        const placeOfSupplyText = previewData.placeOfSupply;

        return {
          placeOfSupplyInPreviewData: placeOfSupplyText,
          hasFallbackStateInPos,
        };
      })()
    `);

    assert.strictEqual(previewResult.placeOfSupplyInPreviewData, "", "Preview data placeOfSupply must be empty");
    assert.strictEqual(previewResult.hasFallbackStateInPos, false, "Preview modal must not contain Place of Supply state");
    console.log("✓ Verified: Invoice Preview does not render fallback state in Place of Supply");

    // Capture screenshot of Preview with None Place of Supply
    const previewPng = await win.webContents.capturePage();
    fs.writeFileSync(path.join(screenshotDir, "clean_place_of_supply_none_preview.png"), previewPng.toPNG());
    console.log("✓ Captured screenshot: clean_place_of_supply_none_preview.png");

    console.log("TEST 5: Editing the saved invoice and verifying Place of Supply remains None...");
    const editResult = await win.webContents.executeJavaScript(`
      (() => {
        document.querySelector("#closePreviewBtn")?.click();
        const inv = (state.invoices || []).find(t => t.invoiceNo === "${saveInvoiceResult.invoiceNo}")
          || state.transactions.find(t => t.invoiceNo === "${saveInvoiceResult.invoiceNo}");
        
        const draft = invoiceDraftFromRecord(inv);
        console.log("TEST5 inv.placeOfSupply:", JSON.stringify(inv.placeOfSupply));
        console.log("TEST5 draft.state:", JSON.stringify(draft.state));

        openTransactionEditor("sale", {
          editInvoiceId: inv.id || inv.invoiceId,
          draft,
        });

        const stateSelect = document.querySelector('.sale-editor select[name="state"]');
        console.log("TEST5 stateSelect.value after openTransactionEditor:", JSON.stringify(stateSelect ? stateSelect.value : null));
        return {
          invPlaceOfSupply: inv ? inv.placeOfSupply : undefined,
          draftState: draft ? draft.state : undefined,
          stateSelectValue: stateSelect ? stateSelect.value : null,
          selectedOptionText: stateSelect?.options[stateSelect.selectedIndex]?.textContent.trim(),
        };
      })()
    `);

    console.log("TEST 5 editResult:", editResult);

    assert.strictEqual(editResult.stateSelectValue, "", "When editing saved invoice, state select value must remain empty string");
    assert.strictEqual(editResult.selectedOptionText, "None", "Selected option text in editor must be None");
    console.log("✓ Verified: Editing saved invoice preserves None place of supply");

    // Capture screenshot of editor with None selected
    const editorPng = await win.webContents.capturePage();
    fs.writeFileSync(path.join(screenshotDir, "clean_place_of_supply_none_editor.png"), editorPng.toPNG());
    console.log("✓ Captured screenshot: clean_place_of_supply_none_editor.png");

    console.log("TEST 6: Checking Purchase Editor Place of Supply has None option...");
    const purchasePosCheck = await win.webContents.executeJavaScript(`
      (() => {
        openTransactionEditor("purchase", { newTab: true });
        const select = document.querySelector('.purchase-editor select[name="state"]');
        if (!select) return { found: false };
        const options = [...select.options].map(o => ({ value: o.value, text: o.textContent.trim() }));
        const hasNone = options.some(o => o.value === "" && o.text.toLowerCase() === "none");
        
        // Select None
        select.value = "";
        select.dispatchEvent(new Event("change", { bubbles: true }));

        return {
          found: true,
          hasNone,
          selectedValue: select.value,
          selectedText: select.options[select.selectedIndex]?.textContent.trim(),
        };
      })()
    `);

    assert.strictEqual(purchasePosCheck.found, true, "Purchase editor state select must exist");
    assert.strictEqual(purchasePosCheck.hasNone, true, "Purchase editor must have None option");
    assert.strictEqual(purchasePosCheck.selectedValue, "", "Selecting None in Purchase editor must yield empty string");
    assert.strictEqual(purchasePosCheck.selectedText, "None", "Purchase editor selected text must be None");
    console.log("✓ Verified: Purchase editor Place of Supply has None option and selects empty");

    // Capture screenshot of purchase editor
    const purchasePng = await win.webContents.capturePage();
    fs.writeFileSync(path.join(screenshotDir, "clean_purchase_place_of_supply_none.png"), purchasePng.toPNG());
    console.log("✓ Captured screenshot: clean_purchase_place_of_supply_none.png");

    console.log("\n=======================================================");
    console.log(" ALL PLACE OF SUPPLY 'NONE' TESTS PASSED SUCCESSFULLY! ");
    console.log("=======================================================");
  } catch (err) {
    console.error("Test failed with error:", err);
    process.exit(1);
  } finally {
    if (win && !win.isDestroyed()) win.close();
    app.quit();
  }
});
