const { app, BrowserWindow } = require("electron");
const path = require("path");
const assert = require("assert");
const fs = require("fs");

const testRoot = path.join(__dirname, "..", "tmp-test-wa-blurred");
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
    await new Promise((r) => setTimeout(r, 1500));

    console.log("1. Setting up WhatsApp Connect with termsAccepted = false (Blurred QR view)...");
    await win.webContents.executeJavaScript(`
      (() => {
        state.parties = [
          { id: 1, name: "anas", phone: "9048253862", balance: 10764, state: "Kerala" },
          { id: 2, name: "Beta Enterprises", phone: "9876543211", balance: 5000, state: "Kerala" }
        ];
        state.activeCompany = "testt";
        whatsappConnectState.connected = false;
        whatsappConnectState.termsAccepted = false;
        localStorage.setItem("gi-whatsapp-connect-state", JSON.stringify(whatsappConnectState));
        navigateView("whatsapp");
      })()
    `);

    // Give ample time for view transition & QR rendering
    await new Promise((r) => setTimeout(r, 1500));

    const lockedCheck = await win.webContents.executeJavaScript(`
      (() => {
        const qrContainer = document.querySelector("#waPairingQrContainer");
        const lockedWrap = qrContainer?.querySelector(".wa-pairing-qr-locked");
        const blurLayer = qrContainer?.querySelector(".wa-qr-blur-layer");
        const lockOverlay = qrContainer?.querySelector(".wa-qr-center-lock-overlay");
        const termsCheck = document.querySelector("#waTermsCheck");
        const oldGatekeeper = qrContainer?.querySelector(".wa-qr-terms-gatekeeper");

        return {
          hasLockedWrap: Boolean(lockedWrap),
          hasBlurLayer: Boolean(blurLayer),
          hasLockOverlay: Boolean(lockOverlay),
          hasOldGatekeeper: Boolean(oldGatekeeper),
          isTermsChecked: termsCheck?.checked,
          containerText: qrContainer?.textContent || ""
        };
      })()
    `);

    console.log("Locked QR check:", lockedCheck);
    assert.strictEqual(lockedCheck.hasLockedWrap, true, "Locked QR wrap must be present");
    assert.strictEqual(lockedCheck.hasBlurLayer, true, "Blur layer must be present");
    assert.strictEqual(lockedCheck.hasLockOverlay, true, "Lock overlay must be present");
    assert.strictEqual(lockedCheck.hasOldGatekeeper, false, "Old gatekeeper card must NOT be present");
    assert.strictEqual(lockedCheck.isTermsChecked, false, "Terms checkbox must be unchecked");
    assert.ok(lockedCheck.containerText.includes("QR Locked"), "Badge must say QR Locked");

    const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity\\brain\\bed9650d-397d-4216-aa80-c0ae1c3c4fcb";
    const lockedImg = await win.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "whatsapp_blurred_qr_locked_view.png"), lockedImg.toPNG());
    console.log("✓ Saved screenshot: whatsapp_blurred_qr_locked_view.png");

    console.log("2. Checking terms checkbox -> Unblurred active QR view...");
    await win.webContents.executeJavaScript(`
      (() => {
        const termsCheck = document.querySelector("#waTermsCheck");
        if (termsCheck) {
          termsCheck.checked = true;
          termsCheck.dispatchEvent(new Event("change"));
        }
      })()
    `);

    await new Promise((r) => setTimeout(r, 1500));

    const activeCheck = await win.webContents.executeJavaScript(`
      (() => {
        const qrContainer = document.querySelector("#waPairingQrContainer");
        const lockedWrap = qrContainer?.querySelector(".wa-pairing-qr-locked");
        const blurLayer = qrContainer?.querySelector(".wa-qr-blur-layer");
        const centerLogo = qrContainer?.querySelector(".wa-pairing-qr-center-logo");
        const termsCheck = document.querySelector("#waTermsCheck");

        return {
          hasLockedWrap: Boolean(lockedWrap),
          hasBlurLayer: Boolean(blurLayer),
          hasCenterLogo: Boolean(centerLogo),
          isTermsChecked: termsCheck?.checked,
          containerText: qrContainer?.textContent || ""
        };
      })()
    `);

    console.log("Active QR check:", activeCheck);
    assert.strictEqual(activeCheck.hasLockedWrap, false, "Locked wrap must be gone");
    assert.strictEqual(activeCheck.hasBlurLayer, false, "Blur layer must be gone");
    assert.strictEqual(activeCheck.hasCenterLogo, true, "WhatsApp center logo must be present");
    assert.strictEqual(activeCheck.isTermsChecked, true, "Terms checkbox must be checked");
    assert.ok(activeCheck.containerText.includes("QR Active & Ready to Scan"), "Badge must say QR Active & Ready to Scan");

    const activeImg = await win.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "whatsapp_unblurred_qr_active_view.png"), activeImg.toPNG());
    console.log("✓ Saved screenshot: whatsapp_unblurred_qr_active_view.png");

    console.log("ALL BLURRED & UNBLURRED QR CHECKS PASSED SUCCESSFULLY!");
    win.close();
    app.quit();
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  }
});
