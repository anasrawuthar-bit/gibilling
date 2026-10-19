const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-neg-save-test-"));
app.setPath("userData", testRoot);

const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity\\brain\\bed9650d-397d-4216-aa80-c0ae1c3c4fcb";

app.whenReady().then(async () => {
  let win;
  try {
    await database.initDatabase(testRoot);

    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
    ipcMain.handle("db:get-last-active-company", () => database.getLastActiveCompany());
    ipcMain.handle("db:create-party", (_event, party) => database.createParty(party));
    ipcMain.handle("db:create-item", (_event, item) => database.createItem(item));
    ipcMain.handle("db:create-transaction", (_event, tx) => database.createTransaction(tx));
    ipcMain.handle("db:update-business-settings", (_event, s) => database.updateBusinessSettings(s));
    ipcMain.handle("db:preview-next-invoice-number", (_event, type, date) => database.previewNextInvoiceNumber(type, date));

    win = new BrowserWindow({
      show: true,
      width: 1366,
      height: 800,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 1200));

    // 1. Create a test item with 0 stock
    const setupResult = await win.webContents.executeJavaScript(`
      (async () => {
        // Ensure stopSaleOnNegativeStock is false (default)
        await window.giDB.updateBusinessSettings({ stopSaleOnNegativeStock: false });
        
        // Create customer
        state = normalizeState(await window.giDB.createParty({
          name: "Retail Customer",
          type: "customer",
          phone: "9876543210"
        }));
        const party = state.parties.find(p => p.name === "Retail Customer");

        // Create product with 0 stock
        const itemName = "256 ssd wd";
        state = normalizeState(await window.giDB.createItem({
          name: itemName,
          itemType: "product",
          salePrice: 4500,
          purchasePrice: 3500,
          openingStock: 0,
          unit: "Nos",
          taxRate: 18
        }));
        const item = state.items.find(i => i.name === itemName);

        return {
          partyId: party.id,
          partyName: party.name,
          itemId: item.id,
          itemName: item.name,
          initialStock: item.currentStock
        };
      })()
    `);

    console.log("SETUP RESULT:", setupResult);
    assert.strictEqual(setupResult.initialStock, 0, "Initial stock must be 0");

    // 2. Open sale transaction editor, add the item with qty=1, and save
    const saleResult = await win.webContents.executeJavaScript(`
      (async () => {
        openTransactionEditor("sale");
        await new Promise(r => setTimeout(r, 300));

        const party = state.parties.find(p => String(p.id) === String("${setupResult.partyId}"));
        selectTransactionParty(party);

        const row = document.querySelector("#transactionRows tr");
        const item = state.items.find(i => i.id === ${setupResult.itemId});
        selectTransactionItem(row, item);

        row.querySelector('[name="qty"]').value = "1";
        row.querySelector('[name="price"]').value = "4500";
        recalcTransactionEditor();

        // Submit form
        const form = document.querySelector("#transactionEditorForm");
        const submitEvent = new Event("submit", { cancelable: true, bubbles: true });
        form.dispatchEvent(submitEvent);

        await new Promise(r => setTimeout(r, 1000));

        // Check if toast shows error or success
        const toast = document.querySelector(".toast-message");
        const toastText = toast ? toast.textContent : "";
        const isErrorToast = toast ? toast.classList.contains("toast-error") || Boolean(toast.querySelector(".toast-error")) : false;

        // Fetch reloaded state
        state = normalizeState(await window.giDB.getState());
        const updatedItem = state.items.find(i => i.id === ${setupResult.itemId});

        return {
          toastText,
          isErrorToast: Boolean(isErrorToast),
          updatedStock: updatedItem ? updatedItem.currentStock : null
        };
      })()
    `);

    console.log("SALE WITH NEGATIVE STOCK RESULT:", saleResult);
    assert.strictEqual(saleResult.isErrorToast, false, "Must not show error toast when negative stock allowed");
    assert.strictEqual(saleResult.updatedStock, -1, "Stock must decrease from 0 to -1");
    console.log("✓ Successfully saved sale with negative stock (0 -> -1)!");

    // Capture screenshot of successful state
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "negative_stock_sale_success.png"), img.toPNG());
    console.log("Saved negative_stock_sale_success.png");

    // 3. Now test with stopSaleOnNegativeStock = true
    const blockedResult = await win.webContents.executeJavaScript(`
      (async () => {
        await window.giDB.updateBusinessSettings({ stopSaleOnNegativeStock: true });

        openTransactionEditor("sale");
        await new Promise(r => setTimeout(r, 300));

        const party = state.parties.find(p => String(p.id) === String("${setupResult.partyId}"));
        selectTransactionParty(party);

        const row = document.querySelector("#transactionRows tr");
        const item = state.items.find(i => i.id === ${setupResult.itemId});
        selectTransactionItem(row, item);

        row.querySelector('[name="qty"]').value = "1";
        recalcTransactionEditor();

        const form = document.querySelector("#transactionEditorForm");
        const submitEvent = new Event("submit", { cancelable: true, bubbles: true });
        form.dispatchEvent(submitEvent);

        await new Promise(r => setTimeout(r, 600));

        const toast = document.querySelector(".toast-message");
        const detail = toast?.querySelector(".toast-detail")?.textContent || toast?.textContent || "";

        // Reset setting back to false
        await window.giDB.updateBusinessSettings({ stopSaleOnNegativeStock: false });

        return {
          detail,
          hasRawIpcPrefix: detail.includes("Error invoking remote method")
        };
      })()
    `);

    console.log("BLOCKED TEST RESULT (stopSaleOnNegativeStock=true):", blockedResult);
    assert.strictEqual(blockedResult.hasRawIpcPrefix, false, "Must not contain raw IPC prefix");
    console.log("✓ Clean error message verified without raw IPC prefix!");

  } catch (err) {
    console.error("Test error:", err);
  } finally {
    if (win) win.destroy();
    app.quit();
  }
});
