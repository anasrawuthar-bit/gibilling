const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-pur-vis-capture-"));
app.setPath("userData", testRoot);

const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity-ide\\brain\\59e13e0d-d816-4f77-9329-31e8ac922a2b";

app.whenReady().then(async () => {
  let window;
  try {
    await database.initDatabase(testRoot);

    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
    ipcMain.handle("db:create-item", (_event, item) => database.createItem(item));
    ipcMain.handle("db:get-last-active-company", () => database.getLastActiveCompany());

    window = new BrowserWindow({
      show: true,
      width: 1360,
      height: 860,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 600));

    // Open active company
    await window.webContents.executeJavaScript(`
      (async () => {
        const btn = document.querySelector(".open-company-button");
        const companyName = btn?.dataset?.company || "testt";
        await openCompany(companyName);
      })()
    `);
    await new Promise((r) => setTimeout(r, 1200));

    // Ensure sample items with sale and purchase prices exist
    await window.webContents.executeJavaScript(`
      (async () => {
        if (!state.items || state.items.length < 2) {
          state.items = [
            { id: 1, name: "Dell OptiPlex Desktop", salePrice: 45000, purchasePrice: 38000, currentStock: 15, unit: "Pcs", category: "Electronics", sku: "DELL-OPT-01" },
            { id: 2, name: "Logitech MX Master 3S Mouse", salePrice: 8500, purchasePrice: 6200, currentStock: 30, unit: "Pcs", category: "Accessories", sku: "LOGI-MX3S" },
            { id: 3, name: "Cat6 Ethernet Cable (305m)", salePrice: 9200, purchasePrice: 6800, currentStock: 8, unit: "Box", category: "Networking", sku: "CAT6-305M" }
          ];
        }
      })()
    `);

    // 1. Capture Items List with Dual Prices
    await window.webContents.executeJavaScript(`
      (() => {
        showView("items");
      })()
    `);
    await new Promise((r) => setTimeout(r, 800));

    const itemsImg = await window.webContents.capturePage();
    const itemsPath = path.join(artifactDir, "items_list_purchase_price_visibility.png");
    fs.writeFileSync(itemsPath, itemsImg.toPNG());
    console.log("Saved items view screenshot:", itemsPath);

    // 2. Open Sale Editor, type in item search to reveal dropdown with Sale & Cost prices, and select item
    await window.webContents.executeJavaScript(`
      (() => {
        openTransactionEditor("sale");
      })()
    `);
    await new Promise((r) => setTimeout(r, 800));

    await window.webContents.executeJavaScript(`
      (() => {
        const itemInput = document.querySelector('.transaction-editor input[name="item"]');
        if (itemInput) {
          itemInput.focus();
          itemInput.value = "Logi";
          itemInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
      })()
    `);
    await new Promise((r) => setTimeout(r, 800));

    const lookupImg = await window.webContents.capturePage();
    const lookupPath = path.join(artifactDir, "sale_editor_item_lookup_dual_prices.png");
    fs.writeFileSync(lookupPath, lookupImg.toPNG());
    console.log("Saved item lookup dropdown screenshot:", lookupPath);

    // 3. Click the item in lookup to populate the table row and verify Purchase Cost column
    await window.webContents.executeJavaScript(`
      (() => {
        const button = document.querySelector('.editor-item-lookup .lookup-result-button');
        if (button) {
          button.click();
        }
      })()
    `);
    await new Promise((r) => setTimeout(r, 600));

    const rowImg = await window.webContents.capturePage();
    const rowPath = path.join(artifactDir, "sale_editor_purchase_cost_row.png");
    fs.writeFileSync(rowPath, rowImg.toPNG());
    console.log("Saved sale editor row screenshot:", rowPath);

    app.exit(0);
  } catch (err) {
    console.error("Capture failed:", err);
    app.exit(1);
  }
});
