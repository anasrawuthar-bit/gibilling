const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-item-unit-capture-"));
app.setPath("userData", testRoot);

const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity-ide\\brain\\59e13e0d-d816-4f77-9329-31e8ac922a2b";

app.whenReady().then(async () => {
  let window;
  try {
    await database.initDatabase(testRoot);

    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
    ipcMain.handle("db:create-unit", (_event, unit) => database.createUnit(unit));
    ipcMain.handle("db:update-unit", (_event, unit) => database.updateUnit(unit));
    ipcMain.handle("db:delete-unit", (_event, payload) => database.deleteUnit(payload));
    ipcMain.handle("db:toggle-unit-active", (_event, payload) => database.toggleUnitActive(payload));
    ipcMain.handle("db:create-item-category", (_event, cat) => database.createItemCategory(cat));
    ipcMain.handle("db:update-item-category", (_event, cat) => database.updateItemCategory(cat));
    ipcMain.handle("db:delete-item-category", (_event, payload) => database.deleteItemCategory(payload));
    ipcMain.handle("db:toggle-item-category-active", (_event, payload) => database.toggleItemCategoryActive(payload));

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

    // Open active company
    await window.webContents.executeJavaScript(`
      (async () => {
        const btn = document.querySelector(".open-company-button");
        const companyName = btn?.dataset?.company || "testt";
        await openCompany(companyName);
      })()
    `);
    await new Promise((r) => setTimeout(r, 1200));

    // Open Add Item modal
    await window.webContents.executeJavaScript(`
      (() => {
        showView("items");
        openEntryModal("item");
      })()
    `);
    await new Promise((r) => setTimeout(r, 800));

    // Capture Add Item modal with Unit select
    const itemImg = await window.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "item_modal_unit_select.png"), itemImg.toPNG());
    console.log("Captured item_modal_unit_select.png");

    // Click '+' next to Unit
    await window.webContents.executeJavaScript(`
      (() => {
        const plusBtn = document.querySelector("[data-action='quick-add-unit']");
        if (plusBtn) plusBtn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 800));

    // Capture rich Add Unit dialog
    const quickAddImg = await window.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "item_modal_quick_add_dialog.png"), quickAddImg.toPNG());
    console.log("Captured item_modal_quick_add_dialog.png");

  } catch (err) {
    console.error("Capture error:", err);
  } finally {
    if (window && !window.isDestroyed()) window.destroy();
    app.quit();
  }
});
