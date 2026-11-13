const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

test("Barcode Workflow - Purchase Entry, Sales Scan, and Auto-Jump Verification", async (t) => {
  const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const stylesCss = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

  await t.test("1. Add Item modal does NOT show Barcode / SKU field", () => {
    // Hidden in index.html so operators do not enter barcodes when creating master items
    assert.ok(indexHtml.includes('id="itemSkuFieldGroup" style="display:none !important;" aria-hidden="true"'), "Barcode/SKU group must be hidden in item modal");
  });

  await t.test("2. Purchase Bill has dedicated Barcode column and input", () => {
    assert.ok(appJs.includes('${type === "purchase" ? \'<th class="col-barcode">Barcode</th>\' : ""}'), "Purchase Bill thead must contain Barcode column");
    assert.ok(appJs.includes('class="editor-barcode-cell"'), "Purchase Bill rows must render editor-barcode-cell");
    assert.ok(appJs.includes('name="barcode"'), "Purchase rows must have name=barcode input");
    assert.ok(stylesCss.includes(".purchase-editor .editor-table th.col-barcode"), "styles.css must style col-barcode");
  });

  await t.test("3. findItemByBarcode and searchItemsForLookup support item.barcodes array", () => {
    assert.ok(appJs.includes("function findItemByBarcode(barcode)"), "app.js must define findItemByBarcode");
    assert.ok(appJs.includes("item.barcodes.some"), "findItemByBarcode must check item.barcodes");
    assert.ok(appJs.includes("jumpToNextTransactionRow"), "app.js must define jumpToNextTransactionRow");
  });

  await t.test("4. Barcode scanning in item field auto-selects and jumps to next line", () => {
    assert.ok(appJs.includes("selectTransactionItem(row, barcodeMatchedItem, { fromBarcodeScan: true })"), "Item input must detect exact barcode scan and trigger auto-jump");
    assert.ok(appJs.includes("jumpToNextTransactionRow(row)"), "selectTransactionItem must call jumpToNextTransactionRow when fromBarcodeScan is true");
  });

  await t.test("5. Zero Malayalam in application UI code (app.js & index.html)", () => {
    const malayalamRegex = /[\u0D00-\u0D7F]/;
    assert.strictEqual(malayalamRegex.test(appJs), false, "app.js must contain zero Malayalam characters");
    assert.strictEqual(malayalamRegex.test(indexHtml), false, "index.html must contain zero Malayalam characters");
  });
});
