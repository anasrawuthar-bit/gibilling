const { app, BrowserWindow } = require("electron");
const path = require("path");
const assert = require("assert");
const fs = require("fs");

const testRoot = path.join(__dirname, "..", "tmp-test-wa-clean");
if (!fs.existsSync(testRoot)) fs.mkdirSync(testRoot, { recursive: true });
app.setPath("userData", testRoot);

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      width: 1366,
      height: 820,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 1200));

    console.log("Navigating to WhatsApp Connect workspace...");
    await win.webContents.executeJavaScript(`
      (() => {
        state.parties = [
          { id: 1, name: "anas", phone: "9048253862", balance: 10764, state: "Kerala" },
          { id: 2, name: "Beta Enterprises", phone: "9876543211", balance: 5000, state: "Kerala" }
        ];
        state.activeCompany = "testt";
        whatsappConnectState.connected = false;
        whatsappConnectState.termsAccepted = true; // active QR
        showView("whatsapp");
      })()
    `);

    await new Promise((r) => setTimeout(r, 1000));

    const check = await win.webContents.executeJavaScript(`
      (() => {
        const directPanel = document.querySelector("#waDirectDesktopPanel");
        const linkBtn = document.querySelector('[data-wa-action="connect"]');
        const termsCheck = document.querySelector("#waTermsCheck");
        const qrContainer = document.querySelector("#waPairingQrContainer");
        const hasSvgQr = Boolean(qrContainer?.querySelector("svg"));
        const pageText = document.body.textContent;

        return {
          hasDirectPanel: Boolean(directPanel),
          hasDesktopTitle: pageText.includes("Send via System WhatsApp Desktop (No QR Required)"),
          hasLinkBtn: Boolean(linkBtn),
          hasTermsCheck: Boolean(termsCheck),
          isTermsChecked: termsCheck?.checked,
          hasSvgQr
        };
      })()
    `);

    console.log("Clean WhatsApp Connect Check:", check);

    assert.strictEqual(check.hasDirectPanel, false, "Direct desktop panel must NOT be present");
    assert.strictEqual(check.hasDesktopTitle, false, "Text 'Send via System WhatsApp Desktop (No QR Required)' must be gone");
    assert.strictEqual(check.hasLinkBtn, true, "Link Device button must be present");
    assert.strictEqual(check.hasTermsCheck, true, "Terms checkbox must be present");
    assert.strictEqual(check.hasSvgQr, true, "QR code must be rendered");
    console.log("✓ SUCCESS: WhatsApp Connect view is clean, focused, and free of the desktop panel!");

    // Capture screenshot
    const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity\\brain\\bed9650d-397d-4216-aa80-c0ae1c3c4fcb";
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "whatsapp_connect_clean_pairing_screen.png"), img.toPNG());
    console.log("✓ Saved screenshot: whatsapp_connect_clean_pairing_screen.png");

    win.destroy();
    app.quit();
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  }
});
