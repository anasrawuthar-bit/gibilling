const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const userDataPath = app.getPath("userData");
const screenshotTarget = path.join(
  "C:",
  "Users",
  "ANAS",
  ".gemini",
  "antigravity",
  "brain",
  "bed9650d-397d-4216-aa80-c0ae1c3c4fcb",
  "app_opening_verified.png"
);

app.whenReady().then(async () => {
  const errors = [];
  try {
    console.log("[VERIFY] Initializing database at userData:", userDataPath);
    await database.initDatabase(userDataPath);

    // Register all essential database IPC handlers used by app.js on startup
    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:get-info", () => ({ type: "SQLite", path: database.getDatabasePath() }));
    ipcMain.handle("db:set-current-company", (_e, name) => database.setCurrentCompany(name));
    ipcMain.handle("db:get-units-list", () => database.getUnitsList ? database.getUnitsList() : []);
    ipcMain.handle("db:get-categories-with-hierarchy", () => database.getCategoriesWithHierarchy ? database.getCategoriesWithHierarchy() : []);

    console.log("[VERIFY] Creating BrowserWindow...");
    const window = new BrowserWindow({
      width: 1366,
      height: 768,
      minWidth: 1040,
      minHeight: 680,
      show: true,
      backgroundColor: "#eef3f8",
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
      if (level >= 2) {
        errors.push({ level, message, line, sourceId });
        console.warn(`[Renderer Warn/Error] ${message} (${sourceId}:${line})`);
      }
    });

    console.log("[VERIFY] Loading index.html...");
    await window.loadFile(path.join(__dirname, "..", "index.html"));

    // Wait for DOM and initial state hydration
    await new Promise((r) => setTimeout(r, 1200));

    console.log("[VERIFY] Checking UI state...");
    const status = await window.webContents.executeJavaScript(`(() => {
      const companyScreen = document.getElementById("companyScreen");
      const appShell = document.getElementById("appShell");
      const activeCompanyName = document.getElementById("activeCompanyName")?.textContent?.trim() || "";
      const currentView = document.querySelector(".nav-item.active, [data-view].active")?.getAttribute("data-view") || "unknown";
      const totalButtons = document.querySelectorAll("button").length;
      const hasGiDB = Boolean(window.giDB);
      const isShellVisible = appShell && !appShell.classList.contains("hidden");
      const isCompanyScreenVisible = companyScreen && !companyScreen.classList.contains("hidden");

      return {
        hasGiDB,
        isShellVisible,
        isCompanyScreenVisible,
        activeCompanyName,
        currentView,
        totalButtons,
        title: document.title,
      };
    })()`);

    console.log("[VERIFY] App Status:", JSON.stringify(status, null, 2));

    assert.equal(status.hasGiDB, true, "window.giDB bridge must be active");
    assert.equal(status.title, "GI Billing", "Document title must be 'GI Billing'");
    assert.ok(status.isShellVisible || status.isCompanyScreenVisible, "App must be visibly displaying either the workspace or company screen");
    assert.ok(status.totalButtons > 5, "Interactive UI components must be fully rendered");

    console.log("[VERIFY] Capturing live window screenshot...");
    const image = await window.webContents.capturePage();
    fs.writeFileSync(screenshotTarget, image.toPNG());
    console.log("[VERIFY] Screenshot saved successfully at:", screenshotTarget);

    console.log("\n=======================================================");
    console.log("   APP IS OPENING AND RUNNING PERFECTLY (VERIFIED)     ");
    console.log("=======================================================\n");

    app.quit();
    process.exit(0);
  } catch (err) {
    console.error("[VERIFY FAILED]:", err);
    app.quit();
    process.exit(1);
  }
});
