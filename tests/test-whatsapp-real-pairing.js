const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const assert = require("assert");

const testRoot = path.join(__dirname, "..", "tmp-test-wa-pairing");
if (!fs.existsSync(testRoot)) fs.mkdirSync(testRoot, { recursive: true });
app.setPath("userData", testRoot);

const { whatsappService } = require("../whatsapp-service");

app.whenReady().then(async () => {
  let mainWindow = null;

  const win = new BrowserWindow({
    width: 1366,
    height: 768,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow = win;
  whatsappService.init({
    app,
    ipcMain,
    getMainWindow: () => mainWindow,
  });

  try {
    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 1200));

    console.log("App loaded. Checking WhatsApp APIs exposed on window.giApp...");
    const apisCheck = await win.webContents.executeJavaScript(`
      (() => ({
        hasGetStatus: typeof window.giApp.whatsappGetStatus === 'function',
        hasStartSession: typeof window.giApp.whatsappStartSession === 'function',
        hasDisconnect: typeof window.giApp.whatsappDisconnect === 'function',
        hasSendMessage: typeof window.giApp.whatsappSendMessage === 'function',
        hasOnStatusChange: typeof window.giApp.onWhatsAppStatusChange === 'function',
      }))()
    `);
    console.log("APIs check result:", apisCheck);
    assert(apisCheck.hasGetStatus, "whatsappGetStatus must be exposed");
    assert(apisCheck.hasStartSession, "whatsappStartSession must be exposed");
    assert(apisCheck.hasDisconnect, "whatsappDisconnect must be exposed");
    assert(apisCheck.hasSendMessage, "whatsappSendMessage must be exposed");
    assert(apisCheck.hasOnStatusChange, "onWhatsAppStatusChange must be exposed");

    console.log("Navigating to WhatsApp Connect view...");
    await win.webContents.executeJavaScript(`showView("whatsapp")`);
    await new Promise((r) => setTimeout(r, 600));

    // Accept terms to unblur QR
    await win.webContents.executeJavaScript(`
      (() => {
        const check = document.querySelector('#waTermsCheck');
        if (check) {
          check.checked = true;
          check.dispatchEvent(new Event('change'));
        }
      })()
    `);

    console.log("Waiting for Baileys to connect to WhatsApp Web and emit real QR token...");
    let realQrReceived = false;
    let qrImgSrc = "";

    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const qrCheck = await win.webContents.executeJavaScript(`
        (() => {
          const container = document.querySelector('#waPairingQrContainer');
          const img = container ? container.querySelector('img') : null;
          return {
            hasImg: Boolean(img),
            src: img ? img.src.slice(0, 40) : null,
            fullSrcLength: img ? img.src.length : 0,
            hasSpinner: Boolean(container && container.querySelector('.inline-spinner')),
            containerHtml: container ? container.innerHTML.slice(0, 100) : ''
          };
        })()
      `);

      if (qrCheck.hasImg && qrCheck.src && qrCheck.src.startsWith("data:image/png;base64")) {
        realQrReceived = true;
        qrImgSrc = qrCheck.src;
        console.log("✓ Real live WhatsApp QR code rendered into UI! (Length: " + qrCheck.fullSrcLength + ")");
        break;
      }
    }

    assert(realQrReceived, "Baileys must receive real QR and display base64 image in UI");

    // Capture screenshot of real unblurred QR code pairing screen
    const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity\\brain\\bed9650d-397d-4216-aa80-c0ae1c3c4fcb";
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "whatsapp_real_baileys_qr_screen.png"), img.toPNG());
    console.log("✓ Saved screenshot: whatsapp_real_baileys_qr_screen.png");

    console.log("Cleaning up WhatsApp session...");
    await whatsappService.disconnect();

    console.log("=================================================");
    console.log("REAL BAILEYS WHATSAPP QR INTEGRATION PASSED 100%!");
    console.log("=================================================");
    app.exit(0);
  } catch (err) {
    console.error("Test failed:", err);
    try { await whatsappService.disconnect(); } catch (_) {}
    app.exit(1);
  }
});
