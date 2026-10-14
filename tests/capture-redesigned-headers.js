const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-redesigned-header-"));
app.setPath("userData", testRoot);

const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity-ide/brain/59e13e0d-d816-4f77-9329-31e8ac922a2b";

app.whenReady().then(async () => {
  let window;
  try {
    await database.initDatabase(testRoot);

    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));

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

    // Open company "gi hostings"
    await window.webContents.executeJavaScript(`
      (async () => {
        const btn = document.querySelector(".open-company-button");
        const companyName = btn?.dataset?.company || "gi hostings";
        await openCompany(companyName);
      })()
    `);
    await new Promise((r) => setTimeout(r, 1200));

    // 1. Switch to Cash & Bank
    await window.webContents.executeJavaScript(`
      (() => {
        showView("cash");
      })()
    `);
    await new Promise((r) => setTimeout(r, 800));

    const cashImg = await window.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "cash_bank_redesigned_header.png"), cashImg.toPNG());
    console.log("Captured cash_bank_redesigned_header.png");

    // 2. Switch to Reports
    await window.webContents.executeJavaScript(`
      (() => {
        showView("reports");
        elements.featureView.innerHTML = reportsTemplate("stock");
        bindFeatureActions();
      })()
    `);
    await new Promise((r) => setTimeout(r, 800));

    const reportsImg = await window.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "reports_redesigned_header.png"), reportsImg.toPNG());
    console.log("Captured reports_redesigned_header.png");

  } catch (err) {
    console.error("Capture error:", err);
  } finally {
    if (window && !window.isDestroyed()) window.destroy();
    app.quit();
  }
});
