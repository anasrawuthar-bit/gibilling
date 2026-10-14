const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

async function capture() {
  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity-ide\\brain\\59e13e0d-d816-4f77-9329-31e8ac922a2b";

  try {
    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 600));

    await window.webContents.executeJavaScript(`
      (() => {
        showView("home");
        renderDashboard();
        // Seed some sample figures for visual demo
        elements.receivableTotal.textContent = "₹ 1,48,250";
        elements.payableTotal.textContent = "₹ 42,800";
        elements.saleTotal.textContent = "₹ 3,92,400";
        window.giSetPrivacyMode(false, false);
      })()
    `);
    await new Promise((r) => setTimeout(r, 500));

    // 1. Capture Dashboard with Privacy OFF
    const offImg = await window.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "dashboard_privacy_off.png"), offImg.toPNG());
    console.log("Captured dashboard_privacy_off.png");

    // 2. Enable Privacy Mode ON
    await window.webContents.executeJavaScript(`
      (() => {
        window.giSetPrivacyMode(true, false);
      })()
    `);
    await new Promise((r) => setTimeout(r, 500));

    const onImg = await window.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "dashboard_privacy_on.png"), onImg.toPNG());
    console.log("Captured dashboard_privacy_on.png");

  } catch (err) {
    console.error("Capture error:", err);
  } finally {
    window.destroy();
    app.quit();
  }
}

app.whenReady().then(capture);
