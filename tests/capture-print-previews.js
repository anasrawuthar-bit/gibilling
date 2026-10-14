const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-print-capture-"));
app.setPath("userData", testRoot);

const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity-ide\\brain\\59e13e0d-d816-4f77-9329-31e8ac922a2b";

app.whenReady().then(async () => {
  let win;
  try {
    await database.initDatabase(testRoot);

    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
    ipcMain.handle("db:update-business-settings", (_event, settings) => database.updateBusinessSettings(settings));
    ipcMain.handle("db:get-info", () => ({ type: "SQLite", path: database.getDatabasePath() }));

    win = new BrowserWindow({
      show: true,
      width: 1366,
      height: 900,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 800));

    // Open company
    await win.webContents.executeJavaScript(`
      (async () => {
        const btn = document.querySelector(".open-company-button");
        const companyName = btn?.dataset?.company || "testt";
        if (typeof openCompany === "function") {
          await openCompany(companyName);
        }
      })()
    `);
    await new Promise((r) => setTimeout(r, 1000));

    // 1. Capture Print Settings page
    await win.webContents.executeJavaScript(`
      showView("appSettings", "PRINTING");
    `);
    await new Promise((r) => setTimeout(r, 800));

    const img1 = await win.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "print_settings_page.png"), img1.toPNG());
    console.log("✓ Saved print_settings_page.png");

    // 2. Open Invoice Preview Modal in Thermal Retail
    await win.webContents.executeJavaScript(`
      const sample = sampleInvoicePreviewData();
      openInvoicePreviewModal(sample, { printerType: "thermal", thermalTemplate: "retail", thermalWidth: "80mm" });
    `);
    await new Promise((r) => setTimeout(r, 800));

    const img4 = await win.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "invoice_preview_thermal_retail.png"), img4.toPNG());
    console.log("✓ Saved invoice_preview_thermal_retail.png");

    win.close();
    app.quit();
    process.exit(0);
  } catch (err) {
    console.error("Capture failed:", err);
    if (win) win.close();
    app.quit();
    process.exit(1);
  }
});
