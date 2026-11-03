const { app, BrowserWindow } = require("electron");
const path = require("path");
const assert = require("assert");
const fs = require("fs");

const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity\\brain\\bed9650d-397d-4216-aa80-c0ae1c3c4fcb";

async function runTest() {
  const window = new BrowserWindow({
    show: true,
    width: 1366,
    height: 820,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  try {
    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 1000));

    // Test Sale editor
    const saleCheck = await window.webContents.executeJavaScript(`
      (() => {
        openTransactionEditor("sale");
        const invInput = document.querySelector('[name="invoiceNo"]');
        const cardHeader = document.querySelector('.editor-unified-title-right');
        const docPill = cardHeader?.querySelector('.editor-unified-doc-pill');
        const headerText = cardHeader?.textContent || "";

        return {
          hasInput: Boolean(invInput),
          value: invInput?.value,
          readOnly: invInput?.readOnly,
          tabIndex: invInput?.getAttribute("tabindex"),
          hasAutoInHeader: headerText.toLowerCase().includes("auto"),
          docPillText: docPill?.textContent || null,
        };
      })()
    `);

    console.log("Sale editor check:", saleCheck);
    assert.strictEqual(saleCheck.hasInput, true, "Invoice input must exist");
    assert.strictEqual(saleCheck.readOnly, true, "Invoice number must be read-only in Sale editor");
    assert.strictEqual(saleCheck.tabIndex, "-1", "Invoice number must have tabindex -1");
    assert.strictEqual(saleCheck.hasAutoInHeader, false, "Must NOT have any 'Auto' text in header");
    assert.strictEqual(saleCheck.docPillText, null, "Must NOT render Auto numbered doc pill when creating sale");

    // Capture visual screenshot
    await new Promise((r) => setTimeout(r, 400));
    const img = await window.webContents.capturePage();
    const screenshotPath = path.join(artifactDir, "invoice_readonly_no_auto_verified.png");
    fs.writeFileSync(screenshotPath, img.toPNG());
    console.log("Screenshot saved to:", screenshotPath);

    // Test Purchase editor
    const purchaseCheck = await window.webContents.executeJavaScript(`
      (() => {
        openTransactionEditor("purchase");
        const invInput = document.querySelector('[name="invoiceNo"]');
        return {
          hasInput: Boolean(invInput),
          readOnly: invInput?.readOnly,
        };
      })()
    `);

    console.log("Purchase editor check:", purchaseCheck);
    assert.strictEqual(purchaseCheck.hasInput, true, "Bill number input must exist");
    assert.strictEqual(purchaseCheck.readOnly, false, "Supplier bill number must remain editable in Purchase editor");

    console.log("\n=======================================================");
    console.log("  INVOICE READONLY & NO AUTO WORD CHECKS PASSED 100%!  ");
    console.log("=======================================================\n");
  } catch (err) {
    console.error("Test failed:", err);
    process.exitCode = 1;
  } finally {
    window.close();
  }
}

app.whenReady().then(runTest);
