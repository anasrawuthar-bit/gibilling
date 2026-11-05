const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-wa-terms-test-"));
app.setPath("userData", testRoot);

app.whenReady().then(async () => {
  let window;
  try {
    await database.initDatabase(testRoot);

    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
    ipcMain.handle("db:update-business-settings", (_event, s) => database.updateBusinessSettings(s));
    ipcMain.handle("app:generate-qr-svg", async (_event, { text, options = {} } = {}) => {
      try {
        if (!text || typeof text !== "string") {
          return { success: false, error: "Text string is required for QR code generation." };
        }
        const QRCode = require("qrcode");
        const svg = await QRCode.toString(text, {
          type: "svg",
          margin: options.margin !== undefined ? options.margin : 1,
          errorCorrectionLevel: options.errorCorrectionLevel || "M",
          color: {
            dark: options.darkColor || "#000000",
            light: options.lightColor || "#ffffff",
          },
        });
        return { success: true, svg };
      } catch (err) {
        return { success: false, error: err.message || "Failed to generate QR code SVG." };
      }
    });

    window = new BrowserWindow({
      show: false,
      width: 1280,
      height: 850,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    window.webContents.on("console-message", (_event, _level, message) => console.log("[Renderer]", message));

    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 600));

    console.log("Test 1: Verify phone normalization and professional message formatters...");
    const formattersCheck = await window.webContents.executeJavaScript(`
      (() => {
        const p1 = formatWhatsAppPhoneNumber("9846515684");
        const p2 = formatWhatsAppPhoneNumber("09846515684");
        const p3 = formatWhatsAppPhoneNumber("+91 98465 15684");
        const p4 = formatWhatsAppPhoneNumber("+971 50 123 4567");

        const sampleParty = { id: "p1", name: "Al-Ameen Enterprises", phone: "9846515684", balance: 15400 };
        const reminderMsg = formatDirectPaymentReminder(sampleParty);
        const invoiceMsg = formatDirectInvoiceMessage(sampleParty);
        const statementMsg = formatDirectStatementMessage(sampleParty);

        return {
          p1, p2, p3, p4,
          reminderHasParty: reminderMsg.includes("Al-Ameen Enterprises"),
          reminderHasBalance: reminderMsg.includes("15,400") || reminderMsg.includes("15400"),
          reminderHasEmojis: reminderMsg.includes("💰") && reminderMsg.includes("Outstanding Balance"),
          invoiceHasParty: invoiceMsg.includes("Al-Ameen Enterprises"),
          invoiceHasDetails: invoiceMsg.includes("Invoice No") && invoiceMsg.includes("Total Amount"),
          statementHasSummary: statementMsg.includes("Statement of Account Summary")
        };
      })()
    `);

    assert.strictEqual(formattersCheck.p1, "919846515684", "10-digit should prefix with 91");
    assert.strictEqual(formattersCheck.p2, "919846515684", "0-prefixed 11-digit should convert to 91");
    assert.strictEqual(formattersCheck.p3, "919846515684", "+91 with spaces should clean to 919846515684");
    assert.strictEqual(formattersCheck.p4, "971501234567", "Foreign number should preserve country code");
    assert.strictEqual(formattersCheck.reminderHasParty, true);
    assert.strictEqual(formattersCheck.reminderHasBalance, true);
    assert.strictEqual(formattersCheck.reminderHasEmojis, true);
    assert.strictEqual(formattersCheck.invoiceHasParty, true);
    assert.strictEqual(formattersCheck.invoiceHasDetails, true);
    assert.strictEqual(formattersCheck.statementHasSummary, true);
    console.log("  ✓ Phone normalization and formatters produce clean, polite, structured messages");

    console.log("Test 2: Navigate to WhatsApp Connect with terms unaccepted -> verify Gatekeeper...");
    const gatekeeperCheck = await window.webContents.executeJavaScript(`
      (async () => {
        // Reset state
        localStorage.setItem("gi-whatsapp-connect-state", JSON.stringify({
          connected: false,
          termsAccepted: false
        }));
        whatsappConnectState = loadWhatsAppConnectState();

        // Switch to WhatsApp feature
        if (typeof switchFeatureView === "function") {
          switchFeatureView("whatsapp");
        } else {
          elements.featureView.innerHTML = whatsappConnectTemplate();
          bindFeatureActions();
        }
        await new Promise((r) => setTimeout(r, 300));

        const container = elements.featureView.querySelector("#waPairingQrContainer");
        const termsCheck = elements.featureView.querySelector("#waTermsCheck");
        const gatekeeper = container?.querySelector(".wa-qr-terms-gatekeeper");
        const hasSvgQr = Boolean(container?.querySelector("svg:not(.gi-icon) rect[fill='#000000']"));
        const readTermsBtn = gatekeeper?.querySelector("#waGatekeeperReadTermsBtn");

        return {
          isTermsChecked: termsCheck?.checked,
          hasGatekeeper: Boolean(gatekeeper),
          gatekeeperText: gatekeeper?.textContent || "",
          hasSvgQr,
          hasReadTermsBtn: Boolean(readTermsBtn)
        };
      })()
    `);

    assert.strictEqual(gatekeeperCheck.isTermsChecked, false, "Terms checkbox must be unchecked initially");
    assert.strictEqual(gatekeeperCheck.hasGatekeeper, true, "Gatekeeper must be visible when terms not accepted");
    assert.strictEqual(gatekeeperCheck.hasSvgQr, false, "QR code SVG must NOT be generated until terms are accepted");
    assert.ok(gatekeeperCheck.gatekeeperText.includes("Standard Terms Required"));
    assert.strictEqual(gatekeeperCheck.hasReadTermsBtn, true);
    console.log("  ✓ QR code is gated until user accepts Standard Usage Terms");

    console.log("Test 3: Verify Standard Usage Terms modal opens and clicking Accept generates QR code...");
    const termsModalCheck = await window.webContents.executeJavaScript(`
      (async () => {
        openWhatsAppUsageTermsModal(() => {
          const tc = elements.featureView.querySelector("#waTermsCheck");
          if (tc) tc.checked = true;
          whatsappConnectState.termsAccepted = true;
          saveWhatsAppConnectState();
          renderWhatsAppPairingQr();
        });
        await new Promise((r) => setTimeout(r, 200));

        const modalBackdrop = document.getElementById("waUsageTermsModalBackdrop");
        const hasTitle = modalBackdrop?.textContent?.includes("Standard Usage Terms");
        const hasPolicies = modalBackdrop?.textContent?.includes("Prohibition of Bulk Spam") && modalBackdrop?.textContent?.includes("Prior Recipient Opt-In");

        // Click Accept button
        const acceptBtn = modalBackdrop?.querySelector("#waAcceptTermsBtn");
        acceptBtn?.click();
        await new Promise((r) => setTimeout(r, 600));

        const container = elements.featureView.querySelector("#waPairingQrContainer");
        const hasActiveBadge = container?.textContent?.includes("QR Active & Ready to Scan");
        const hasSvgQrAfterAccept = Boolean(container?.querySelector("svg"));
        const modalGone = !document.getElementById("waUsageTermsModalBackdrop");
        const isTermsCheckedNow = elements.featureView.querySelector("#waTermsCheck")?.checked;

        return {
          hasTitle,
          hasPolicies,
          modalGone,
          isTermsCheckedNow,
          hasActiveBadge,
          hasSvgQrAfterAccept
        };
      })()
    `);

    assert.strictEqual(termsModalCheck.hasTitle, true, "Terms modal should open with title");
    assert.strictEqual(termsModalCheck.hasPolicies, true, "Terms modal must include official anti-spam policies");
    assert.strictEqual(termsModalCheck.modalGone, true, "Modal closes upon accept");
    assert.strictEqual(termsModalCheck.isTermsCheckedNow, true, "Checkbox automatically checked upon terms accept");
    assert.strictEqual(termsModalCheck.hasActiveBadge, true, "Active QR badge must be visible");
    assert.strictEqual(termsModalCheck.hasSvgQrAfterAccept, true, "QR code SVG is generated immediately upon acceptance");
    console.log("  ✓ Terms modal functions cleanly and activates QR code upon acceptance");

    console.log("Test 4: Verify 'Send via System WhatsApp Desktop (No QR Required)' is completely removed...");
    const desktopPanelCheck = await window.webContents.executeJavaScript(`
      (() => {
        const panel = elements.featureView.querySelector("#waDirectDesktopPanel");
        const panelText = elements.featureView?.textContent || "";
        return {
          hasPanel: Boolean(panel),
          hasDesktopTitle: panelText.includes("Send via System WhatsApp Desktop (No QR Required)")
        };
      })()
    `);

    assert.strictEqual(desktopPanelCheck.hasPanel, false, "Desktop quick send panel must be removed");
    assert.strictEqual(desktopPanelCheck.hasDesktopTitle, false, "Desktop quick send text must not exist on page");
    console.log("  ✓ 'Send via System WhatsApp Desktop (No QR Required)' is completely removed from the page");

    console.log("Test 5: Verify Link Device button triggers verification modal (prevents fake bypass)...");
    const linkDeviceCheck = await window.webContents.executeJavaScript(`
      (async () => {
        const linkBtn = elements.featureView.querySelector("[data-wa-action='connect']");
        linkBtn?.click();
        await new Promise((r) => setTimeout(r, 200));

        const verifyBackdrop = document.getElementById("waPairingVerifyModalBackdrop");
        const verifyTitle = verifyBackdrop?.textContent?.includes("Confirm Device Pairing");
        const verifyNotice = verifyBackdrop?.textContent?.includes("Did you scan the QR code with WhatsApp?");
        const confirmBtn = verifyBackdrop?.querySelector("#waConfirmPairingBtn");

        // Click Confirm
        confirmBtn?.click();
        await new Promise((r) => setTimeout(r, 300));

        const isNowConnected = Boolean(whatsappConnectState.connected);
        const chatWorkspaceExists = Boolean(elements.featureView.querySelector(".wa-chat-workspace"));

        return {
          verifyTitle,
          verifyNotice,
          isNowConnected,
          chatWorkspaceExists
        };
      })()
    `);

    assert.strictEqual(linkDeviceCheck.verifyTitle, true, "Pairing verification modal opens on link device");
    assert.strictEqual(linkDeviceCheck.verifyNotice, true, "Notice about scanning QR code is included");
    assert.strictEqual(linkDeviceCheck.isNowConnected, true, "Connects only upon explicit user confirmation");
    assert.strictEqual(linkDeviceCheck.chatWorkspaceExists, true, "Navigates to chat workspace upon confirmed pairing");
    console.log("  ✓ Link Device prevents fake bypass and prompts with real verification");

    console.log("ALL WHATSAPP TERMS AND DESKTOP TESTS PASSED 100%!");
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  } finally {
    if (window && !window.isDestroyed()) window.destroy();
    try { fs.rmSync(testRoot, { recursive: true, force: true }); } catch (_) {}
    app.quit();
  }
});
