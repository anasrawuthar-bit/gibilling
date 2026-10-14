const { app, BrowserWindow } = require("electron");
const path = require("path");

async function checkBarcode() {
  const window = new BrowserWindow({
    show: false,
    width: 1366,
    height: 840,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  const consoleLogs = [];
  const consoleErrors = [];

  window.webContents.on("console-message", (event, level, message, line, sourceId) => {
    if (level >= 2 || message.toLowerCase().includes("error") || message.toLowerCase().includes("uncaught")) {
      consoleErrors.push({ level, message, line, sourceId });
    } else {
      consoleLogs.push(message);
    }
  });

  try {
    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 1500));

    const result = await window.webContents.executeJavaScript(`
      (async () => {
        try {
          showView("barcodeGenerator");
          await new Promise(r => setTimeout(r, 500));
          const fv = elements.featureView;
          const isHidden = fv.classList.contains("hidden");
          const htmlSnippet = fv.innerHTML.slice(0, 300);
          const title = fv.querySelector("h1")?.textContent;
          const barcodeLayout = fv.querySelector(".barcode-layout");
          return {
            success: true,
            currentView,
            isHidden,
            title,
            hasBarcodeLayout: Boolean(barcodeLayout),
            htmlLength: fv.innerHTML.length,
            htmlSnippet
          };
        } catch (err) {
          return {
            success: false,
            error: err.message,
            stack: err.stack
          };
        }
      })()
    `);

    console.log("Barcode Navigation Result:", JSON.stringify(result, null, 2));
    console.log("Console Errors:", JSON.stringify(consoleErrors, null, 2));
  } catch (e) {
    console.error("Test failed:", e);
  } finally {
    window.destroy();
    app.quit();
  }
}

app.whenReady().then(checkBarcode);
