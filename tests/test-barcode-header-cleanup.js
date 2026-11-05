const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const assert = require("assert");

const testRoot = path.join(__dirname, "..", "tmp-test-barcode-header");
if (!fs.existsSync(testRoot)) fs.mkdirSync(testRoot, { recursive: true });
app.setPath("userData", testRoot);

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  try {
    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 1200));

    const evalRes = await win.webContents.executeJavaScript(`
      (async () => {
        // Setup mock items
        state.items = [
          { id: 1, name: "asd", sku: "GI-ASD-0011", unit: "Pcs", category: "Computer Accessories", salePrice: 7865, currentStock: 61 }
        ];

        showView("barcodeGenerator");
        await new Promise(r => setTimeout(r, 400));

        const header = document.querySelector(".barcode-titlebar");
        const titleH1 = header?.querySelector("h1")?.textContent?.trim();
        const activeSetupPill = header?.querySelector(".barcode-active-setup-pill");
        const topPrintBtn = header?.querySelector("[data-action='open-print-preview']");

        const queuePrintBtn = document.querySelector(".preview-print-main-btn");

        return {
          hasHeader: Boolean(header),
          titleH1,
          hasActiveSetupPill: Boolean(activeSetupPill),
          hasTopPrintBtn: Boolean(topPrintBtn),
          hasQueuePrintBtn: Boolean(queuePrintBtn),
        };
      })()
    `);

    console.log("Evaluation Results:", evalRes);

    assert(evalRes.hasHeader, "Barcode titlebar must exist");
    assert.strictEqual(evalRes.titleH1, "Barcode Generator", "Heading must be Barcode Generator");
    assert(!evalRes.hasActiveSetupPill, "Active setup pill under Barcode Generator must be removed");
    assert(!evalRes.hasTopPrintBtn, "Preview All & Print button in top header must be removed");
    assert(evalRes.hasQueuePrintBtn, "Print Queue Preview All & Print button must remain functional in queue panel");

    // Capture screenshot
    const img = await win.webContents.capturePage();
    const artifactPath = "C:\\Users\\ANAS\\.gemini\\antigravity\\brain\\bed9650d-397d-4216-aa80-c0ae1c3c4fcb\\barcode_generator_clean_header.png";
    fs.writeFileSync(artifactPath, img.toPNG());
    console.log("✓ Screenshot saved successfully:", artifactPath);

    console.log("=================================================");
    console.log("BARCODE HEADER CLEANUP VERIFIED 100%!");
    console.log("=================================================");
    app.exit(0);
  } catch (err) {
    console.error("Test failed:", err);
    app.exit(1);
  }
});
