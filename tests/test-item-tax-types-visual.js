const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const assert = require("assert");

async function run() {
  const window = new BrowserWindow({
    show: true,
    width: 1280,
    height: 850,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity-ide\\brain\\9dd39af8-a7ad-430b-8ee8-49729ceb732f";

  try {
    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 1200));

    console.log("TEST 1: Verifying Add Item Modal tax options...");
    const itemModalResult = await window.webContents.executeJavaScript(`
      (() => {
        openEntryModal("item");
        const select = document.getElementById("itemTaxRate");
        const options = select ? Array.from(select.options).map(o => o.value) : [];
        return {
          count: options.length,
          options
        };
      })()
    `);

    const expected18 = [
      "None",
      "IGST@0%",
      "GST@0%",
      "IGST@0.25%",
      "GST@0.25%",
      "IGST@3%",
      "GST@3%",
      "IGST@5%",
      "GST@5%",
      "IGST@12%",
      "GST@12%",
      "IGST@18%",
      "GST@18%",
      "IGST@28%",
      "GST@28%",
      "IGST@40%",
      "GST@40%",
      "Exempt"
    ];

    console.log("Item Modal tax options count:", itemModalResult.count);
    assert.strictEqual(itemModalResult.count, 18, "Item tax dropdown must have exactly 18 options");
    assert.deepStrictEqual(itemModalResult.options, expected18, "Item tax dropdown options must match expected 18 exactly");
    console.log("✓ Add Item modal has all 18 standard tax options matching reference software!");

    // Scroll into view and set select size & height temporarily to capture opened dropdown in screenshot
    await window.webContents.executeJavaScript(`
      (() => {
        const select = document.getElementById("itemTaxRate");
        if (select) {
          select.scrollIntoView({ block: "center", behavior: "instant" });
          select.size = 8;
          select.style.height = "160px";
          select.style.position = "relative";
          select.style.zIndex = "999";
        }
      })()
    `);
    await new Promise((r) => setTimeout(r, 400));
    const imgItemModal = await window.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "item_modal_tax_types.png"), imgItemModal.toPNG());
    console.log("✓ Saved item_modal_tax_types.png");

    // Reset size
    await window.webContents.executeJavaScript(`
      (() => {
        const select = document.getElementById("itemTaxRate");
        if (select) {
          select.removeAttribute("size");
          select.style.position = "";
          select.style.zIndex = "";
        }
      })()
    `);

    console.log("TEST 2: Verifying Expense Modal tax options...");
    const expenseModalResult = await window.webContents.executeJavaScript(`
      (() => {
        closeEntryModal();
        openExpenseModal();
        // Switch to GST mode
        const gstChip = document.querySelector('.expense-mode-chip[data-mode="gst"]');
        if (gstChip) gstChip.click();
        const select = document.getElementById("expenseTaxRate");
        const options = select ? Array.from(select.options).map(o => o.value) : [];
        return {
          count: options.length,
          options
        };
      })()
    `);

    console.log("Expense Modal tax options count:", expenseModalResult.count);
    assert.strictEqual(expenseModalResult.count, 18, "Expense tax dropdown must have exactly 18 options");
    assert.deepStrictEqual(expenseModalResult.options, expected18, "Expense tax dropdown options must match expected 18 exactly");
    console.log("✓ Expense modal has all 18 standard tax options matching reference software!");

    // Capture Expense modal screenshot
    await new Promise((r) => setTimeout(r, 600));
    const imgExpenseModal = await window.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "expense_modal_tax_types.png"), imgExpenseModal.toPNG());
    console.log("✓ Saved expense_modal_tax_types.png");

    console.log("TEST 3: Verifying Transaction Editor tax options...");
    const editorResult = await window.webContents.executeJavaScript(`
      (() => {
        closeExpenseModal();
        openTransactionEditor("sale");
        const select = document.querySelector('#transactionRows select[name="tax"]');
        const options = select ? Array.from(select.options).map(o => o.value) : [];
        return {
          count: options.length,
          options
        };
      })()
    `);

    assert.strictEqual(editorResult.count, 18, "Transaction editor row tax dropdown must have exactly 18 options");
    assert.deepStrictEqual(editorResult.options, expected18, "Transaction editor row tax dropdown options must match expected 18 exactly");
    console.log("✓ Transaction editor has all 18 standard tax options matching reference software!");

    console.log("\n=======================================================");
    console.log("   ALL TAX TYPE AUDIT & MODAL TESTS PASSED 100%!      ");
    console.log("=======================================================\n");

  } catch (err) {
    console.error("Test error:", err);
    process.exit(1);
  } finally {
    window.destroy();
    app.quit();
  }
}

app.whenReady().then(run);
