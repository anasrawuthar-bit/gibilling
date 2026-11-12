const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-version-disp-test-"));
app.setPath("userData", testRoot);

app.whenReady().then(async () => {
  const rendererErrors = [];

  try {
    await database.initDatabase(testRoot);
    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
    ipcMain.handle("db:preview-next-invoice-number", (_event, type, docDate) => database.previewNextInvoiceNumber(type, docDate));
    ipcMain.handle("whatsapp:get-status", () => ({ ready: false, authenticated: false }));
    ipcMain.handle("cloud:check-health", () => ({ reachable: false }));
    ipcMain.handle("secure-store:is-available", () => ({ available: false, platform: process.platform }));
    ipcMain.handle("secure-store:get-credentials", () => ({ ok: true, hasCredentials: false }));
    ipcMain.handle("secure-store:save-credentials", () => ({ ok: true }));
    ipcMain.handle("secure-store:clear-credentials", () => ({ ok: true }));
    ipcMain.handle("secure-store:migrate-from-local-storage", () => ({ ok: true, migrated: false }));
    ipcMain.handle("app:get-version", () => "1.1.2");

    const window = new BrowserWindow({
      width: 1400,
      height: 900,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    window.webContents.on("console-message", (_event, level, message) => {
      if (level >= 2) rendererErrors.push(message);
    });

    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await window.webContents.executeJavaScript(`
      localStorage.setItem('zynbill_device_activated', 'true');
      localStorage.setItem('zynbill_license_cache', JSON.stringify({
        token: 'smoke_test_token',
        email: 'smoke@zynbill.com',
        plan: 'Professional',
        status: 'active'
      }));
      window.dispatchEvent(new Event('gi-account-activated'));
    `);
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Verify version badge on Home / App Shell
    const check1 = await window.webContents.executeJavaScript(`
      (async () => {
        const badge = document.querySelector(".app-version-badge");
        return {
          badgeFound: Boolean(badge),
          badgeText: badge ? badge.textContent.trim() : null
        };
      })()
    `);

    console.log("CHECK 1 (Home sidebar version badge):", check1);
    assert.strictEqual(check1.badgeText, "v1.1.2", "Sidebar version badge must display v1.1.2");

    // Verify after switching view or opening settings
    const check2 = await window.webContents.executeJavaScript(`
      (async () => {
        showView("appSettings", "ABOUT");
        await new Promise(r => setTimeout(r, 200));

        const badgeInSidebar = document.querySelector(".app-version-badge")?.textContent?.trim();
        const settingsHtml = elements.featureView?.innerHTML || "";
        const hasV112 = settingsHtml.includes("v1.1.2") || settingsHtml.includes("1.1.2");
        const hasOldV110 = settingsHtml.includes("v1.1.0") || settingsHtml.includes("1.1.0");

        return {
          badgeInSidebar,
          hasV112,
          hasOldV110
        };
      })()
    `);

    console.log("CHECK 2 (Settings Updates view version):", check2);
    assert.strictEqual(check2.badgeInSidebar, "v1.1.2");
    assert.strictEqual(check2.hasV112, true, "Settings must show v1.1.2");
    assert.strictEqual(check2.hasOldV110, false, "Settings must NOT show old v1.1.0");

    assert.strictEqual(rendererErrors.length, 0, `Expected 0 renderer errors, but got: ${rendererErrors.join(", ")}`);
    console.log("\nALL VERSION DISPLAY CHECKS PASSED WITH 0 ERRORS!");

    window.close();
    app.quit();
  } catch (err) {
    console.error("Test failed:", err);
    process.exitCode = 1;
    app.quit();
  }
});
