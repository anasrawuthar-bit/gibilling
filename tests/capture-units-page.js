const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-units-capture-"));
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

    // Open active company and wait for shell to settle
    await window.webContents.executeJavaScript(`
      (async () => {
        const btn = document.querySelector(".open-company-button");
        const companyName = btn?.dataset?.company || "testt";
        await openCompany(companyName);
      })()
    `);
    await new Promise((r) => setTimeout(r, 1500));

    // Navigate to Items view then Units & Categories
    const navResult = await window.webContents.executeJavaScript(`
      (() => {
        showView("items");
        const btn = document.querySelector("[data-action='manage-item-masters']");
        if (btn) {
          btn.click();
          return {
            clicked: true,
            header: document.querySelector(".masters-page h1")?.textContent,
            rowCount: document.querySelectorAll("#unitsTableBody tr").length
          };
        }
        return { clicked: false };
      })()
    `);
    console.log("Navigation result:", JSON.stringify(navResult));
    await new Promise((r) => setTimeout(r, 1000));

    const visibleCheck = await window.webContents.executeJavaScript(`
      (() => {
        return {
          currentView,
          homeHidden: elements.homeView.classList.contains("hidden"),
          featureHidden: elements.featureView.classList.contains("hidden"),
          featureHTML: elements.featureView.innerHTML.substring(0, 300)
        };
      })()
    `);
    console.log("Visible check:", JSON.stringify(visibleCheck));

    const img = await window.webContents.capturePage();
    const targetFile = path.join(artifactDir, "units_and_categories_page.png");
    fs.writeFileSync(targetFile, img.toPNG());
    console.log("Captured units_and_categories_page.png (" + fs.statSync(targetFile).size + " bytes)");

    // Switch to Categories tab
    await window.webContents.executeJavaScript(`
      (() => {
        const catTab = document.querySelector("[data-masters-tab='categories']");
        if (catTab) catTab.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 600));

    const catImg = await window.webContents.capturePage();
    const catTargetFile = path.join(artifactDir, "categories_page.png");
    fs.writeFileSync(catTargetFile, catImg.toPNG());
    console.log("Captured categories_page.png (" + fs.statSync(catTargetFile).size + " bytes)");

  } catch (err) {
    console.error("Capture error:", err);
  } finally {
    if (window && !window.isDestroyed()) window.destroy();
    app.quit();
  }
});
