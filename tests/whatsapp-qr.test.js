const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-wa-qr-test-"));
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

    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 600));

    console.log("Test 1: Verify window.giApp.generateQrSvg is exposed and generates valid SVG...");
    const qrDirectCheck = await window.webContents.executeJavaScript(`
      (async () => {
        if (!window.giApp?.generateQrSvg) return { error: "generateQrSvg not exposed" };
        const res = await window.giApp.generateQrSvg({ text: "https://wa.me/919876543210?text=Hello" });
        return {
          success: res.success,
          isSvg: res.svg?.startsWith("<svg"),
          svgLength: res.svg?.length || 0
        };
      })()
    `);
    assert.strictEqual(qrDirectCheck.success, true);
    assert.strictEqual(qrDirectCheck.isSvg, true);
    assert.ok(qrDirectCheck.svgLength > 100);
    console.log("  ✓ window.giApp.generateQrSvg works and returns valid SVG");

    console.log("Test 2: Verify openWhatsAppShareModal opens and generates QR code SVG in #waQrCodeContainer...");
    const modalCheck = await window.webContents.executeJavaScript(`
      (async () => {
        const sampleRecord = {
          id: "INV-2026-001",
          invoiceNo: "INV-2026-001",
          date: "2026-09-29",
          dueDate: "2026-10-15",
          partyName: "Shree Ganesh Traders",
          phone: "9876543210",
          amount: 14500,
          received: 5000,
        };

        openWhatsAppShareModal(sampleRecord, "sale");
        await new Promise((r) => setTimeout(r, 300));

        const backdrop = document.getElementById("whatsappShareModalBackdrop");
        const qrContainer = backdrop?.querySelector("#waQrCodeContainer");
        const svg = qrContainer?.querySelector("svg");
        const phoneInput = backdrop?.querySelector("#waRecipientPhone");
        const msgText = backdrop?.querySelector("#waMessageText");
        const copyLinkBtn = backdrop?.querySelector("#waCopyLinkBtn");

        return {
          modalExists: Boolean(backdrop),
          phoneValue: phoneInput?.value,
          hasQrSvg: Boolean(svg),
          svgViewBox: svg?.getAttribute("viewBox"),
          hasMessage: Boolean(msgText?.value?.includes("Shree Ganesh Traders")),
          copyLinkEnabled: !copyLinkBtn?.disabled
        };
      })()
    `);

    assert.strictEqual(modalCheck.modalExists, true, "Modal backdrop should exist");
    assert.strictEqual(modalCheck.phoneValue, "9876543210", "Phone should match sample");
    assert.strictEqual(modalCheck.hasQrSvg, true, "QR code SVG should be rendered in container");
    assert.strictEqual(modalCheck.hasMessage, true, "Message should contain customer name");
    assert.strictEqual(modalCheck.copyLinkEnabled, true, "Copy link button should be enabled");
    console.log("  ✓ WhatsApp Share modal rendered with live QR code SVG");

    console.log("Test 3: Verify dynamic QR update when phone number changes...");
    const phoneUpdateCheck = await window.webContents.executeJavaScript(`
      (async () => {
        const backdrop = document.getElementById("whatsappShareModalBackdrop");
        const phoneInput = backdrop?.querySelector("#waRecipientPhone");
        const qrContainer = backdrop?.querySelector("#waQrCodeContainer");

        // Clear phone number
        phoneInput.value = "";
        phoneInput.dispatchEvent(new Event("input"));
        await new Promise((r) => setTimeout(r, 250));

        const emptyText = qrContainer?.textContent || "";
        const hasQrSvgWhenEmpty = Boolean(qrContainer?.querySelector("svg:not(.gi-icon)"));

        // Put new phone number
        phoneInput.value = "9123456789";
        phoneInput.dispatchEvent(new Event("input"));
        await new Promise((r) => setTimeout(r, 350));

        const hasQrSvgAfterInput = Boolean(qrContainer?.querySelector("svg:not(.gi-icon)"));

        return {
          emptyTextContainsPrompt: emptyText.includes("Enter Mobile Number"),
          hasQrSvgWhenEmpty,
          hasQrSvgAfterInput
        };
      })()
    `);

    assert.strictEqual(phoneUpdateCheck.emptyTextContainsPrompt, true, "Empty phone should prompt user");
    assert.strictEqual(phoneUpdateCheck.hasQrSvgWhenEmpty, false, "Empty phone should not render QR SVG");
    assert.strictEqual(phoneUpdateCheck.hasQrSvgAfterInput, true, "New phone should regenerate QR SVG");
    console.log("  ✓ QR code dynamically updates upon phone number input");

    console.log("Test 4: Capture screenshot of the modal with QR code...");
    const modalRect = await window.webContents.executeJavaScript(`
      (() => {
        const el = document.getElementById("whatsappShareModalBackdrop");
        if (!el) return "NOT FOUND";
        const r = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return {
          top: r.top, left: r.left, width: r.width, height: r.height,
          display: style.display, visibility: style.visibility, opacity: style.opacity, zIndex: style.zIndex
        };
      })()
    `);
    console.log("  Modal rect and style:", modalRect);

    await new Promise((r) => setTimeout(r, 400));
    const image = await window.capturePage();
    const screenshotPath = path.join(
      "C:\\Users\\ANAS\\.gemini\\antigravity-ide\\brain\\59e13e0d-d816-4f77-9329-31e8ac922a2b",
      "whatsapp_qr_modal.png"
    );
    fs.writeFileSync(screenshotPath, image.toPNG());
    console.log("  ✓ Screenshot captured to:", screenshotPath);

    console.log("\n=== ALL WHATSAPP QR CODE TESTS PASSED (100%) ===");
    process.exit(0);
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  } finally {
    if (window && !window.isDestroyed()) window.destroy();
  }
});
