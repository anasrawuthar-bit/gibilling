const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity-ide\\brain\\59e13e0d-d816-4f77-9329-31e8ac922a2b";

app.whenReady().then(async () => {
  let win;
  try {
    await database.initDatabase(app.getPath("userData"));
    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
    ipcMain.handle("db:update-business-settings", (_event, s) => database.updateBusinessSettings(s));

    win = new BrowserWindow({
      show: true,
      width: 1280,
      height: 850,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 600));

    await win.webContents.executeJavaScript(`
      (async () => {
        const btn = document.querySelector(".open-company-button");
        if (btn) await openCompany(btn.dataset.company || "testt");
        await new Promise((r) => setTimeout(r, 1000));
        showView("appSettings");
      })()
    `);
    await new Promise((r) => setTimeout(r, 800));

    const tabs = [
      { id: "COMPANY", filename: "settings_company_page.png" },
      { id: "INVOICING", filename: "settings_invoicing_page.png" },
      { id: "PRINTING", filename: "settings_printing_page.png" },
      { id: "TAX_INVENTORY", filename: "settings_tax_inventory_page.png" },
      { id: "CUSTOM_FIELDS", filename: "settings_custom_fields_page.png" },
    ];

    for (const tab of tabs) {
      await win.webContents.executeJavaScript(`
        (() => {
          const btn = document.querySelector('[data-settings-tab="${tab.id}"]');
          if (btn) btn.click();
        })()
      `);
      await new Promise((r) => setTimeout(r, 400));

      const img = await win.webContents.capturePage();
      const targetFile = path.join(artifactDir, tab.filename);
      fs.writeFileSync(targetFile, img.toPNG());
      console.log(`Captured ${tab.filename} (${fs.statSync(targetFile).size} bytes)`);
    }

    console.log("All 5 settings tabs captured successfully!");
  } catch (err) {
    console.error("Capture error:", err);
  } finally {
    if (win) win.close();
    app.quit();
  }
});
