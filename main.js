const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const dns = require("node:dns");
const net = require("node:net");
const { Agent } = require("undici");
const database = require("./database");
const { SyncService, DisabledSyncAdapter, HttpSyncAdapter } = require("./sync-service");
const { whatsappService } = require("./whatsapp-service");

let mainWindow = null;
let tray = null;
let isQuitting = false;

let syncConfig = {
  serverUrl: process.env.CLOUD_SERVER_URL || "http://localhost:4000",
  token: "",
  enabled: false
};

const httpSyncAdapter = new HttpSyncAdapter({
  baseUrl: syncConfig.serverUrl,
  getToken: () => syncConfig.token
});

const syncService = new SyncService({
  database,
  adapter: httpSyncAdapter,
  enabled: false,
  intervalMs: 15000
});

const singleInstanceLock = (app && typeof app.requestSingleInstanceLock === "function")
  ? app.requestSingleInstanceLock()
  : true;
if (!singleInstanceLock) {
  console.log("ZynBill is already running. Focusing the existing instance...");
  app.exit(0);
}

// Global Electron Process Crash & Telemetry Logging
process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught Exception in Electron Main:', err);
  try {
    const http = require('node:http');
    const payload = JSON.stringify({
      source: 'desktop_client',
      level: 'CRITICAL',
      message: err.message || 'Electron Main Process Exception',
      stack: err.stack || '',
      clientVersion: app.getVersion()
    });
    const req = http.request('http://localhost:4000/api/v1/telemetry/report-error', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 3000
    });
    req.on('error', () => {});
    req.write(payload);
    req.end();
  } catch (_) {}
});

process.on('unhandledRejection', (reason) => {
  console.error('[ERROR] Unhandled Rejection in Electron Main:', reason);
  try {
    const http = require('node:http');
    const payload = JSON.stringify({
      source: 'desktop_client',
      level: 'ERROR',
      message: String(reason?.message || reason || 'Unhandled Rejection'),
      stack: reason?.stack || '',
      clientVersion: app.getVersion()
    });
    const req = http.request('http://localhost:4000/api/v1/telemetry/report-error', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 3000
    });
    req.on('error', () => {});
    req.write(payload);
    req.end();
  } catch (_) {}
});

function focusWindowForInput(window = mainWindow, options = {}) {
  if (!window || window.isDestroyed()) return;

  if (window.isMinimized()) window.restore();
  if (!window.isVisible()) {
    if (options.showIfHidden === false) return;
    window.show();
  }
  window.setFocusable(true);
  window.focus();
  window.webContents.focus();
}

function scheduleInputFocus(window = mainWindow, options = {}) {
  [0, 80, 250].forEach((delay) => {
    setTimeout(() => focusWindowForInput(window, options), delay);
  });
}

function createMainWindow() {
  const windowIconPath = path.join(__dirname, "assets", "icon.ico");
  const window = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    center: true,
    title: "ZynBill",
    icon: fs.existsSync(windowIconPath) ? windowIconPath : undefined,
    backgroundColor: "#eef3f8",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.maximize();
  window.setMenuBarVisibility(false);
  mainWindow = window;

  let revealed = false;
  const revealWindow = () => {
    if (revealed || window.isDestroyed()) return;
    revealed = true;
    if (window.isMinimized()) window.restore();
    if (!window.isMaximized()) window.maximize();
    window.show();
    window.focus();
    console.log("ZynBill window is active and displayed.");
  };

  window.once("ready-to-show", revealWindow);
  window.webContents.once("did-finish-load", revealWindow);
  setTimeout(revealWindow, 600);

  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level >= 2) console.log(`[Renderer Error] ${message} (${sourceId}:${line})`);
  });

  window.webContents.on("did-fail-load", (_event, code, desc, url) => {
    console.error(`[Load failed] ${code}: ${desc} (${url})`);
  });

  window.loadFile(path.join(__dirname, "index.html"));

  window.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        shell.openExternal(url);
      }
    } catch {
      // Reject invalid or non-web protocols
    }
    return { action: "deny" };
  });

  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
    if (process.platform !== "darwin") {
      isQuitting = true;
      if (tray && !tray.isDestroyed()) {
        tray.destroy();
        tray = null;
      }
      app.quit();
    }
  });

  return window;
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }

  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.show();
  mainWindow.focus();
  if (typeof mainWindow.moveTop === "function") mainWindow.moveTop();
  scheduleInputFocus(mainWindow);
}

function createTrayIcon() {
  const iconPath = path.join(__dirname, "assets", "zynbill-32.png");
  if (fs.existsSync(iconPath)) {
    return nativeImage.createFromPath(iconPath);
  }
  const size = 16;
  const buffer = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      if (x >= 1 && x < 15 && y >= 1 && y < 15) {
        buffer[idx] = 0;
        buffer[idx + 1] = 192;
        buffer[idx + 2] = 243;
        buffer[idx + 3] = 255;
      }
    }
  }
  return nativeImage.createFromBuffer(buffer, { width: size, height: size });
}

function createTray() {
  if (tray) return;

  try {
    const icon = createTrayIcon();
    if (!icon || icon.isEmpty()) return;
    tray = new Tray(icon);
    tray.setToolTip("ZynBill");
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: "Open ZynBill", click: showMainWindow },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]));

    tray.on("click", showMainWindow);
    tray.on("double-click", showMainWindow);
  } catch (err) {
    console.warn("Tray initialization skipped:", err?.message || err);
  }
}

function formatSnapshotSize(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}


// ── ZynBill Auto-Backup & Rolling Retention (Default: C:\ZynBill\Backups, Max 5 files) ──
function getZynBackupDir() {
  const preferred = process.platform === "win32" ? "C:\\ZynBill\\Backups" : path.join(app.getPath("userData"), "backups");
  try {
    if (!fs.existsSync(preferred)) {
      fs.mkdirSync(preferred, { recursive: true });
    }
    const testFile = path.join(preferred, ".write_test");
    fs.writeFileSync(testFile, "ok");
    fs.unlinkSync(testFile);
    return preferred;
  } catch (e) {
    const fallback = path.join(app.getPath("userData"), "backups");
    if (!fs.existsSync(fallback)) {
      fs.mkdirSync(fallback, { recursive: true });
    }
    return fallback;
  }
}

function pruneZynBackups(backupDir, maxKeep = 5) {
  try {
    if (!fs.existsSync(backupDir)) return;
    const files = fs.readdirSync(backupDir)
      .filter((f) => f.endsWith(".zyn") || f.endsWith(".sqlite") || f.endsWith(".db"))
      .map((f) => {
        try {
          const fp = path.join(backupDir, f);
          const st = fs.statSync(fp);
          return { filename: f, fullPath: fp, mtimeMs: st.mtimeMs };
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    if (files.length > maxKeep) {
      const toDelete = files.slice(maxKeep);
      for (const item of toDelete) {
        try {
          fs.unlinkSync(item.fullPath);
          console.log(`[AutoBackup] Pruned oldest backup beyond ${maxKeep} limit: ${item.filename}`);
        } catch (err) {
          console.warn(`[AutoBackup] Prune error for ${item.filename}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.warn("[AutoBackup] Directory scan error:", err.message);
  }
}

async function performAutoBackup(maxKeep = 5, reason = "exit") {
  const backupDir = getZynBackupDir();
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const filename = `ZynBill-Backup-${stamp}.zyn`;
  const targetPath = path.join(backupDir, filename);

  await database.backupTo(targetPath);
  console.log(`[AutoBackup] Saved ${reason} backup to: ${targetPath}`);

  pruneZynBackups(backupDir, maxKeep);

  const stats = fs.statSync(targetPath);
  return {
    success: true,
    path: targetPath,
    filename,
    folder: backupDir,
    sizeBytes: stats.size,
    formattedSize: formatSnapshotSize(stats.size),
    createdAt: now.toISOString(),
  };
}

let isAutoBackupRunning = false;
async function triggerExitBackupIfEnabled() {
  if (isAutoBackupRunning) return;
  try {
    const configPath = path.join(app.getPath("userData"), "backup_config.json");
    let autoBackup = true;
    if (fs.existsSync(configPath)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
        if (typeof cfg.autoBackupOnExit === "boolean") autoBackup = cfg.autoBackupOnExit;
      } catch (_) {}
    }
    if (autoBackup) {
      isAutoBackupRunning = true;
      console.log("[Exit] Triggering automated local backup on application exit (C:\\ZynBill\\Backups)...");
      await performAutoBackup(5, "exit");
    }
  } catch (err) {
    console.warn("[Exit] Auto-backup failed:", err.message);
  }
}

function registerDatabaseHandlers() {
  ipcMain.handle("app:get-version", () => app.getVersion());
  ipcMain.handle("app:get-system-info", () => {
    let username = "";
    try {
      username = os.userInfo ? os.userInfo().username : "";
    } catch (_) {}
    return {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      username
    };
  });
  ipcMain.handle("db:get-state", () => database.getState());
  ipcMain.handle("db:get-info", () => ({
    type: "SQLite",
    path: database.getDatabasePath(),
    version: app.getVersion(),
  }));
  
  ipcMain.handle("backup:get-settings", () => {
    const configPath = path.join(app.getPath("userData"), "backup_config.json");
    let autoBackupOnExit = true;
    if (fs.existsSync(configPath)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
        if (typeof cfg.autoBackupOnExit === "boolean") autoBackupOnExit = cfg.autoBackupOnExit;
      } catch (_) {}
    }
    return {
      autoBackupOnExit,
      folder: getZynBackupDir(),
      maxCopies: 5,
    };
  });

  ipcMain.handle("backup:set-settings", (_event, settings = {}) => {
    const configPath = path.join(app.getPath("userData"), "backup_config.json");
    let current = { autoBackupOnExit: true };
    if (fs.existsSync(configPath)) {
      try {
        current = JSON.parse(fs.readFileSync(configPath, "utf8"));
      } catch (_) {}
    }
    const updated = { ...current, ...settings };
    fs.writeFileSync(configPath, JSON.stringify(updated, null, 2), "utf8");
    return updated;
  });

  ipcMain.handle("backup:open-folder", async () => {
    const dir = getZynBackupDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await shell.openPath(dir);
    return { success: true, folder: dir };
  });

  ipcMain.handle("backup:run-now", async () => {
    return await performAutoBackup(5, "manual");
  });

  ipcMain.handle("db:create-backup", async () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const activeCompany = database.getCurrentCompany ? database.getCurrentCompany() : null;
    const prefix = activeCompany?.name ? String(activeCompany.name).replace(/[^a-zA-Z0-9_-]/g, "_") : "zynbill";
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Save ZynBill Backup (.zyn)",
      defaultPath: path.join(app.getPath("documents"), `${prefix}-backup-${stamp}.zyn`),
      filters: [
        { name: "ZynBill Backup (*.zyn)", extensions: ["zyn"] },
        { name: "SQLite Database (*.sqlite, *.db)", extensions: ["sqlite", "db"] },
        { name: "All Files (*.*)", extensions: ["*"] },
      ],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    let targetPath = result.filePath;
    if (!path.extname(targetPath)) targetPath += ".zyn";
    await database.backupTo(targetPath);
    return { success: true, path: targetPath, filename: path.basename(targetPath) };
  });

  ipcMain.handle("db:restore-backup", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: "Select ZynBill Backup to Restore (.zyn)",
      properties: ["openFile"],
      filters: [
        { name: "ZynBill Backup (*.zyn)", extensions: ["zyn"] },
        { name: "SQLite Database (*.sqlite, *.db)", extensions: ["sqlite", "db"] },
        { name: "All Files (*.*)", extensions: ["*"] },
      ],
    });
    if (canceled || !filePaths || !filePaths.length) return null;
    const sourcePath = filePaths[0];

    const confirm = await dialog.showMessageBox(mainWindow, {
      type: "warning",
      buttons: ["Restore Backup", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      title: "Confirm Database Restore",
      message: "Are you sure you want to restore this backup?",
      detail: `This will replace the active database with "${path.basename(sourcePath)}". An automatic safety backup of your current database will be created before restoration.`,
    });

    if (confirm.response !== 0) return null;

    try {
      const result = await database.restoreBackup(sourcePath, {
        userDataPath: app.getPath("userData"),
      });
      return result;
    } catch (err) {
      dialog.showErrorBox("Restore Failed", err.message || "Failed to restore backup.");
      throw err;
    }
  });

  ipcMain.handle("db:create-snapshot", async (_event, customLocation) => {
    try {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
      const activeCompany = database.getCurrentCompany ? database.getCurrentCompany() : null;
      const compName = activeCompany?.name ? String(activeCompany.name).replace(/[^a-zA-Z0-9_-]/g, "_") : "zynbill";
      const defaultFilename = `${compName}-snapshot-${stamp}.zyn`;

      let targetPath = customLocation;
      if (!targetPath) {
        const result = await dialog.showSaveDialog(mainWindow, {
          title: "Save Backup Snapshot (.zyn) - Choose Location",
          defaultPath: path.join(app.getPath("documents"), defaultFilename),
          filters: [
            { name: "ZynBill Backup Snapshot (*.zyn)", extensions: ["zyn"] },
            { name: "SQLite Database (*.sqlite, *.db)", extensions: ["sqlite", "db"] },
            { name: "All Files (*.*)", extensions: ["*"] },
          ],
        });
        if (result.canceled || !result.filePath) {
          return { canceled: true };
        }
        targetPath = result.filePath;
      }

      if (!path.extname(targetPath)) targetPath += ".zyn";

      await database.backupTo(targetPath);
      const stats = fs.statSync(targetPath);
      const filename = path.basename(targetPath);

      // Keep a shadow copy in userData/backups so the in-app snapshot history list tracks it
      try {
        const backupDir = path.join(app.getPath("userData"), "backups");
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
        const localCopy = path.join(backupDir, filename);
        if (path.resolve(localCopy) !== path.resolve(targetPath)) {
          fs.copyFileSync(targetPath, localCopy);
        }
      } catch (_) {}

      return {
        success: true,
        path: targetPath,
        filename,
        sizeBytes: stats.size,
        formattedSize: formatSnapshotSize(stats.size),
        createdAt: now.toISOString(),
      };
    } catch (err) {
      console.error("Create snapshot error:", err);
      throw err;
    }
  });

  ipcMain.handle("db:list-snapshots", async () => {
    try {
      const backupDir = path.join(app.getPath("userData"), "backups");
      const autoDir = path.join(backupDir, "auto");
      const list = [];
      const scanDir = (dir, isAuto) => {
        if (!fs.existsSync(dir)) return;
        const files = fs.readdirSync(dir).filter((f) => f.endsWith(".zyn") || f.endsWith(".sqlite") || f.endsWith(".db"));
        files.forEach((f) => {
          const fullPath = path.join(dir, f);
          try {
            const stats = fs.statSync(fullPath);
            list.push({
              filename: f,
              path: fullPath,
              isAuto,
              sizeBytes: stats.size,
              formattedSize: formatSnapshotSize(stats.size),
              createdAt: stats.mtime.toISOString(),
              mtimeMs: stats.mtimeMs,
            });
          } catch (_) {}
        });
      };
      scanDir(backupDir, false);
      scanDir(autoDir, true);
      list.sort((a, b) => b.mtimeMs - a.mtimeMs);
      return list;
    } catch (err) {
      console.error("List snapshots error:", err);
      return [];
    }
  });

  ipcMain.handle("db:restore-snapshot", async (_event, snapshotPath) => {
    if (!snapshotPath || !fs.existsSync(snapshotPath)) {
      throw new Error("Snapshot file does not exist.");
    }
    const result = await database.restoreBackup(snapshotPath, {
      userDataPath: app.getPath("userData"),
    });
    return result;
  });

  ipcMain.handle("db:preview-backup", async (_event, sourcePath) => {
    let target = sourcePath;
    if (!target) {
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: "Select Backup File to Preview (.zyn)",
        properties: ["openFile"],
        filters: [
          { name: "ZynBill Backup (*.zyn)", extensions: ["zyn"] },
          { name: "SQLite Database (*.sqlite, *.db)", extensions: ["sqlite", "db"] },
          { name: "All Files (*.*)", extensions: ["*"] },
        ],
      });
      if (canceled || !filePaths || !filePaths.length) return null;
      target = filePaths[0];
    }
    return database.previewBackup(target);
  });

  ipcMain.handle("db:get-users", (_event, companyId) => database.getUsers(companyId));
  ipcMain.handle("db:create-user", (_event, payload) => database.createUser(payload));
  ipcMain.handle("db:update-user", (_event, payload) => database.updateUser(payload));
  ipcMain.handle("db:delete-user", (_event, payload) => database.deleteUser(payload));
  ipcMain.handle("db:get-audit-trail", (_event, filter) => database.getAuditTrail(filter));
  ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
  ipcMain.handle("db:set-country", (_event, country) => database.setCountry(country));
  ipcMain.handle("db:update-business-settings", (_event, settings) => database.updateBusinessSettings(settings));
  ipcMain.handle("db:create-bank-account", (_event, account) => database.createBankAccount(account));
  ipcMain.handle("db:update-bank-account", (_event, account) => database.updateBankAccount(account));
  ipcMain.handle("db:delete-bank-account", (_event, payload) => database.deleteBankAccount(payload));
  ipcMain.handle("db:set-default-bank-account", (_event, payload) => database.setDefaultBankAccount(payload));
  ipcMain.handle("db:create-party", (_event, party) => database.createParty(party));
  ipcMain.handle("db:update-party", (_event, party) => database.updateParty(party));
  ipcMain.handle("db:create-item", (_event, item) => database.createItem(item));
  ipcMain.handle("db:update-item", (_event, item) => database.updateItem(item));
  ipcMain.handle("db:create-unit", (_event, unit) => database.createUnit(unit));
  ipcMain.handle("db:update-unit", (_event, unit) => database.updateUnit(unit));
  ipcMain.handle("db:delete-unit", (_event, payload) => database.deleteUnit(payload));
  ipcMain.handle("db:toggle-unit-active", (_event, payload) => database.toggleUnitActive(payload));
  ipcMain.handle("db:get-units-list", () => database.getUnitsList());
  ipcMain.handle("db:create-item-category", (_event, category) => database.createItemCategory(category));
  ipcMain.handle("db:update-item-category", (_event, category) => database.updateItemCategory(category));
  ipcMain.handle("db:delete-item-category", (_event, payload) => database.deleteItemCategory(payload));
  ipcMain.handle("db:toggle-item-category-active", (_event, payload) => database.toggleItemCategoryActive(payload));
  ipcMain.handle("db:get-categories-with-hierarchy", () => database.getCategoriesWithHierarchy());
  ipcMain.handle("db:create-transaction", (_event, transaction) => database.createTransaction(transaction));
  ipcMain.handle("db:preview-next-invoice-number", (_event, type, docDate, series) => database.previewNextInvoiceNumber(type, docDate, series));
  ipcMain.handle("db:update-transaction", (_event, transaction) => database.updateTransaction(transaction));
  ipcMain.handle("db:delete-transaction", (_event, payload) => database.deleteTransaction(payload));
  ipcMain.handle("db:update-invoice", (_event, transaction) => database.updateInvoice(transaction));
  ipcMain.handle("db:create-estimate", (_event, estimate) => database.createEstimate(estimate));
  ipcMain.handle("db:update-estimate", (_event, estimate) => database.updateEstimate(estimate));
  ipcMain.handle("db:set-estimate-status", (_event, payload) => database.setEstimateStatus(payload));
  ipcMain.handle("db:delete-estimate", (_event, payload) => database.deleteEstimate(payload));
  ipcMain.handle("db:create-credit-note", (_event, creditNote) => database.createCreditNote(creditNote));
  ipcMain.handle("db:update-credit-note", (_event, creditNote) => database.updateCreditNote(creditNote));
  ipcMain.handle("db:set-credit-note-status", (_event, payload) => database.setCreditNoteStatus(payload));
  ipcMain.handle("db:delete-credit-note", (_event, payload) => database.deleteCreditNote(payload));
  ipcMain.handle("db:create-debit-note", (_event, debitNote) => database.createDebitNote(debitNote));
  ipcMain.handle("db:update-debit-note", (_event, debitNote) => database.updateDebitNote(debitNote));
  ipcMain.handle("db:set-debit-note-status", (_event, payload) => database.setDebitNoteStatus(payload));
  ipcMain.handle("db:delete-debit-note", (_event, payload) => database.deleteDebitNote(payload));
  ipcMain.handle("db:record-invoice-payment", (_event, payment) => database.recordInvoicePayment(payment));
  ipcMain.handle("db:record-payment-in", (_event, payment) => database.recordPaymentIn(payment));
  ipcMain.handle("db:record-payment-out", (_event, payment) => database.recordPaymentOut(payment));
  ipcMain.handle("db:delete-payment", (_event, payload) => database.deletePayment(payload));
  ipcMain.handle("db:record-stock-adjustment", (_event, payload) => database.recordStockAdjustment(payload));
  ipcMain.handle("db:set-invoice-status", (_event, payload) => database.setInvoiceStatus(payload));
  ipcMain.handle("db:delete-invoice", (_event, payload) => database.deleteInvoice(payload));
  ipcMain.handle("db:create-company", (_event, payload) => database.createCompany(payload));
  ipcMain.handle("db:update-company-profile", (_event, payload) => database.updateCompanyProfile(payload));
  ipcMain.handle("db:delete-company", (_event, id) => database.deleteCompany(id));
  ipcMain.handle("db:get-tax-entries", (_event, filter) => database.getTaxEntries(filter));
  ipcMain.handle("db:save-journal-voucher", (_event, payload) => database.saveJournalVoucher(payload));
  ipcMain.handle("sync:get-status", () => syncService.getStatus());
  ipcMain.handle("sync:run", () => syncService.syncNow());
  ipcMain.handle("sync:configure", (_event, config = {}) => {
    if (config.serverUrl) {
      syncConfig.serverUrl = config.serverUrl;
      httpSyncAdapter.setBaseUrl(config.serverUrl);
    }
    if (typeof config.token === "string") {
      syncConfig.token = config.token;
    }
    if (typeof config.enabled === "boolean") {
      syncConfig.enabled = config.enabled;
      syncService.enabled = config.enabled;
      if (config.enabled) syncService.start();
      else syncService.stop();
    }
    return syncService.getStatus();
  });
  ipcMain.handle("db:get-daily-backups", () => database.getBackupHistory?.(app.getPath("userData")) || []);
  ipcMain.handle("db:create-daily-backup", () => database.createDailyAutomatedBackup?.(app.getPath("userData")) || null);
  ipcMain.handle("app:export-pdf", async (_event, { htmlContent, defaultFilename = "invoice.pdf" }) => {
    const fs = require("fs");
    if (typeof htmlContent !== 'string' || !htmlContent.trim() || Buffer.byteLength(htmlContent, 'utf8') > 10 * 1024 * 1024) throw new Error('Invalid or oversized PDF document.');
    const targetWin = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
    const saveResult = await dialog.showSaveDialog(targetWin, {
      title: "Export to PDF",
      defaultPath: path.basename(String(defaultFilename)).replace(/[<>:"|?*]/g, '_'),
      filters: [{ name: "PDF Files", extensions: ["pdf"] }],
    });

    if (saveResult.canceled || !saveResult.filePath) {
      return { success: false, canceled: true };
    }

    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        javascript: false,
      },
    });

    try {
      printWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; object-src 'none'; base-uri 'none'">`;
      await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(policy + htmlContent)}`);
      const pdfData = await printWindow.webContents.printToPDF({
        printBackground: true,
        pageSize: "A4",
        margins: { marginType: "default" },
      });
      fs.writeFileSync(saveResult.filePath, pdfData);
      return { success: true, filePath: saveResult.filePath };
    } finally {
      printWindow.destroy();
    }
  });
  ipcMain.handle("whatsapp:open-link", async (_event, url) => {
    if (typeof url === "string" && (url.startsWith("https://wa.me/") || url.startsWith("https://web.whatsapp.com/") || url.startsWith("whatsapp://") || url.startsWith("mailto:"))) {
      try {
        await shell.openExternal(url);
        return { success: true };
      } catch (err) {
        console.warn("Could not open external link:", url, err);
        return { success: false, error: err?.message || String(err) };
      }
    }
    return { success: false, error: "Invalid URL format." };
  });
  ipcMain.handle("app:open-system-share", async (_event, filePath) => {
    const fs = require("fs");
    const { exec } = require("child_process");
    if (!filePath || !fs.existsSync(filePath)) {
      return { success: false, error: "File not found on disk." };
    }
    if (process.platform === "win32") {
      try {
        exec(`rundll32.exe shell32.dll,OpenAs_RunDLL "${filePath}"`);
        return { success: true };
      } catch (err) {
        shell.openPath(filePath);
        return { success: true };
      }
    } else {
      shell.openPath(filePath);
      return { success: true };
    }
  });
  ipcMain.handle("whatsapp:save-temp-pdf", async (_event, { htmlContent, filename = "invoice.pdf" }) => {
    const fs = require("fs");
    if (typeof htmlContent !== "string" || !htmlContent.trim()) throw new Error("Invalid invoice content.");
    const tempDir = path.join(app.getPath("temp"), "gi-billing-invoices");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const safeFilename = path.basename(String(filename)).replace(/[<>:"|?*]/g, "_");
    const filePath = path.join(tempDir, safeFilename);

    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        javascript: false,
      },
    });

    try {
      printWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; object-src 'none'; base-uri 'none'">`;
      await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(policy + htmlContent)}`);
      const pdfData = await printWindow.webContents.printToPDF({
        printBackground: true,
        pageSize: "A4",
        margins: { marginType: "default" },
      });
      fs.writeFileSync(filePath, pdfData);
      return { success: true, filePath };
    } finally {
      printWindow.destroy();
    }
  });
  ipcMain.handle("whatsapp:show-in-folder", async (_event, filePath) => {
    const fs = require("fs");
    if (filePath && fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
      return { success: true };
    }
    return { success: false, error: "File not found on disk." };
  });
  ipcMain.handle("app:open-path", async (_event, filePath) => {
    const fs = require("fs");
    if (filePath && fs.existsSync(filePath)) {
      try {
        await shell.openPath(filePath);
        return { success: true };
      } catch (err) {
        return { success: false, error: err?.message || String(err) };
      }
    }
    return { success: false, error: "File not found on disk." };
  });
  ipcMain.handle("app:select-file", async (_event, options = {}) => {
    const { dialog } = require("electron");
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: options?.filters || [{ name: "PDF Documents", extensions: ["pdf"] }, { name: "All Files", extensions: ["*"] }]
    });
    if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
      return { success: true, filePath: result.filePaths[0] };
    }
    return { success: false, canceled: true };
  });
  ipcMain.handle("app:generate-qr-svg", async (_event, { text, options = {} } = {}) => {
    try {
      if (!text || typeof text !== "string") {
        return { success: false, error: "Text string is required for QR code generation." };
      }
      const QRCode = require("qrcode");
      const svg = await QRCode.toString(text, {
        type: "svg",
        margin: options.margin !== undefined ? options.margin : 1,
        errorCorrectionLevel: options.errorCorrectionLevel || "M",
        color: {
          dark: options.darkColor || "#000000",
          light: options.lightColor || "#ffffff",
        },
      });
      return { success: true, svg };
    } catch (err) {
      return { success: false, error: err.message || "Failed to generate QR code SVG." };
    }
  });
}

function isLocalOrLoopbackHost(hostname) {
  const host = (hostname || "").toLowerCase().trim();
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

function classifyIpAddress(ip) {
  if (!ip || typeof ip !== "string") return { isIp: false };
  let raw = ip.trim().toLowerCase();
  if (raw.startsWith("[") && raw.endsWith("]")) raw = raw.slice(1, -1);
  if (!net.isIP(raw)) return { isIp: false };

  // Handle IPv4-mapped IPv6 addresses (e.g. ::ffff:192.168.1.1 or ::ffff:169.254.169.254)
  if (raw.startsWith("::ffff:")) {
    const embedded = raw.slice(7);
    if (net.isIPv4(embedded)) {
      const v4Class = classifyIpAddress(embedded);
      return {
        ...v4Class,
        isIpv4Mapped: true,
        version: 6,
        originalIp: raw
      };
    }
  }

  const isV4 = net.isIPv4(raw);
  if (isV4) {
    const [o1, o2, o3, o4] = raw.split(".").map(Number);
    const isLoopback = o1 === 127;
    const isLinkLocal = o1 === 169 && o2 === 254; // Link-local & cloud metadata (169.254.169.254)
    const isPrivate =
      o1 === 10 ||
      (o1 === 172 && o2 >= 16 && o2 <= 31) ||
      (o1 === 192 && o2 === 168);
    const isCarrierNat = o1 === 100 && o2 >= 64 && o2 <= 127;
    const isMulticast = o1 >= 224 && o1 <= 239;
    const isReserved = o1 >= 240;
    const isUnspecified = o1 === 0 || raw === "255.255.255.255";
    const isDocumentation =
      (o1 === 192 && o2 === 0 && o3 === 2) ||
      (o1 === 198 && o2 === 51 && o3 === 100) ||
      (o1 === 203 && o2 === 0 && o3 === 113);
    const isBenchmark = o1 === 198 && (o2 === 18 || o2 === 19);

    const isNonPublic = isPrivate || isCarrierNat || isLoopback || isLinkLocal || isDocumentation || isBenchmark || isReserved || isUnspecified;
    const isDisallowed = isLinkLocal || isMulticast || isReserved || isUnspecified || isDocumentation || isBenchmark;

    return {
      isIp: true,
      version: 4,
      isLoopback,
      isLinkLocal,
      isPrivate: isPrivate || isCarrierNat,
      isCarrierNat,
      isMulticast,
      isReserved,
      isUnspecified,
      isNonPublic,
      isDisallowed
    };
  } else {
    // IPv6
    const isLoopback = raw === "::1";
    const isUnspecified = raw === "::";
    const isLinkLocal = raw.startsWith("fe8") || raw.startsWith("fe9") || raw.startsWith("fea") || raw.startsWith("feb");
    const isUniqueLocal = raw.startsWith("fc") || raw.startsWith("fd");
    const isMulticast = raw.startsWith("ff");
    const isDocumentation = raw.startsWith("2001:db8:");

    const isNonPublic = isUniqueLocal || isLoopback || isLinkLocal || isDocumentation || isMulticast || isUnspecified;
    const isDisallowed = isLinkLocal || isMulticast || isUnspecified || isDocumentation;

    return {
      isIp: true,
      version: 6,
      isLoopback,
      isLinkLocal,
      isPrivate: isUniqueLocal,
      isCarrierNat: false,
      isMulticast,
      isReserved: false,
      isUnspecified,
      isNonPublic,
      isDisallowed
    };
  }
}

function isDisallowedCloudHost(hostname) {
  const host = (hostname || "").toLowerCase().trim();
  // Block AWS / GCP / Azure / OpenStack metadata services and link-local ranges (SSRF protection)
  if (
    host === "169.254.169.254" ||
    host === "metadata.google.internal" ||
    host === "instance-data" ||
    host === "0.0.0.0" ||
    host === "255.255.255.255" ||
    host.startsWith("169.254.")
  ) {
    return true;
  }
  const ipInfo = classifyIpAddress(host);
  if (ipInfo.isIp && ipInfo.isDisallowed) {
    return true;
  }
  return false;
}

function isAuthorizedHost(hostname, ip) {
  const normHost = (hostname || "").toLowerCase().trim();
  const isLoopbackHost = normHost === "localhost" || normHost === "127.0.0.1" || normHost === "::1" || normHost === "[::1]";

  const isProduction = (typeof app !== "undefined" && app && app.isPackaged) || process.env.NODE_ENV === "production";

  // In non-production (dev/test): localhost and loopback are authorized
  if (!isProduction && isLoopbackHost) {
    return true;
  }

  // Parse TRUSTED_LAN_HOSTS from env or config (comma-separated list of approved hostnames or IPs)
  const trustedRaw = process.env.TRUSTED_LAN_HOSTS || (typeof syncConfig !== "undefined" ? syncConfig.trustedLanHosts : "") || "";
  const trustedList = trustedRaw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

  // If in production and connecting to loopback: requires explicit authorization
  if (isLoopbackHost) {
    if (process.env.ALLOW_LOOPBACK_IN_PRODUCTION === "true" || trustedList.includes("localhost") || trustedList.includes("127.0.0.1") || trustedList.includes("::1")) {
      return true;
    }
    return false;
  }

  // Check if hostname or IP is explicitly present in TRUSTED_LAN_HOSTS
  if (trustedList.includes(normHost)) {
    return true;
  }
  if (ip && trustedList.includes(ip.toLowerCase().trim())) {
    return true;
  }

  return false;
}

function resolveCloudServerUrl(candidate) {
  const defaultUrl = syncConfig.serverUrl || process.env.CLOUD_SERVER_URL || "http://localhost:4000";
  const raw = (candidate && typeof candidate === "string" && candidate.trim())
    ? candidate.trim()
    : defaultUrl;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return resolveCloudServerUrl(defaultUrl);
    }
    // Block metadata services / SSRF targets
    if (isDisallowedCloudHost(parsed.hostname)) {
      console.warn(`[SECURITY] Blocked SSRF/metadata host candidate: ${parsed.hostname}`);
      return resolveCloudServerUrl(defaultUrl);
    }
    // Enforce HTTPS in production for remote (non-loopback) hosts
    const isProduction = (typeof app !== "undefined" && app && app.isPackaged) || process.env.NODE_ENV === "production";
    const allowInsecure = process.env.ALLOW_INSECURE_HTTP === "true";
    if (isProduction && !allowInsecure && parsed.protocol === "http:" && !isLocalOrLoopbackHost(parsed.hostname)) {
      console.warn(`[SECURITY] Insecure HTTP rejected for remote host ${parsed.hostname} in production. Upgraded to https://`);
      parsed.protocol = "https:";
    }
    return parsed.origin;
  } catch (_) {
    return "http://localhost:4000";
  }
}

// Connection pinning replaces separate pre-flight dns.promises.lookup with undici Agent custom lookup
function createSecureLookup() {
  return function secureLookup(hostname, options, callback) {
    const isProduction = (typeof app !== "undefined" && app && app.isPackaged) || process.env.NODE_ENV === "production";
    const normHost = (hostname || "").toLowerCase().trim();

    // 1. Direct IP target
    const ipInfo = classifyIpAddress(normHost);
    if (ipInfo.isIp) {
      if (ipInfo.isDisallowed) {
        return callback(new Error(`SSRF Protection: Prohibited IP target (${normHost}).`));
      }
      if (ipInfo.isLoopback) {
        if (isProduction && !isAuthorizedHost(normHost, normHost)) {
          return callback(new Error(`SSRF Protection: Direct loopback destination (${normHost}) blocked in production.`));
        }
      } else if (ipInfo.isPrivate || ipInfo.isNonPublic) {
        if (isProduction && !isAuthorizedHost(normHost, normHost)) {
          return callback(new Error(`SSRF Protection: Direct private/LAN destination (${normHost}) blocked without explicit authorization.`));
        }
      }
      const resItem = { address: normHost, family: ipInfo.version };
      return callback(null, options?.all ? [resItem] : normHost, ipInfo.version);
    }

    // 2. Hostname resolution
    dns.lookup(hostname, { all: true }, (err, addresses) => {
      if (err) return callback(err);
      if (!addresses || addresses.length === 0) {
        return callback(new Error(`SSRF Protection: DNS returned no addresses for host ${hostname}.`));
      }

      let hasPublic = false;
      let hasPrivateOrLoopback = false;

      // Validate every returned IP address
      for (const entry of addresses) {
        const info = classifyIpAddress(entry.address);
        if (info.isDisallowed) {
          return callback(new Error(`SSRF Protection: Hostname ${hostname} resolves to prohibited address ${entry.address}.`));
        }
        if (info.isLoopback || info.isPrivate || info.isNonPublic) {
          hasPrivateOrLoopback = true;
        } else {
          hasPublic = true;
        }
      }

      // Mixed public/private DNS response check (Requirement 10)
      if (hasPublic && hasPrivateOrLoopback) {
        return callback(new Error(`SSRF Protection: Mixed public/private DNS response for host ${hostname} rejected.`));
      }

      // If resolving to private/loopback, verify authorization (Requirement 9)
      if (hasPrivateOrLoopback) {
        if (isProduction && !isAuthorizedHost(hostname, addresses[0].address)) {
          return callback(new Error(`SSRF Protection: DNS rebinding rejected. Public hostname ${hostname} resolved to internal/private IP (${addresses[0].address}).`));
        }
      }

      // Pin connection to the first validated address (Requirement 3: no second lookup)
      const chosen = addresses[0];
      return callback(null, options?.all ? [chosen] : chosen.address, chosen.family);
    });
  };
}

let secureCloudAgentInstance = null;
function getSecureCloudAgent() {
  if (!secureCloudAgentInstance) {
    secureCloudAgentInstance = new Agent({
      connect: {
        lookup: createSecureLookup()
      }
    });
  }
  return secureCloudAgentInstance;
}

async function safeCloudFetch(endpoint, options = {}, candidateUrl) {
  if (typeof endpoint !== "string" || !endpoint.startsWith("/api/v1/")) {
    return {
      ok: false,
      status: 400,
      error: "Invalid cloud API endpoint. Only relative paths under /api/v1/ are permitted."
    };
  }

  // Pre-validate candidateUrl if explicitly provided
  if (candidateUrl && typeof candidateUrl === "string") {
    try {
      const candObj = new URL(candidateUrl);
      const candHost = candObj.hostname;
      const candIp = classifyIpAddress(candHost);
      if (candIp.isIp && candIp.isDisallowed) {
        return { ok: false, status: 400, error: `SSRF Protection: Prohibited IP target (${candHost}).` };
      }
      if (isDisallowedCloudHost(candHost)) {
        return { ok: false, status: 400, error: `SSRF Protection: Prohibited target host (${candHost}).` };
      }
    } catch (_) {
      // Ignored here; resolveCloudServerUrl handles malformed URLs
    }
  }

  const baseUrl = resolveCloudServerUrl(candidateUrl);
  let targetUrlObj;
  try {
    targetUrlObj = new URL(endpoint, baseUrl);
    // Ensure the constructed URL does not divert away from the resolved cloud server origin
    if (targetUrlObj.origin !== new URL(baseUrl).origin) {
      return {
        ok: false,
        status: 400,
        error: "SSRF Protection: Endpoint origin does not match cloud server origin."
      };
    }
  } catch (_) {
    return { ok: false, status: 400, error: "Malformed target URL construction." };
  }

  const hostname = targetUrlObj.hostname;
  const isProduction = (typeof app !== "undefined" && app && app.isPackaged) || process.env.NODE_ENV === "production";

  // Pre-fetch validation for direct IP destinations
  const ipInfo = classifyIpAddress(hostname);
  if (ipInfo.isIp) {
    if (ipInfo.isDisallowed) {
      return { ok: false, status: 400, error: `SSRF Protection: Prohibited IP target (${hostname}).` };
    }
    if (ipInfo.isLoopback) {
      if (isProduction && !isAuthorizedHost(hostname, hostname)) {
        return { ok: false, status: 400, error: `SSRF Protection: Direct loopback destination (${hostname}) blocked in production.` };
      }
    } else if (ipInfo.isPrivate || ipInfo.isNonPublic) {
      if (isProduction && !isAuthorizedHost(hostname, hostname)) {
        return { ok: false, status: 400, error: `SSRF Protection: Direct private/LAN destination (${hostname}) blocked without explicit authorization.` };
      }
    }
  }

  const targetUrl = targetUrlObj.toString();
  const ctrl = new AbortController();
  const timeoutMs = Math.min(Math.max(Number(options.timeoutMs) || 8000, 1000), 30000);
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const headers = {
      "Accept": "application/json",
      ...(options.headers || {})
    };
    if (options.body) {
      headers["Content-Type"] = "application/json";
    }

    const dispatcher = options.dispatcher || getSecureCloudAgent();

    const res = await fetch(targetUrl, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: ctrl.signal,
      redirect: "error",
      dispatcher
    });

    let data = null;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try { data = await res.json(); } catch (_) {}
    } else {
      const text = await res.text();
      try { data = JSON.parse(text); } catch (_) { data = { raw: text }; }
    }

    return {
      ok: res.ok,
      status: res.status,
      data
    };
  } catch (err) {
    const errorMsg = err.name === "AbortError"
      ? "Cloud server request timed out."
      : (err.cause?.message || err.message || "Network error communicating with cloud server.");
    return {
      ok: false,
      status: 0,
      error: errorMsg
    };
  } finally {
    clearTimeout(timer);
  }
}

function registerCloudHandlers() {
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const SIX_DIGIT_REGEX = /^\d{6}$/;

  ipcMain.handle("cloud:check-health", async (_event, options = {}) => {
    const token = typeof options.token === "string" && options.token.trim().length <= 2048 ? options.token.trim() : null;
    const headers = token ? { "Authorization": `Bearer ${token}` } : {};
    return safeCloudFetch("/api/v1/system/health", { method: "GET", headers, timeoutMs: 3500 }, options.serverUrl);
  });

  ipcMain.handle("cloud:desktop-initiate-login", async (_event, payload = {}) => {
    if (!payload || typeof payload.email !== "string" || !EMAIL_REGEX.test(payload.email.trim()) || payload.email.trim().length > 255) {
      return { ok: false, error: "Valid email address is required (max 255 characters)." };
    }
    if (!payload.password || typeof payload.password !== "string" || payload.password.length > 255) {
      return { ok: false, error: "Password is required (max 255 characters)." };
    }
    const serverUrl = resolveCloudServerUrl(payload.serverUrl);
    syncConfig.serverUrl = serverUrl;
    httpSyncAdapter.setBaseUrl(serverUrl);

    return safeCloudFetch("/api/v1/auth/desktop-initiate-login", {
      method: "POST",
      body: {
        email: payload.email.trim(),
        password: payload.password,
        machineName: String(payload.machineName || os.hostname() || "ZynBill PC").trim().slice(0, 128)
      },
      timeoutMs: 8000
    }, serverUrl);
  });

  ipcMain.handle("cloud:desktop-verify-device", async (_event, payload = {}) => {
    if (!payload || typeof payload.email !== "string" || !EMAIL_REGEX.test(payload.email.trim()) || payload.email.trim().length > 255) {
      return { ok: false, error: "Valid email address is required." };
    }
    const code = typeof payload.code === "string" ? payload.code.trim() : "";
    if (!SIX_DIGIT_REGEX.test(code)) {
      return { ok: false, error: "6-digit verification code is required." };
    }
    const serverUrl = resolveCloudServerUrl(payload.serverUrl);
    const result = await safeCloudFetch("/api/v1/auth/desktop-verify-device", {
      method: "POST",
      body: {
        email: payload.email.trim(),
        code,
        machineName: String(payload.machineName || os.hostname() || "ZynBill PC").trim().slice(0, 128)
      },
      timeoutMs: 8000
    }, serverUrl);

    if (result.ok && result.data?.token) {
      syncConfig.token = result.data.token;
      syncConfig.enabled = true;
      syncService.enabled = true;
      syncService.start();
    }
    return result;
  });

  ipcMain.handle("cloud:pin-reset-request", async (_event, payload = {}) => {
    if (!payload || typeof payload.email !== "string" || !EMAIL_REGEX.test(payload.email.trim()) || payload.email.trim().length > 255) {
      return { ok: false, error: "Valid email address is required." };
    }
    return safeCloudFetch("/api/v1/auth/pin-reset-request", {
      method: "POST",
      body: { email: payload.email.trim() },
      timeoutMs: 6000
    }, payload.serverUrl);
  });

  ipcMain.handle("cloud:pin-reset-verify", async (_event, payload = {}) => {
    if (!payload || typeof payload.email !== "string" || !EMAIL_REGEX.test(payload.email.trim()) || payload.email.trim().length > 255) {
      return { ok: false, error: "Valid email address is required." };
    }
    const code = typeof payload.code === "string" ? payload.code.trim() : "";
    if (!SIX_DIGIT_REGEX.test(code)) {
      return { ok: false, error: "6-digit verification code is required." };
    }
    return safeCloudFetch("/api/v1/auth/pin-reset-verify", {
      method: "POST",
      body: { email: payload.email.trim(), code },
      timeoutMs: 6000
    }, payload.serverUrl);
  });

  ipcMain.handle("cloud:check-updates", async (_event, options = {}) => {
    return safeCloudFetch("/api/v1/updates/check", { method: "GET", timeoutMs: 5000 }, options.serverUrl);
  });

  ipcMain.handle("cloud:validate-license", async (_event, options = {}) => {
    if (!options.token || typeof options.token !== "string" || options.token.trim().length > 2048) {
      return { ok: false, error: "Valid authentication token is required for license validation." };
    }
    return safeCloudFetch("/api/v1/auth/validate-license", {
      method: "GET",
      headers: { "Authorization": `Bearer ${options.token.trim()}` },
      timeoutMs: 5000
    }, options.serverUrl);
  });
}

function createMenu() {
  const template = [
    {
      label: "Company",
      submenu: [
        { label: "Dashboard", accelerator: "Ctrl+H", click: (_item, win) => win?.webContents.executeJavaScript("document.querySelector('[data-view=\"home\"]')?.click()") },
        { label: "Change Company", click: (_item, win) => win?.webContents.executeJavaScript("window.dispatchEvent(new Event('gi-change-company'))") },
        { type: "separator" },
        { label: "Refresh", accelerator: "Ctrl+R", click: (_item, win) => win?.webContents.executeJavaScript("window.dispatchEvent(new Event('gi-refresh'))") },
        { type: "separator" },
        { label: `About ZynBill v${app.getVersion()}`, enabled: false },
        { type: "separator" },
        {
          label: "Quit",
          accelerator: "Alt+F4",
          click: () => {
            isQuitting = true;
            app.quit();
          },
        },
      ],
    },
    {
      label: "Help",
      submenu: [
        { label: "Customer Support", click: () => shell.openExternal("https://wa.me/919333911911") },
        { label: "Instant Online Support", click: () => shell.openExternal("https://wa.me/919333911911") },
        { type: "separator" },
        { label: "Keyboard Shortcuts", accelerator: "Ctrl+/", click: (_item, win) => win?.webContents.executeJavaScript("openKeyboardShortcutsDialog()") },
        { type: "separator" },
        { role: "toggleDevTools" },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function startScheduledBackupService() {
  const runAutoBackup = async () => {
    try {
      const autoBackupDir = path.join(app.getPath("userData"), "backups", "auto");
      if (!fs.existsSync(autoBackupDir)) {
        fs.mkdirSync(autoBackupDir, { recursive: true });
      }

      const files = fs.readdirSync(autoBackupDir).filter((f) => f.endsWith(".zyn") || f.endsWith(".sqlite") || f.endsWith(".db"));
      const now = new Date();
      let shouldBackup = true;

      if (files.length) {
        const sorted = files.map((f) => {
          try {
            const stat = fs.statSync(path.join(autoBackupDir, f));
            return { filename: f, mtimeMs: stat.mtimeMs };
          } catch (_) {
            return null;
          }
        }).filter(Boolean).sort((a, b) => b.mtimeMs - a.mtimeMs);

        if (sorted.length) {
          const ageHours = (now.getTime() - sorted[0].mtimeMs) / (1000 * 60 * 60);
          if (ageHours < 24) {
            shouldBackup = false;
          }
        }
      }

      if (shouldBackup) {
        const pad = (n) => String(n).padStart(2, "0");
        const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
        const filename = `gi-auto-backup-${stamp}.zyn`;
        const targetPath = path.join(autoBackupDir, filename);
        await database.backupTo(targetPath);

        const updatedFiles = fs.readdirSync(autoBackupDir)
          .filter((f) => f.endsWith(".zyn") || f.endsWith(".sqlite") || f.endsWith(".db"))
          .map((f) => {
            try {
              const stat = fs.statSync(path.join(autoBackupDir, f));
              return { filename: f, fullPath: path.join(autoBackupDir, f), mtimeMs: stat.mtimeMs };
            } catch (_) {
              return null;
            }
          })
          .filter(Boolean)
          .sort((a, b) => b.mtimeMs - a.mtimeMs);

        if (updatedFiles.length > 7) {
          for (let i = 7; i < updatedFiles.length; i++) {
            try {
              fs.unlinkSync(updatedFiles[i].fullPath);
            } catch (_) {}
          }
        }
      }
    } catch (err) {
      console.warn("Scheduled auto backup check warning:", err.message);
    }
  };

  const autoBackupTimer = setTimeout(runAutoBackup, 3000);
  const autoBackupInterval = setInterval(runAutoBackup, 6 * 60 * 60 * 1000);
  if (typeof autoBackupTimer.unref === "function") autoBackupTimer.unref();
  if (typeof autoBackupInterval.unref === "function") autoBackupInterval.unref();
}

if (singleInstanceLock && app && typeof app.whenReady === "function") {
  app.on("second-instance", () => {
    showMainWindow();
  });

  app.whenReady().then(async () => {
    await database.initDatabase(app.getPath("userData"));
  database.createDailyAutomatedBackup?.(app.getPath("userData"));
    registerDatabaseHandlers();
    registerCloudHandlers();
    createMenu();
    createTray();
    createMainWindow();
    whatsappService.init({
      app,
      ipcMain,
      getMainWindow: () => mainWindow,
    });
    syncService.start();
    startScheduledBackupService();

    app.on("activate", () => {
      showMainWindow();
    });
  }).catch((error) => {
    console.error("ZynBill startup failed:", error);
    dialog.showErrorBox("ZynBill could not start", [
      error.message || "Startup failed.",
      error.cause?.message || "",
      `Database folder: ${app.getPath("userData")}`,
      "Your database has not been reset. Please retain it and any migration backups.",
    ].filter(Boolean).join("\n\n"));
    isQuitting = true;
    app.exit(1);
  });

  app.on("before-quit", () => {
    isQuitting = true;
    if (tray && !tray.isDestroyed()) {
      tray.destroy();
      tray = null;
    }
    syncService.stop();
  });

  app.on("window-all-closed", () => {
    isQuitting = true;
    if (tray && !tray.isDestroyed()) {
      tray.destroy();
      tray = null;
    }
    app.quit();
  });
}

module.exports = {
  classifyIpAddress,
  isDisallowedCloudHost,
  isLocalOrLoopbackHost,
  isAuthorizedHost,
  resolveCloudServerUrl,
  safeCloudFetch,
  createSecureLookup,
  getSecureCloudAgent
};
