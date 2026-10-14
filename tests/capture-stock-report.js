const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-stock-report-capture-"));
app.setPath("userData", testRoot);

const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity-ide\\brain\\59e13e0d-d816-4f77-9329-31e8ac922a2b";

app.whenReady().then(async () => {
  let window;
  try {
    await database.initDatabase(testRoot);

    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
    ipcMain.handle("db:create-item", (_event, item) => database.createItem(item));

    window = new BrowserWindow({
      show: true,
      width: 1280,
      height: 800,
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

    // Add sample items with stock and categories
    await window.webContents.executeJavaScript(`
      (async () => {
        await window.giDB.createItem({
          name: "Sample Item",
          category: "Electronics",
          sku: "SKU001",
          hsnSac: "8471",
          unit: "Pcs",
          purchasePrice: 800,
          salePrice: 1000,
          taxRate: 18,
          openingStock: 100
        });
        await window.giDB.createItem({
          name: "Processor Intel i7",
          category: "Computer Accessories",
          sku: "CPU-I7",
          hsnSac: "8473",
          unit: "Pcs",
          purchasePrice: 22000,
          salePrice: 25000,
          taxRate: 18,
          openingStock: 10
        });
        await window.giDB.createItem({
          name: "Wireless Optical Mouse",
          category: "Computer Accessories",
          sku: "MOU-WL",
          hsnSac: "8471",
          unit: "Pcs",
          purchasePrice: 350,
          salePrice: 599,
          taxRate: 18,
          openingStock: 50
        });
        state = normalizeState(await window.giDB.getState());
        showView("reports");
        elements.featureView.innerHTML = reportsTemplate("stock");
        bindFeatureActions();
      })()
    `);
    await new Promise((r) => setTimeout(r, 1000));

    const img = await window.webContents.capturePage();
    const targetFile = path.join(artifactDir, "stock_summary_report_updated.png");
    fs.writeFileSync(targetFile, img.toPNG());
    console.log("Captured stock_summary_report_updated.png");

  } catch (err) {
    console.error("Capture error:", err);
  } finally {
    if (window && !window.isDestroyed()) window.destroy();
    app.quit();
  }
});
