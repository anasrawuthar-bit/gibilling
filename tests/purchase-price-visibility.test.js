const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-purchase-price-test-"));
app.setPath("userData", testRoot);

app.whenReady().then(async () => {
  let win;
  try {
    await database.initDatabase(testRoot);

    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
    ipcMain.handle("db:get-last-active-company", () => database.getLastActiveCompany());

    win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 800,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 600));

    const results = await win.webContents.executeJavaScript(`
      (async () => {
        const logs = [];
        const assertLog = (cond, msg) => {
          if (!cond) throw new Error(msg);
          logs.push("PASS: " + msg);
        };

        try {
          const testItem = {
            id: 991,
            name: "Industrial Steel Rod",
            salePrice: 750,
            purchasePrice: 500,
            currentStock: 45,
            unit: "Mtr",
            category: "Hardware",
            sku: "SR-991"
          };
          state.items = [testItem];

          // Test 1: itemLookupButton in Sale editor includes Sale Price and Purchase Cost Price
          currentView = "saleEditor";
          activeTransactionEditorType = "sale";
          const saleMarkup = itemLookupButton(testItem);
          assertLog(saleMarkup.includes("item-picker-price-stack"), "Markup includes item-picker-price-stack");
          assertLog(saleMarkup.includes("Sale:"), "Markup displays 'Sale:' label in Sale editor");
          assertLog(saleMarkup.includes("Cost:"), "Markup displays 'Cost:' label in Sale editor");
          assertLog(saleMarkup.includes("item-primary-price"), "Markup has primary price class");
          assertLog(saleMarkup.includes("item-secondary-price"), "Markup has secondary price class");

          // Test 2: itemLookupButton in Purchase editor switches primary emphasis to Pur / Cost
          currentView = "purchaseEditor";
          activeTransactionEditorType = "purchase";
          const purchaseMarkup = itemLookupButton(testItem);
          assertLog(purchaseMarkup.includes("Pur:"), "Markup displays 'Pur:' label in Purchase editor");
          assertLog(purchaseMarkup.includes("Sale:"), "Markup displays 'Sale:' label in Purchase editor");

          // Test 3: Transaction Editor in Sale mode has 'Purchase Cost' table header
          currentView = "saleEditor";
          activeTransactionEditorType = "sale";
          const editorHtml = transactionEditorTemplate();
          assertLog(editorHtml.includes("Purchase Cost</th>"), "Transaction editor table header includes 'Purchase Cost'");
          assertLog(editorHtml.includes("row-purchase-price"), "Transaction editor rows include 'row-purchase-price'");

          // Test 4: Transaction Editor in Purchase mode does NOT have redundant 'Purchase Cost' column
          currentView = "purchaseEditor";
          activeTransactionEditorType = "purchase";
          const purchaseEditorHtml = transactionEditorTemplate();
          assertLog(!purchaseEditorHtml.includes("Purchase Cost</th>"), "Purchase editor omits redundant Purchase Cost column");

          // Test 5: itemListButton includes price chips for both Sale and Purchase Cost
          const btnHtml = itemListButton(testItem, 991);
          assertLog(btnHtml.includes("item-list-prices-row"), "Item card has item-list-prices-row");
          assertLog(btnHtml.includes("item-chip-sale"), "Item card has item-chip-sale badge");
          assertLog(btnHtml.includes("item-chip-pur"), "Item card has item-chip-pur badge");
          assertLog(btnHtml.includes("Sale:"), "Item card displays 'Sale:' label");
          assertLog(btnHtml.includes("Cost:"), "Item card displays 'Cost:' label");

          return { success: true, logs };
        } catch (err) {
          return { success: false, error: err.message, stack: err.stack, logs };
        }
      })()
    `);

    console.log("=== PURCHASE PRICE VISIBILITY TEST RESULTS ===");
    if (results.logs) {
      results.logs.forEach((l) => console.log(l));
    }
    if (!results.success) {
      console.error("FAIL:", results.error);
      console.error(results.stack);
      app.exit(1);
    } else {
      console.log("ALL 5 TESTS PASSED (100%)!");
      app.exit(0);
    }
  } catch (err) {
    console.error("Test execution failed:", err);
    app.exit(1);
  }
});
