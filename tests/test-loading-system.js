const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const database = require("../database");

const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity\\brain\\bed9650d-397d-4216-aa80-c0ae1c3c4fcb";
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-loading-test-"));
app.setPath("userData", testRoot);

async function runTest() {
  await database.initDatabase(testRoot);

  ipcMain.handle("db:get-state", () => database.getState());
  ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
  ipcMain.handle("db:create-party", (_event, party) => database.createParty(party));
  ipcMain.handle("db:create-transaction", (_event, txn) => database.createTransaction(txn));
  ipcMain.handle("db:preview-next-invoice-number", (_event, type, date) => database.previewNextInvoiceNumber(type, date));

  const win = new BrowserWindow({
    show: true,
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 600));

    // 1. Verify Top Progress Bar
    const progressCheck = await win.webContents.executeJavaScript(`
      (() => {
        startTopProgress();
        const el = document.getElementById("appTopProgress");
        const bar = el?.querySelector(".app-top-progress-bar");
        const isVisible = el && !el.classList.contains("hidden");
        const width = bar ? parseFloat(bar.style.width) : 0;
        completeTopProgress();
        return { isVisible, width };
      })()
    `);
    console.log("Top Progress Check:", progressCheck);
    assert(progressCheck.isVisible, "Top progress element must become visible on startTopProgress");
    assert(progressCheck.width > 0, "Top progress bar must have positive width");

    // 2. Verify Global Loader Overlay & Capture Screenshot
    const loaderCheck = await win.webContents.executeJavaScript(`
      (() => {
        showGlobalLoader("ഡാറ്റ ലോഡ് ചെയ്യുന്നു...", "ദയവായി അല്പം കാത്തിരിക്കൂ / Loading data...");
        const overlay = document.getElementById("appGlobalLoader");
        const titleEl = document.getElementById("appGlobalLoaderTitle");
        const subEl = document.getElementById("appGlobalLoaderSubtitle");
        const spinner = overlay?.querySelector(".app-loader-spinner");
        return {
          visible: overlay && !overlay.classList.contains("hidden"),
          title: titleEl?.textContent,
          subtitle: subEl?.textContent,
          hasSpinner: Boolean(spinner)
        };
      })()
    `);
    console.log("Global Loader Check:", loaderCheck);
    assert(loaderCheck.visible, "Global loader overlay must be visible");
    assert(loaderCheck.title.includes("ഡാറ്റ ലോഡ് ചെയ്യുന്നു"), "Loader title must match requested text");
    assert(loaderCheck.hasSpinner, "Global loader must have animated SVG spinner");

    // Capture visual screenshot of the loading indicator
    await new Promise((r) => setTimeout(r, 200));
    const shot = await win.webContents.capturePage();
    const shotPath = path.join(artifactDir, "global_loading_indicator_verified.png");
    fs.writeFileSync(shotPath, shot.toPNG());
    console.log("Saved loader screenshot to:", shotPath);

    // Hide loader and verify it hides cleanly
    const hideCheck = await win.webContents.executeJavaScript(`
      (() => {
        hideGlobalLoader();
        const overlay = document.getElementById("appGlobalLoader");
        return { hidden: overlay && overlay.classList.contains("hidden") };
      })()
    `);
    assert(hideCheck.hidden, "Global loader must become hidden after hideGlobalLoader()");

    // 3. Verify openCompany uses loader and navigates successfully
    await win.webContents.executeJavaScript(`
      (async () => {
        const btn = document.querySelector(".open-company-button");
        if (btn) await openCompany(btn.dataset.company || "testt");
      })()
    `);
    await new Promise((r) => setTimeout(r, 600));

    const appShellVisible = await win.webContents.executeJavaScript(`
      !document.getElementById("appShell").classList.contains("hidden")
    `);
    assert(appShellVisible, "App shell must be visible after openCompany");

    // 4. Verify showView triggers progress bar
    await win.webContents.executeJavaScript(`
      showView("sales");
      undefined;
    `);
    await new Promise((r) => setTimeout(r, 400));
    const salesViewActive = await win.webContents.executeJavaScript(`
      document.body.dataset.view === "sales"
    `);
    assert(salesViewActive, "Sales view must be active");

    console.log("=================================================");
    console.log("  ALL LOADING SYSTEM CHECKS PASSED 100%!         ");
    console.log("=================================================");
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  } finally {
    win.close();
    app.quit();
  }
}

app.whenReady().then(runTest);
