const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-test-views-"));

async function testViews() {
  await database.initDatabase(testRoot);

  const win = new BrowserWindow({
    show: false,
    width: 1366,
    height: 768,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      console.error(`[CONSOLE ERROR] ${message} (${sourceId}:${line})`);
    }
  });

  await win.loadFile(path.join(__dirname, "..", "index.html"));
  await new Promise((r) => setTimeout(r, 800));

  await win.webContents.executeJavaScript(`document.querySelector(".open-company-button")?.click(); undefined`);
  await new Promise((r) => setTimeout(r, 600));

  const views = [
    "home",
    "parties",
    "items",
    "sales",
    "estimate",
    "paymentIn",
    "saleReturn",
    "purchases",
    "paymentOut",
    "expenses",
    "purchaseReturn",
    "gst",
    "gstr1",
    "cash",
    "reports",
    "grow",
    "setupBusiness",
    "importItems",
    "exportItems",
    "verifyData",
    "barcodeGenerator",
    "appSettings",
    "sync"
  ];

  for (const v of views) {
    try {
      const result = await win.webContents.executeJavaScript(`
        try {
          showView("${v}");
          const h1 = document.querySelector(".app-page-header h1, .report-hero h1, .feature-titlebar h1, h1")?.textContent || "";
          ({ success: true, h1 });
        } catch(e) {
          ({ success: false, error: e.stack || e.message });
        }
      `);
      if (result.success) {
        console.log(`✓ View "${v}" rendered successfully: [${result.h1.trim()}]`);
      } else {
        console.error(`✗ View "${v}" FAILED:`, result.error);
      }
    } catch (e) {
      console.error(`✗ View "${v}" IPC FAILED:`, e.message);
    }
  }

  try { fs.rmSync(testRoot, { recursive: true, force: true }); } catch (_) {}
  app.quit();
}

app.whenReady().then(testViews);
