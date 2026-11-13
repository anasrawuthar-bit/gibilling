const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");

test("Barcode and Payment Mode Integrity Tests", async (t) => {
  const appJs = fs.readFileSync("app.js", "utf8");
  const databaseJs = fs.readFileSync("database.js", "utf8");

  await t.test("1. Item lookup button click handles mouse clicks (event.detail >= 0)", () => {
    assert.ok(!appJs.includes("if (event.detail === 0) handleEditorLookupAction"), "Mouse clicks must not be blocked by event.detail === 0");
    assert.ok(appJs.includes("handleEditorLookupAction(event);"), "Lookup item buttons must trigger selection on click");
  });

  await t.test("2. Enter key on [name='item'] checks barcode before focusing next field", () => {
    assert.ok(appJs.includes("if (target.matches('[name=\"item\"]'))"), "handleTransactionEditorKeys must intercept item field");
    assert.ok(appJs.includes("findItemByBarcode(val)"), "Must look up barcode on Enter");
    assert.ok(appJs.includes("selectTransactionItem(row, barcodeMatchedItem, { fromBarcodeScan: true })"), "Must auto-select item from barcode scan");
  });

  await t.test("3. New sale documents default to B2C series", () => {
    assert.ok(appJs.includes('(activeTab?.draft?.partyGstin ? "b2b" : "b2c")'), "New sales must default to b2c unless GSTIN is provided");
    assert.ok(!appJs.includes('(activeTab?.draft?.partyGstin ? "b2b" : "b2b")'), "No hardcoded b2b:b2b fallback");
  });

  await t.test("4. Paid sale makes Customer Name optional and allows walk-in", () => {
    assert.ok(appJs.includes("const isCashSale = editorType === 'sale' && elements.featureView.querySelector('#editorPaymentType')?.value === 'cash'"), "Cash sale must identify as paid");
    assert.ok(appJs.includes('partyInput.placeholder = optional ? "Name or phone (optional)" : meta.partyPlaceholder;'), "Paid sales show optional placeholder");
    assert.ok(appJs.includes("marker.textContent = optional ? '(optional)' : '*'"), "Required marker must toggle between (optional) and *");
  });

  await t.test("5. Credit sale enforces required customer", () => {
    assert.ok(appJs.includes('hint.textContent = !optional && editorType === \'sale\' ? "Customer is required for credit sales"'), "Credit sale informs operator of customer requirement");
    assert.ok(appJs.includes('checks.push({ type: "danger", text: "Customer is required for credit sales. Select one or add customer first." });'), "Compliance check flags credit sale lacking customer");
  });

  await t.test("6. Tax calculation guards against NaN in CGST and SGST", () => {
    assert.ok(appJs.includes("if (taxAmount > 0 && totalSub > 0)"), "Sub-tax calculation must prevent 0/0 division");
    assert.ok(appJs.includes("Number.isFinite(cgstTotal) ? cgstTotal : 0"), "CGST total display must guard against NaN");
    assert.ok(appJs.includes("Number.isFinite(sgstTotal) ? sgstTotal : 0"), "SGST total display must guard against NaN");
  });

  await t.test("7. database.js allows walk-in cash sales and auto-sets b2c", () => {
    assert.ok(databaseJs.includes("const walkIn = entry.type === 'sale' && !entry.partyId && !partyName && entry.paymentType === 'cash';"), "Walk-in cash sales must be recognized in database");
    assert.ok(databaseJs.includes("entry.supplyType = 'b2c';"), "Walk-in sales auto-assign b2c supply type");
  });
});
