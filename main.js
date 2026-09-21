const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, shell } = require("electron");
const path = require("path");
const database = require("./database");
const { SyncService, DisabledSyncAdapter } = require("./sync-service");

let mainWindow = null;
let tray = null;
let isQuitting = false;
const syncService = new SyncService({ database, adapter: new DisabledSyncAdapter(), enabled: false });

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  console.log("GI Billing is already running. Focusing the existing instance...");
  app.quit();
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
  const window = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1040,
    minHeight: 680,
    show: true,
    center: true,
    title: "GI Billing",
    backgroundColor: "#eef3f8",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow = window;

  const revealWindow = () => {
    if (!window.isDestroyed()) {
      if (!window.isVisible()) window.show();
      window.focus();
      scheduleInputFocus(window);
    }
  };

  window.once("ready-to-show", revealWindow);
  window.webContents.once("did-finish-load", revealWindow);

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
  });

  return window;
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }

  scheduleInputFocus(mainWindow);
}

function createTrayIcon() {
  const size = 16;
  const buffer = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      if (x >= 1 && x < 15 && y >= 1 && y < 15) {
        buffer[idx] = 12;
        buffer[idx + 1] = 126;
        buffer[idx + 2] = 232;
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
    tray.setToolTip("GI Billing");
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: "Open GI Billing", click: showMainWindow },
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

function registerDatabaseHandlers() {
  ipcMain.handle("db:get-state", () => database.getState());
  ipcMain.handle("db:get-info", () => ({
    type: "SQLite",
    path: database.getDatabasePath(),
  }));
  ipcMain.handle("db:create-backup", async () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Backup GI Billing SQLite Database",
      defaultPath: path.join(app.getPath("documents"), `gi-billing-backup-${stamp}.sqlite`),
      filters: [
        { name: "SQLite Database", extensions: ["sqlite", "db"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
    if (result.canceled || !result.filePath) return null;
    return database.backupTo(result.filePath);
  });
  ipcMain.handle("db:restore-backup", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: "Select GI Billing Backup to Restore",
      properties: ["openFile"],
      filters: [
        { name: "SQLite Database", extensions: ["sqlite", "db"] },
        { name: "All Files", extensions: ["*"] },
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
        { label: `About GI Billing v${app.getVersion()}`, enabled: false },
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

if (singleInstanceLock) {
  app.on("second-instance", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    } else {
      createMainWindow();
    }
  });

  app.whenReady().then(async () => {
    await database.initDatabase(app.getPath("userData"));
    registerDatabaseHandlers();
    createMenu();
    createTray();
    createMainWindow();
    syncService.start();

    app.on("activate", () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        createMainWindow();
      } else {
        if (mainWindow.isMinimized()) mainWindow.restore();
        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.focus();
      }
    });
  }).catch((error) => {
    console.error("GI Billing startup failed:", error);
    dialog.showErrorBox("GI Billing could not start", [
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
    syncService.stop();
  });

  app.on("window-all-closed", () => {
    isQuitting = true;
    app.quit();
  });
}
