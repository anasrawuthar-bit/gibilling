const { app, BrowserWindow } = require("electron");
const path = require("path");
const assert = require("assert");
const fs = require("fs");

const screenshotDir = path.join(
  "C:",
  "Users",
  "ANAS",
  ".gemini",
  "antigravity",
  "brain",
  "bed9650d-397d-4216-aa80-c0ae1c3c4fcb"
);

async function runInvoiceNumberTests() {
  const window = new BrowserWindow({
    show: true,
    width: 1366,
    height: 768,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  try {
    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 800));

    // Setup mock data
    await window.webContents.executeJavaScript(`
      (() => {
        state.parties = [
          { id: 1, name: "techii", phone: "8476541513", balance: 2310, receivable: 2310, payable: 0, state: "Kerala" }
        ];

        state.items = [
          { id: 10, name: "Premium Mouse", sku: "PM-1", stock: 100, salePrice: 500, taxRate: 18 }
        ];

        state.invoices = [
          { id: "inv-existing-1", invoiceNo: "INV-2627-0001", type: "sale", party: "techii", date: "2026-10-10", total: 1000, balance: 1000 }
        ];

        state.businessSettings = {
          invoicePrefix: "INV",
          startingNo: 1,
          state: "Kerala"
        };

        // Open the Sale window
        openTransactionEditor("sale");
      })()
    `);

    await new Promise((r) => setTimeout(r, 600));

    console.log("Test 1: Verify Invoice Number field displays the next generated invoice number (NOT 'Auto')...");
    const initialInvoiceVal = await window.webContents.executeJavaScript(`
      (() => {
        const input = document.querySelector('[name="invoiceNo"]');
        return {
          value: input?.value,
          placeholder: input?.placeholder
        };
      })()
    `);
    console.log("  Rendered invoice number:", initialInvoiceVal);
    assert(initialInvoiceVal.value, "Invoice number input must have a value");
    assert.notStrictEqual(initialInvoiceVal.value.toLowerCase(), "auto", "Invoice number must NOT be 'Auto'");
    // Since INV-2627-0001 exists, it should be INV-2627-0002!
    assert(initialInvoiceVal.value.includes("0002"), "Should propose INV-2627-0002 because 0001 already exists");

    // Capture screenshot of next invoice number populated
    const img1 = await window.webContents.capturePage();
    fs.writeFileSync(path.join(screenshotDir, "invoice_number_prepopulated_verified.png"), img1.toPNG());
    console.log("  Captured invoice_number_prepopulated_verified.png");

    console.log("Test 2: Enter a duplicate invoice number and verify real-time inline warning and error class...");
    await window.webContents.executeJavaScript(`
      (() => {
        const input = document.querySelector('[name="invoiceNo"]');
        input.value = "INV-2627-0001"; // Duplicate of existing invoice
        input.dispatchEvent(new Event("input", { bubbles: true }));
      })()
    `);
    await new Promise((r) => setTimeout(r, 300));

    const duplicateCheck = await window.webContents.executeJavaScript(`
      (() => {
        const input = document.querySelector('[name="invoiceNo"]');
        const errorEl = input.closest("label")?.querySelector(".field-error");
        return {
          isInvalid: input.classList.contains("invalid-field"),
          errorText: errorEl?.textContent
        };
      })()
    `);
    console.log("  Duplicate validation result:", duplicateCheck);
    assert(duplicateCheck.isInvalid, "Input must have invalid-field class when duplicate");
    assert(duplicateCheck.errorText && duplicateCheck.errorText.includes("already exists"), "Must show duplicate error text");

    // Capture screenshot of duplicate warning
    const img2 = await window.webContents.capturePage();
    fs.writeFileSync(path.join(screenshotDir, "invoice_number_duplicate_prevented_verified.png"), img2.toPNG());
    console.log("  Captured invoice_number_duplicate_prevented_verified.png");

    console.log("Test 3: Attempt to submit form with duplicate invoice number and verify submission is blocked...");
    const submitBlocked = await window.webContents.executeJavaScript(`
      (() => {
        let toastMsg = "";
        const originalShowToast = window.showToast;
        window.showToast = (msg) => { toastMsg = msg; if (originalShowToast) originalShowToast(msg); };

        const form = document.querySelector("#transactionEditorForm");
        const submitEvent = new Event("submit", { cancelable: true, bubbles: true });
        form.dispatchEvent(submitEvent);

        return {
          defaultPrevented: submitEvent.defaultPrevented,
          toastMsg: toastMsg
        };
      })()
    `);
    console.log("  Submit attempt result:", submitBlocked);
    assert(submitBlocked.toastMsg.includes("already exists"), "Toast must notify about duplicate invoice number");

    console.log("Test 4: Change invoice number to a unique value and verify error clears...");
    await window.webContents.executeJavaScript(`
      (() => {
        const input = document.querySelector('[name="invoiceNo"]');
        input.value = "INV-2627-0099"; // Unique
        input.dispatchEvent(new Event("input", { bubbles: true }));
      })()
    `);
    await new Promise((r) => setTimeout(r, 300));

    const clearedCheck = await window.webContents.executeJavaScript(`
      (() => {
        const input = document.querySelector('[name="invoiceNo"]');
        const errorEl = input.closest("label")?.querySelector(".field-error");
        return {
          isInvalid: input.classList.contains("invalid-field"),
          hasErrorEl: Boolean(errorEl)
        };
      })()
    `);
    console.log("  Cleared validation result:", clearedCheck);
    assert(!clearedCheck.isInvalid, "invalid-field class must be removed");
    assert(!clearedCheck.hasErrorEl, "field-error must be removed");

    console.log("\n=================================================");
    console.log("  ALL INVOICE NUMBER & DUPLICATE TESTS PASSED!   ");
    console.log("=================================================\n");

  } catch (err) {
    console.error("Test failed:", err);
    process.exitCode = 1;
  } finally {
    window.close();
    app.quit();
  }
}

app.whenReady().then(runInvoiceNumberTests);
