const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity\\brain\\bed9650d-397d-4216-aa80-c0ae1c3c4fcb";

app.whenReady().then(async () => {
  let win;
  try {
    await database.initDatabase(app.getPath("userData"));
    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
    ipcMain.handle("db:update-business-settings", (_event, s) => database.updateBusinessSettings(s));

    win = new BrowserWindow({
      show: true,
      width: 1400,
      height: 980,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 1200));

    // Open Tax subtab and enable Cess
    await win.webContents.executeJavaScript(`
      if (typeof window.showView === "function") {
        window.showView("appSettings", "TAX");
      }
      setTimeout(() => {
        const cessToggle = document.querySelector("#enableCessToggle");
        if (cessToggle && !cessToggle.checked) {
          cessToggle.click();
        }
      }, 300);
    `);
    await new Promise((r) => setTimeout(r, 1000));

    // Capture Tax Settings Screen with Cess column visible
    const img1 = await win.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "tax_settings_with_cess_enabled.png"), img1.toPNG());
    console.log("✓ Saved tax_settings_with_cess_enabled.png");

    // Open Edit Tax Slab Modal for 28% to show Cess configuration
    await win.webContents.executeJavaScript(`
      const editBtn = document.querySelector('[data-edit-slab="tax_28"]');
      if (editBtn) editBtn.click();
      setTimeout(() => {
        const cessInput = document.querySelector("#taxSlabCessInput");
        if (cessInput) {
          cessInput.value = "12";
          cessInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }, 200);
    `);
    await new Promise((r) => setTimeout(r, 800));

    // Capture Modal Screen with Cess input
    const img2 = await win.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "tax_slab_modal_with_cess.png"), img2.toPNG());
    console.log("✓ Saved tax_slab_modal_with_cess.png");

    console.log("Cess screenshots captured successfully!");
  } catch (err) {
    console.error("Error during capture:", err);
  } finally {
    if (win) win.close();
    app.quit();
  }
});
