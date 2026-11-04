const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const screenshotDir = path.join(
  "C:",
  "Users",
  "ANAS",
  ".gemini",
  "antigravity",
  "brain",
  "bed9650d-397d-4216-aa80-c0ae1c3c4fcb"
);

app.whenReady().then(async () => {
  let win = null;
  try {
    win = new BrowserWindow({
      show: false,
      width: 1366,
      height: 768,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: false,
        nodeIntegration: true,
      },
    });

    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 1000));

    console.log("TEST 1: Opening Sale invoice editor...");
    await win.webContents.executeJavaScript(`
      (() => {
        state.parties = [
          { id: 1, name: "Consumer Walkin", phone: "9876543210", balance: 0, state: "Kerala" }
        ];
        state.items = [
          { id: 10, name: "Monitor", sku: "MON-01", stock: 10, salePrice: 4500, taxRate: 18 }
        ];
        openTransactionEditor("sale", { skipDirtyCheck: true });
      })()
    `);
    await new Promise((r) => setTimeout(r, 600));

    const initialCheck = await win.webContents.executeJavaScript(`
      (() => {
        const notesInput = document.querySelector('[name="invoiceDescription"]');
        return {
          notesValue: notesInput ? notesInput.value : null,
          notesPlaceholder: notesInput?.placeholder,
        };
      })()
    `);

    assert.strictEqual(initialCheck.notesValue, "", "Notes textarea must initially be empty");
    console.log("✓ Notes textarea is initially empty");

    // TEST 2: Add line items and verify notes textarea DOES NOT auto-fill
    console.log("TEST 2: Adding item rows and checking that notes textarea stays empty...");
    const afterAddingItems = await win.webContents.executeJavaScript(`
      (async () => {
        const row = document.querySelector("#transactionRows tr");
        if (row) {
          const itemInput = row.querySelector('[name="item"]');
          const qtyInput = row.querySelector('[name="qty"]');
          const priceInput = row.querySelector('[name="price"]');
          if (itemInput) {
            itemInput.value = "Monitor";
            itemInput.dispatchEvent(new Event("input", { bubbles: true }));
          }
          if (qtyInput) {
            qtyInput.value = "10";
            qtyInput.dispatchEvent(new Event("input", { bubbles: true }));
          }
          if (priceInput) {
            priceInput.value = "4500";
            priceInput.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }

        const addRowBtn = document.getElementById("addEditorRow");
        if (addRowBtn) addRowBtn.click();
        await new Promise(r => setTimeout(r, 200));

        const rows = document.querySelectorAll("#transactionRows tr");
        if (rows[1]) {
          const itemInput2 = rows[1].querySelector('[name="item"]');
          const qtyInput2 = rows[1].querySelector('[name="qty"]');
          const priceInput2 = rows[1].querySelector('[name="price"]');
          if (itemInput2) {
            itemInput2.value = "Keyboard";
            itemInput2.dispatchEvent(new Event("input", { bubbles: true }));
          }
          if (qtyInput2) {
            qtyInput2.value = "2";
            qtyInput2.dispatchEvent(new Event("input", { bubbles: true }));
          }
          if (priceInput2) {
            priceInput2.value = "500";
            priceInput2.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }

        await new Promise(r => setTimeout(r, 200));

        const notesInput = document.querySelector('[name="invoiceDescription"]');
        return {
          notesValue: notesInput ? notesInput.value : null,
          rowsCount: rows.length,
        };
      })()
    `);

    console.log("  After adding items check:", afterAddingItems);
    assert.strictEqual(afterAddingItems.notesValue, "", "Notes textarea must remain empty after adding items");
    console.log("✓ Notes textarea remained empty after adding line items");

    // TEST 3: Test legacy sanitization in UI draft loader
    console.log("TEST 3: Testing legacy sanitization function and draft population...");
    const sanitizationResults = await win.webContents.executeJavaScript(`
      (() => {
        const polluted1 = "monitor x 10 | monitor x 10, monitor x 1, monitor x 1";
        const polluted2 = "Customer requested gift wrap | monitor x 5";
        const clean1 = "Customer requested urgent dispatch";
        const itemsOnly = "3 items";

        return {
          polluted1Cleaned: sanitizeInvoiceUserNotes(polluted1),
          polluted2Cleaned: sanitizeInvoiceUserNotes(polluted2),
          clean1Cleaned: sanitizeInvoiceUserNotes(clean1),
          itemsOnlyCleaned: sanitizeInvoiceUserNotes(itemsOnly),
        };
      })()
    `);

    assert.strictEqual(sanitizationResults.polluted1Cleaned, "", "Polluted item summaries must be stripped completely");
    assert.strictEqual(sanitizationResults.polluted2Cleaned, "Customer requested gift wrap", "User remarks must be preserved while stripping item summaries");
    assert.strictEqual(sanitizationResults.clean1Cleaned, "Customer requested urgent dispatch", "Clean user notes must be untouched");
    assert.strictEqual(sanitizationResults.itemsOnlyCleaned, "", "'X items' summary pattern must be stripped");
    console.log("✓ Sanitization verified for all legacy patterns");

    // Capture screenshot of clean editor
    const img = await win.webContents.capturePage();
    const screenshotPath = path.join(screenshotDir, "clean_invoice_notes_empty.png");
    fs.writeFileSync(screenshotPath, img.toPNG());
    console.log(`✓ Screenshot saved: ${screenshotPath}`);

    console.log("\nALL INVOICE NOTES AUTO-FILL TESTS PASSED!");
    win.destroy();
    app.quit();
    process.exit(0);
  } catch (err) {
    console.error("Test failed:", err);
    if (win) win.destroy();
    app.quit();
    process.exit(1);
  }
});
