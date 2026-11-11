const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const LEGACY_BACKUP = path.join(__dirname, "..", "gi-billing-production-backup.sqlite");
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "zynbill-electron-legacy-smoke-"));

// Copy legacy database to test userData
fs.copyFileSync(LEGACY_BACKUP, path.join(testRoot, "gi-billing.sqlite"));

app.setPath("userData", testRoot);

app.whenReady().then(async () => {
  const rendererErrors = [];

  try {
    console.log("▶ Initializing database in Electron process from legacy backup copy...");
    const state = await database.initDatabase(testRoot);
    console.log("✓ Database initialized successfully! Active company:", state.activeCompany);

    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
    ipcMain.handle("db:update-business-settings", (_event, s) => database.updateBusinessSettings(s));
    ipcMain.handle("db:preview-next-invoice-number", (_event, type, docDate) => database.previewNextInvoiceNumber(type, docDate));
    ipcMain.handle("whatsapp:get-status", () => ({ ready: false, authenticated: false }));
    ipcMain.handle("cloud:check-health", () => ({ reachable: false }));
    ipcMain.handle("secure-store:is-available", () => ({ available: false, platform: process.platform }));
    ipcMain.handle("secure-store:get-credentials", () => ({ ok: true, hasCredentials: false }));
    ipcMain.handle("secure-store:save-credentials", () => ({ ok: true }));
    ipcMain.handle("secure-store:clear-credentials", () => ({ ok: true }));
    ipcMain.handle("secure-store:migrate-from-local-storage", () => ({ ok: true, migrated: false }));

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
        token: 'legacy_smoke_token',
        email: 'qubixmart@gmail.com',
        plan: 'Professional',
        status: 'active'
      }));
      window.dispatchEvent(new Event('gi-account-activated'));
    `);
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Verify workspace opened
    const uiState = await window.webContents.executeJavaScript(`({
      appVisible: !document.getElementById("appShell").classList.contains("hidden"),
      activeCompanyText: document.getElementById("activeCompanyName") ? document.getElementById("activeCompanyName").textContent : '',
      noDatabaseError: !document.body.innerText.includes("DATABASE_UNREADABLE") && !document.body.innerText.includes("no such column: company_registration_type"),
    })`);

    assert.strictEqual(uiState.appVisible, true, "Workspace shell must be visible without crash");
    assert.strictEqual(uiState.noDatabaseError, true, "Must have zero database unreadable or missing column errors");
    console.log("✓ Workspace opened cleanly for company:", uiState.activeCompanyText);

    // Verify Tax Configuration settings can be loaded
    const taxSettings = await window.webContents.executeJavaScript(`
      typeof window.giDB.getState === 'function' ? window.giDB.getState().then(s => ({
        registrationType: s.businessSettings?.gstRegistrationType,
        pricingMode: s.businessSettings?.defaultPricingMode,
        stateCode: s.businessSettings?.stateCode,
        invoicesCount: s.invoices ? s.invoices.length : 0
      })) : null
    `);

    assert.ok(taxSettings, "Tax settings must be accessible from renderer");
    assert.strictEqual(taxSettings.registrationType, "regular", "Legacy GST-enabled company must default to regular");
    console.log("✓ Tax settings accessible in renderer:", taxSettings);

    console.log("\n==================================================================");
    console.log("   ELECTRON LEGACY DATABASE STARTUP SMOKE TEST PASSED (100%)!     ");
    console.log("==================================================================");

    window.destroy();
    app.quit();
  } catch (err) {
    console.error("Electron smoke test failed:", err);
    app.exit(1);
  } finally {
    try {
      fs.rmSync(testRoot, { recursive: true, force: true });
    } catch (_) {}
  }
});
