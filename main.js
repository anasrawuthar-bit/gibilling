const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const database = require("./database");
const { SyncService, DisabledSyncAdapter } = require("./sync-service");

let mainWindow = null;
let tray = null;
let isQuitting = false;
const syncService = new SyncService({ database, adapter: new DisabledSyncAdapter(), enabled: false });

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  console.log("ZynBill is already running. Focusing the existing instance...");
  app.exit(0);
}

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
    show: true,
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

  window.setMenuBarVisibility(false);
  mainWindow = window;

  let revealed = false;
  const revealWindow = () => {
    if (revealed || window.isDestroyed()) return;
    revealed = true;
    if (window.isMinimized()) window.restore();
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

function registerDatabaseHandlers() {
  ipcMain.handle("app:get-version", () => app.getVersion());
  ipcMain.handle("db:get-state", () => database.getState());
  ipcMain.handle("db:get-info", () => ({
    type: "SQLite",
    path: database.getDatabasePath(),
    version: app.getVersion(),
  }));
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
  ipcMain.handle("db:preview-next-invoice-number", (_event, type, docDate) => database.previewNextInvoiceNumber(type, docDate));
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
    if (typeof url === "string" && (url.startsWith("https://wa.me/") || url.startsWith("https://web.whatsapp.com/") || url.startsWith("whatsapp://"))) {
      await shell.openExternal(url);
      return { success: true };
    }
    return { success: false, error: "Invalid WhatsApp URL format." };
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

if (singleInstanceLock) {
  app.on("second-instance", () => {
    showMainWindow();
  });

  app.whenReady().then(async () => {
    await database.initDatabase(app.getPath("userData"));
    registerDatabaseHandlers();
    createMenu();
    createTray();
    createMainWindow();
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
