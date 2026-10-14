const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-billing-snap-company-"));
app.setPath("userData", testRoot);

app.whenReady().then(async () => {
  await database.initDatabase(testRoot);
  ipcMain.handle("db:get-state", () => database.getState());
  ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));

  const win = new BrowserWindow({
    width: 1366,
    height: 768,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, "../index.html"));

  win.webContents.once("did-finish-load", async () => {
    try {
      await new Promise((r) => setTimeout(r, 800));

      // Open active company
      await win.webContents.executeJavaScript(`
        (async () => {
          const btn = document.querySelector(".open-company-button");
          const companyName = btn?.dataset?.company || "testt";
          if (btn) await openCompany(companyName);
        })()
      `);
      await new Promise((r) => setTimeout(r, 1000));

      // Click company-switch
      const info = await win.webContents.executeJavaScript(`
        (() => {
          const btn = document.querySelector(".company-switch");
          if (!btn) return "btn not found";
          btn.click();
          return {
            btnClasses: btn.className,
            heading: document.querySelector(".settings-page-header h2")?.textContent,
            activeTab: document.querySelector('[data-settings-tab="COMPANY"]')?.className
          };
        })()
      `);
      console.log("Navigation info:", JSON.stringify(info));

      await new Promise((r) => setTimeout(r, 800));

      const screenshot = await win.webContents.capturePage();
      const artifactDir = "C:/Users/ANAS/.gemini/antigravity-ide/brain/59e13e0d-d816-4f77-9329-31e8ac922a2b";
      const outPath = path.join(artifactDir, "company_switch_navigation.png");
      fs.writeFileSync(outPath, screenshot.toPNG());
      console.log("Screenshot written to:", outPath);
      app.exit(0);
    } catch (err) {
      console.error(err);
      app.exit(1);
    }
  });
});
