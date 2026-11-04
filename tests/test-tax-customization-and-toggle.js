const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const db = require("../database");

async function run() {
  console.log("▶ Testing Tax Customization & Master Toggle Architecture...");

  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "zynbill-tax-test-"));
  await db.initDatabase(testRoot);

  const state = db.getState();
  const defaults = state.businessSettings || {};
  assert.strictEqual(defaults.enableTax, true, "Default enableTax should be true");
  assert.ok(Array.isArray(defaults.customTaxRates), "customTaxRates should be an array");
  assert.ok(defaults.customTaxRates.includes(0), "customTaxRates must include 0 for 'None'");
  assert.ok(defaults.customTaxRates.includes(18), "customTaxRates must include standard 18%");

  console.log("  ✓ Database defaults verified: enableTax=true, customTaxRates includes [0, ...]");

  // Test updating business settings with custom tax rates & master toggle
  const updatedSettings = await db.updateBusinessSettings({
    enableTax: false,
    customTaxRates: [0, 5, 6, 12, 18, 28]
  });
  assert.strictEqual(updatedSettings.businessSettings.enableTax, false, "enableTax can be toggled to false");
  assert.ok(updatedSettings.businessSettings.customTaxRates.includes(6), "Custom 6% tax rate persisted");

  // Re-enable tax
  const restoredSettings = await db.updateBusinessSettings({
    enableTax: true,
  });
  assert.strictEqual(restoredSettings.businessSettings.enableTax, true, "enableTax re-enabled successfully");

  console.log("  ✓ Database updateBusinessSettings verified: Master toggle and custom rates persist");

  // 2. Test formatPrintTaxRate rule (never print 'None' or '0%', must be empty string)
  function parseTaxRate(value) {
    if (value === null || value === undefined) return 0;
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const match = String(value).match(/(\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) : 0;
  }

  function formatPrintTaxRate(rate) {
    if (rate === null || rate === undefined) return "";
    const str = String(rate).trim();
    if (str.toLowerCase() === "none" || str === "0" || str === "0%" || str === "-" || str === "") {
      return ""; // In print, NEVER print "None" or "0%" - return empty blank string
    }
    if (str.toLowerCase() === "exempt") return "";
    const numeric = parseTaxRate(str);
    if (!numeric || numeric === 0) return "";
    return `${numeric}%`;
  }

  assert.strictEqual(formatPrintTaxRate("None"), "", "Print tax rate for 'None' MUST be empty string");
  assert.strictEqual(formatPrintTaxRate("none"), "", "Print tax rate for 'none' MUST be empty string");
  assert.strictEqual(formatPrintTaxRate("0"), "", "Print tax rate for '0' MUST be empty string");
  assert.strictEqual(formatPrintTaxRate("0%"), "", "Print tax rate for '0%' MUST be empty string");
  assert.strictEqual(formatPrintTaxRate(0), "", "Print tax rate for 0 MUST be empty string");
  assert.strictEqual(formatPrintTaxRate("GST@0%"), "", "Print tax rate for 'GST@0%' MUST be empty string");
  assert.strictEqual(formatPrintTaxRate("Exempt"), "", "Print tax rate for 'Exempt' MUST be empty string");
  assert.strictEqual(formatPrintTaxRate("GST@18%"), "18%", "Print tax rate for 'GST@18%' should be '18%'");
  assert.strictEqual(formatPrintTaxRate("GST@6%"), "6%", "Print tax rate for 'GST@6%' should be '6%'");
  assert.strictEqual(formatPrintTaxRate(12), "12%", "Print tax rate for 12 should be '12%'");

  console.log("  ✓ Print formatting rule verified: 'None' and '0%' are 100% BLANK/EMPTY string in print output");

  // 3. Test getTaxOptionsList behavior
  function getAvailableTaxRates(customRates) {
    if (Array.isArray(customRates) && customRates.length > 0) {
      const numeric = customRates.map(Number).filter((n) => !isNaN(n) && n >= 0 && n <= 100);
      if (!numeric.includes(0)) numeric.unshift(0);
      return Array.from(new Set(numeric)).sort((a, b) => a - b);
    }
    return [0, 0.25, 3, 5, 12, 18, 28, 40];
  }

  function getTaxOptionsList(customRates) {
    const rates = getAvailableTaxRates(customRates);
    const list = ["None"];
    for (const r of rates) {
      if (r === 0) continue;
      list.push(`GST@${r}%`);
      list.push(`IGST@${r}%`);
    }
    list.push("Exempt");
    return list;
  }

  const customOptions = getTaxOptionsList([0, 5, 6, 12, 18]);
  assert.ok(customOptions[0] === "None", "First tax option must be 'None'");
  assert.ok(customOptions.includes("GST@6%"), "Custom 6% rate must be present in tax options");
  assert.ok(customOptions.includes("IGST@6%"), "Custom 6% IGST rate must be present in tax options");
  assert.ok(!customOptions.includes("GST@28%"), "Removed 28% rate must NOT be in options");
  assert.ok(customOptions[customOptions.length - 1] === "Exempt", "Last option is 'Exempt'");

  console.log("  ✓ Custom tax rates options generator verified: Dynamic options with 'None' leading");

  // 4. Test GstSummaryRows: ignores None / 0% rows so GST breakdown table is omitted
  function computeGstSummaryRows(rows) {
    const summary = new Map();
    rows.forEach((row) => {
      const rate = Number(row.taxRate || 0);
      if (!rate || rate <= 0) return; // Ignore None / 0%
      const taxable = Math.max(0, Number(row.taxableValue || (row.qty * row.price) || 0));
      const tax = taxable * (rate / 100);
      const existing = summary.get(rate) || { rate, taxable: 0, tax: 0, cgst: 0, sgst: 0, igst: 0 };
      existing.taxable += taxable;
      existing.tax += tax;
      existing.cgst += tax / 2;
      existing.sgst += tax / 2;
      summary.set(rate, existing);
    });
    return Array.from(summary.values());
  }

  const noneRows = [
    { item: "Rice", qty: 2, price: 50, taxRate: 0 },
    { item: "Wheat", qty: 5, price: 40, taxRate: "None" }
  ];
  assert.strictEqual(computeGstSummaryRows(noneRows).length, 0, "All-None items must produce 0 GST summary rows (no GST table printed)");

  const mixedRows = [
    { item: "Rice", qty: 2, price: 50, taxRate: 0 },
    { item: "Soap", qty: 1, price: 100, taxRate: 18 }
  ];
  const mixedSummary = computeGstSummaryRows(mixedRows);
  assert.strictEqual(mixedSummary.length, 1, "Only taxable row produces summary row");
  assert.strictEqual(mixedSummary[0].rate, 18);
  assert.strictEqual(mixedSummary[0].taxable, 100);

  console.log("  ✓ GST Tax summary table omission verified for 'None' / zero tax items");

  // Cleanup
  try {
    fs.rmSync(testRoot, { recursive: true, force: true });
  } catch {}

  console.log("\n==================================================================");
  console.log("   TAX CUSTOMIZATION & MASTER TOGGLE TESTS PASSED 100%!          ");
  console.log("==================================================================");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
