const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity\\brain\\bed9650d-397d-4216-aa80-c0ae1c3c4fcb";

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    width: 1366,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  try {
    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 2000));

    // 1. WhatsApp Gatekeeper View (Terms Not Accepted)
    console.log("Navigating to WhatsApp Connect with terms unaccepted...");
    await window.webContents.executeJavaScript(`
      new Promise((resolve) => {
        localStorage.setItem("gi-whatsapp-connect-state", JSON.stringify({
          connected: false,
          termsAccepted: false
        }));
        whatsappConnectState = loadWhatsAppConnectState();
        const btn = document.querySelector('[data-view="whatsapp"]');
        if (btn) btn.click();
        const interval = setInterval(() => {
          if (document.body.dataset.view === "whatsapp" && elements.featureView && !elements.featureView.classList.contains("hidden")) {
            clearInterval(interval);
            resolve();
          }
        }, 100);
        setTimeout(resolve, 4000);
      })
    `);
    await new Promise((r) => setTimeout(r, 800));
    console.log("Capturing 1: whatsapp_terms_gatekeeper_view.png...");
    const img1 = await window.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "whatsapp_terms_gatekeeper_view.png"), img1.toPNG());
    console.log("  ✓ Captured whatsapp_terms_gatekeeper_view.png");

    // 2. Standard Usage Terms Modal
    console.log("Opening Terms modal...");
    await window.webContents.executeJavaScript(`
      (() => {
        openWhatsAppUsageTermsModal(() => {});
      })()
    `);
    await new Promise((r) => setTimeout(r, 1000));
    console.log("Capturing 2: whatsapp_standard_usage_terms_modal.png...");
    const img2 = await window.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "whatsapp_standard_usage_terms_modal.png"), img2.toPNG());
    console.log("  ✓ Captured whatsapp_standard_usage_terms_modal.png");

    // 3. Accept Terms & Active QR + Direct Desktop Panel (Modal closed)
    console.log("Accepting terms and rendering active QR...");
    await window.webContents.executeJavaScript(`
      (() => {
        document.getElementById("waUsageTermsModalBackdrop")?.remove();
        const tc = elements.featureView.querySelector("#waTermsCheck");
        if (tc) tc.checked = true;
        whatsappConnectState.termsAccepted = true;
        saveWhatsAppConnectState();
        renderWhatsAppPairingQr();
      })()
    `);
    await new Promise((r) => setTimeout(r, 1200));
    console.log("Capturing 3: whatsapp_qr_active_and_direct_desktop.png...");
    const img3 = await window.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "whatsapp_qr_active_and_direct_desktop.png"), img3.toPNG());
    console.log("  ✓ Captured whatsapp_qr_active_and_direct_desktop.png");

    // 4. Verification Modal (Link Device & Start Messaging clicked)
    console.log("Opening verification modal...");
    await window.webContents.executeJavaScript(`
      (() => {
        openWhatsAppPairingVerificationModal({
          onConfirmLink: () => {},
          onUseDesktop: () => {}
        });
      })()
    `);
    await new Promise((r) => setTimeout(r, 1000));
    console.log("Capturing 4: whatsapp_pairing_verification_modal.png...");
    const img4 = await window.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "whatsapp_pairing_verification_modal.png"), img4.toPNG());
    console.log("  ✓ Captured whatsapp_pairing_verification_modal.png");

    console.log("ALL 4 SCREENSHOTS CAPTURED SUCCESSFULLY!");
  } catch (err) {
    console.error("Capture failed:", err);
  } finally {
    if (window && !window.isDestroyed()) window.destroy();
    app.quit();
  }
});
