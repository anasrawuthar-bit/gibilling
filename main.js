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

function parseIpv6ToWords(ipStr) {
  if (!ipStr || typeof ipStr !== "string") return null;
  let s = ipStr.trim().toLowerCase();
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  if (!net.isIPv6(s)) return null;

  // Handle embedded dotted-decimal IPv4 in IPv6 (e.g. ::ffff:192.168.1.1)
  const lastColon = s.lastIndexOf(":");
  const tail = s.slice(lastColon + 1);
  if (tail.includes(".")) {
    const parts = tail.split(".").map(Number);
    if (parts.length === 4 && parts.every(n => Number.isInteger(n) && n >= 0 && n <= 255)) {
      const w6 = ((parts[0] << 8) | parts[1]).toString(16);
      const w7 = ((parts[2] << 8) | parts[3]).toString(16);
      s = s.slice(0, lastColon) + ":" + w6 + ":" + w7;
    } else {
      return null;
    }
  }

  const halves = s.split("::");
  if (halves.length > 2) return null;

  let words = [];
  if (halves.length === 2) {
    const left = halves[0] ? halves[0].split(":").map(h => parseInt(h, 16)) : [];
    const right = halves[1] ? halves[1].split(":").map(h => parseInt(h, 16)) : [];
    const missing = 8 - (left.length + right.length);
    if (missing < 0) return null;
    words = [...left, ...new Array(missing).fill(0), ...right];
  } else {
    words = s.split(":").map(h => parseInt(h, 16));
  }

  if (words.length !== 8 || words.some(w => isNaN(w) || w < 0 || w > 0xffff)) {
    return null;
  }
  return words;
}

function classifyIpAddress(ip) {
  if (!ip || typeof ip !== "string") return { isIp: false };
  let raw = ip.trim().toLowerCase();
  if (raw.startsWith("[") && raw.endsWith("]")) raw = raw.slice(1, -1);
  if (!net.isIP(raw)) return { isIp: false };

  // IPv6 & IPv4-Mapped IPv6 processing
  if (net.isIPv6(raw)) {
    const words = parseIpv6ToWords(raw);
    if (!words) return { isIp: true, version: 6, isDisallowed: true, isNonPublic: true };

    // Detect embedded IPv4 across all standard representations:
    // 1. Standard IPv4-mapped IPv6 (::ffff:0:0/96, RFC 4291)
    // 2. Stateless IP/ICMP Translation SIIT (::ffff:0:0:0/96, RFC 2765)
    // 3. Deprecated IPv4-compatible IPv6 (::0:0/96, RFC 4291)
    // 4. NAT64 Well-Known Prefix (64:ff9b::/96, RFC 6052)
    const isStandardMapped = words[0] === 0 && words[1] === 0 && words[2] === 0 && words[3] === 0 && words[4] === 0 && words[5] === 0xffff;
    const isSiitMapped = words[0] === 0 && words[1] === 0 && words[2] === 0 && words[3] === 0 && words[4] === 0xffff && words[5] === 0;
    const isNat64Mapped = words[0] === 0x0064 && words[1] === 0xff9b && words[2] === 0 && words[3] === 0 && words[4] === 0 && words[5] === 0;
    const isCompatible = words[0] === 0 && words[1] === 0 && words[2] === 0 && words[3] === 0 && words[4] === 0 && words[5] === 0 && !(words[6] === 0 && (words[7] === 0 || words[7] === 1));

    if (isStandardMapped || isSiitMapped || isNat64Mapped || isCompatible) {
      const b1 = (words[6] >> 8) & 0xff;
      const b2 = words[6] & 0xff;
      const b3 = (words[7] >> 8) & 0xff;
      const b4 = words[7] & 0xff;
      const embeddedIpv4 = `${b1}.${b2}.${b3}.${b4}`;
      const v4Class = classifyIpAddress(embeddedIpv4);
      return {
        ...v4Class,
        isIpv4Mapped: true,
        version: 6,
        originalIp: raw,
        embeddedIpv4
      };
    }

    // 5. 6to4 Anycast prefix (2002::/16, RFC 3056, deprecated by RFC 7526)
    if (words[0] === 0x2002) {
      const b1 = (words[1] >> 8) & 0xff;
      const b2 = words[1] & 0xff;
      const b3 = (words[2] >> 8) & 0xff;
      const b4 = words[2] & 0xff;
      const embeddedIpv4 = `${b1}.${b2}.${b3}.${b4}`;
      const v4Class = classifyIpAddress(embeddedIpv4);
      return {
        ...v4Class,
        is6to4: true,
        isReserved: true,
        version: 6,
        originalIp: raw,
        embeddedIpv4,
        isDisallowed: true
      };
    }

    // Pure IPv6 classification via word inspection against IANA Special-Purpose Registry
    const isLoopback = words[0] === 0 && words[1] === 0 && words[2] === 0 && words[3] === 0 && words[4] === 0 && words[5] === 0 && words[6] === 0 && words[7] === 1; // ::1/128 (RFC 4291)
    const isUnspecified = words.every(w => w === 0); // ::/128 (RFC 4291)
    const isLinkLocal = (words[0] & 0xffc0) === 0xfe80; // fe80::/10 (RFC 4291)
    const isSiteLocal = (words[0] & 0xffc0) === 0xfec0; // fec0::/10 (deprecated RFC 3879)
    const isUniqueLocal = (words[0] & 0xfe00) === 0xfc00; // fc00::/7 (RFC 4193 ULA, fc00-fdff)
    const isMulticast = (words[0] & 0xff00) === 0xff00; // ff00::/8 (RFC 4291)
    const isDocumentation =
      (words[0] === 0x2001 && words[1] === 0x0db8) || // 2001:db8::/32 (RFC 3849)
      (words[0] === 0x3fff && (words[1] & 0xf000) === 0x0000); // 3fff::/20 (RFC 9637)
    const isBenchmark = (words[0] === 0x2001 && words[1] === 0x0002); // 2001:2::/48 (RFC 5180)
    const isDiscardOrDummy = (words[0] === 0x0100 && words[1] === 0 && words[2] === 0 && (words[3] === 0 || words[3] === 1)); // 100::/64 (RFC 6666) & 100:0:0:1::/64 (Dummy Prefix)
    const isOrchid = (words[0] === 0x2001 && ((words[1] & 0xfff0) === 0x0010 || (words[1] & 0xfff0) === 0x0020)); // 2001:10::/28 & 2001:20::/28 (RFC 4843 & RFC 7343)
    const isLocalNat64 = (words[0] === 0x0064 && words[1] === 0xff9b && words[2] === 0x0001); // 64:ff9b:1::/48 (RFC 8215)
    const isAs112 = (words[0] === 0x2001 && words[1] === 0x0004 && words[2] === 0x0112); // 2001:4:112::/48 (RFC 7535)
    const is6to4 = words[0] === 0x2002; // 2002::/16 (RFC 3056, deprecated RFC 7526)
    // Non-GUA addresses outside 2000::/3 that are not ULA, link-local, multicast, loopback, or unspecified
    const isNonGuaReserved = (words[0] & 0xe000) !== 0x2000 && !isUniqueLocal && !isLinkLocal && !isMulticast && !isLoopback && !isUnspecified;

    const isReserved = isDiscardOrDummy || isOrchid || isLocalNat64 || isAs112 || is6to4 || isSiteLocal || isNonGuaReserved;
    const isNonPublic = isUniqueLocal || isLoopback || isLinkLocal || isSiteLocal || isDocumentation || isBenchmark || isMulticast || isUnspecified || isReserved;
    const isDisallowed = isLinkLocal || isMulticast || isUnspecified || isDocumentation || isBenchmark || isReserved;

    return {
      isIp: true,
      version: 6,
      isLoopback,
      isLinkLocal,
      isPrivate: isUniqueLocal || isSiteLocal,
      isCarrierNat: false,
      isMulticast,
      isDocumentation,
      isBenchmark,
      isReserved,
      isUnspecified,
      isNonPublic,
      isDisallowed
    };
  }

  // IPv4
  const [o1, o2, o3, o4] = raw.split(".").map(Number);
  const isLoopback = o1 === 127;
  const isLinkLocal = o1 === 169 && o2 === 254; // Link-local & cloud metadata (169.254.169.254, RFC 3927)
  const isPrivate =
    o1 === 10 ||
    (o1 === 172 && o2 >= 16 && o2 <= 31) ||
    (o1 === 192 && o2 === 168);
  const isCarrierNat = o1 === 100 && o2 >= 64 && o2 <= 127;
  const isMulticast = o1 >= 224 && o1 <= 239;
  const isIetfProtocol = o1 === 192 && o2 === 0 && o3 === 0; // 192.0.0.0/24 (RFC 6890)
  const is6to4Relay = o1 === 192 && o2 === 88 && o3 === 99; // 192.88.99.0/24 (RFC 7526, deprecated)
  const isReserved = (o1 >= 240 && o1 <= 255 && raw !== "255.255.255.255") || isIetfProtocol || is6to4Relay;
  const isUnspecified = o1 === 0 || raw === "255.255.255.255";
  const isDocumentation =
    (o1 === 192 && o2 === 0 && o3 === 2) || // TEST-NET-1 (192.0.2.0/24, RFC 5737)
    (o1 === 198 && o2 === 51 && o3 === 100) || // TEST-NET-2 (198.51.100.0/24, RFC 5737)
    (o1 === 203 && o2 === 0 && o3 === 113); // TEST-NET-3 (203.0.113.0/24, RFC 5737)
  const isBenchmark = o1 === 198 && (o2 === 18 || o2 === 19); // 198.18.0.0/15 (RFC 2544)

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
    isDocumentation,
    isBenchmark,
    isReserved,
    isUnspecified,
    isNonPublic,
    isDisallowed
  };
}

function ipMatchesCidr(ip, cidr) {
  if (!ip || !cidr || !cidr.includes("/")) return false;
  const [rangeIp, prefixLenStr] = cidr.split("/");
  const prefixLen = parseInt(prefixLenStr, 10);
  if (isNaN(prefixLen) || prefixLen < 0 || prefixLen > 32) return false;
  if (!net.isIPv4(ip) || !net.isIPv4(rangeIp)) return false;

  const ipToInt = (addr) => addr.split(".").reduce((acc, oct) => ((acc << 8) | parseInt(oct, 10)) >>> 0, 0);
  const mask = prefixLen === 0 ? 0 : (~((1 << (32 - prefixLen)) - 1)) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(rangeIp) & mask);
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
  const normIp = (ip || "").toLowerCase().trim();
  const isProduction = (typeof app !== "undefined" && app && app.isPackaged) || process.env.NODE_ENV === "production";

  // Destination IP security validation: metadata, link-local, multicast can NEVER be authorized
  if (normIp) {
    const ipClass = classifyIpAddress(normIp);
    if (ipClass.isIp && ipClass.isDisallowed) {
      return false;
    }
  }

  const isLoopbackHost = normHost === "localhost" || normHost === "127.0.0.1" || normHost === "::1" || normHost === "[::1]";

  // In non-production (dev/test): localhost and loopback are authorized
  if (!isProduction && isLoopbackHost) {
    return true;
  }

  // Parse TRUSTED_LAN_HOSTS from env or config (comma-separated list of approved hostnames, IPs, or host:ip pairs)
  const trustedRaw = process.env.TRUSTED_LAN_HOSTS || (typeof syncConfig !== "undefined" ? syncConfig.trustedLanHosts : "") || "";
  const trustedList = trustedRaw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

  // If in production and connecting to loopback: requires explicit loopback authorization
  const isLoopbackIp = normIp && (normIp === "127.0.0.1" || normIp === "::1" || normIp.startsWith("127."));
  if (process.env.ALLOW_LOOPBACK_IN_PRODUCTION === "true" && (isLoopbackHost || isLoopbackIp)) {
    return true;
  }

  if (trustedList.length === 0) {
    return false;
  }

  // Separate trusted hostnames, trusted IPs/CIDRs, and explicit host:ip bindings
  const trustedHostnames = new Set();
  const trustedIps = new Set();
  const hostBindings = new Map();

  for (const item of trustedList) {
    if (item.includes("=") || (item.includes(":") && !item.includes("::"))) {
      const sep = item.includes("=") ? "=" : ":";
      const [h, i] = item.split(sep).map(x => x.trim());
      if (h && i) {
        trustedHostnames.add(h);
        hostBindings.set(h, i);
        trustedIps.add(i);
      }
    } else {
      const ipCheck = classifyIpAddress(item);
      if (ipCheck.isIp || item.includes("/")) {
        trustedIps.add(item);
      } else {
        trustedHostnames.add(item);
      }
    }
  }

  // If target hostname is an IP literal
  const hostIpCheck = classifyIpAddress(normHost);
  if (hostIpCheck.isIp) {
    if (trustedIps.has(normHost)) return true;
    for (const tIp of trustedIps) {
      if (tIp.includes("/") && ipMatchesCidr(normHost, tIp)) return true;
    }
    return false;
  }

  // Target is a domain name: verify hostname is in allowlist
  if (!trustedHostnames.has(normHost)) {
    return false;
  }

  // If no resolved IP was passed (pre-DNS check in resolveCloudServerUrl), hostname is an authorized LAN candidate
  if (!normIp) {
    return true;
  }

  // Post-DNS check: validate the actual resolved destination IP against trusted policy
  if (hostBindings.has(normHost)) {
    return hostBindings.get(normHost) === normIp;
  }

  if (trustedIps.size > 0) {
    if (trustedIps.has(normIp)) return true;
    for (const tIp of trustedIps) {
      if (tIp.includes("/") && ipMatchesCidr(normIp, tIp)) return true;
    }
    // Hostname was allowlisted, but resolves to an unauthorized IP!
    return false;
  }

  // If only hostnames were defined without explicit IPs, the resolved IP must be a valid private LAN IP
  const destIpInfo = classifyIpAddress(normIp);
  if (normHost === "localhost" && destIpInfo.isLoopback) {
    return true;
  }
  return destIpInfo.isIp && (destIpInfo.isPrivate || destIpInfo.isCarrierNat) && !destIpInfo.isLoopback && !destIpInfo.isDisallowed;
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
    // Enforce HTTPS in production:
    // In production, remote public hosts MUST use HTTPS unconditionally.
    // Plain HTTP is ONLY permitted for loopback or explicitly authorized trusted LAN hosts.
    // ALLOW_INSECURE_HTTP cannot bypass HTTPS for remote public hosts in production.
    const isProduction = (typeof app !== "undefined" && app && app.isPackaged) || process.env.NODE_ENV === "production";
    if (isProduction && parsed.protocol === "http:" && !isLocalOrLoopbackHost(parsed.hostname)) {
      const isAuthorizedLan = isAuthorizedHost(parsed.hostname);
      if (!isAuthorizedLan) {
        console.warn(`[SECURITY] Insecure HTTP prohibited for remote host ${parsed.hostname} in production. Upgraded to https://`);
        parsed.protocol = "https:";
      }
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

    // Defensive Dispatcher Validation: Always enforce the secure connection-pinned agent
    // to prevent callers from supplying an unvalidated dispatcher and bypassing SSRF security controls.
    const dispatcher = getSecureCloudAgent();

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
  parseIpv6ToWords,
  ipMatchesCidr,
  classifyIpAddress,
  isDisallowedCloudHost,
  isLocalOrLoopbackHost,
  isAuthorizedHost,
  resolveCloudServerUrl,
  safeCloudFetch,
  createSecureLookup,
  getSecureCloudAgent
};
