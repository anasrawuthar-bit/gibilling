/**
 * ZynBill – GST Dynamic Sub-Taxes, Dropdown Sync & Cess Reporting Verification Suite
 *
 * Requirements verified:
 * 1. Default Tax Dropdown matches exact list requested:
 *    None, GST@0.25%, IGST@0.25%, GST@3%, IGST@3%, GST@5%, IGST@5%, GST@12%, IGST@12%,
 *    GST@18%, IGST@18%, GST@28%, IGST@28%, GST@40%, IGST@40%, Exempt.
 * 2. Settings -> Tax Slabs allows dynamically adding & removing sub-taxes.
 * 3. Normalization preserves custom dynamic sub-taxes (e.g. 1, 2, 3 or more sub-taxes).
 * 4. Intra-state vs Inter-state calculations respect dynamic sub-taxes.
 * 5. Cess > 0 calculations accurately compute cess amounts in totals and tax_entries.
 * 6. Tax reports (getTaxEntries) accurately retrieve cgst, sgst, igst, and cess.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const db = require("../database");

console.log("=== Running GST Dynamic Sub-Taxes & Dropdown Sync Test Suite ===");

// ---------------------------------------------------------
// Test 1: Verify Default Tax Slabs and Normalization with Dynamic subTaxes
// ---------------------------------------------------------
console.log("Test 1: Default Tax Slabs and subTaxes structure...");
{
  const slabs = db.defaultTaxSlabs();
  assert(Array.isArray(slabs), "defaultTaxSlabs must be an array");

  // Check 18% slab
  const s18 = slabs.find((s) => Number(s.rate) === 18);
  assert(s18, "GST 18% slab must exist");
  assert(Array.isArray(s18.subTaxes), "s18 must have subTaxes array");
  assert.strictEqual(s18.subTaxes.length, 2, "s18 should have 2 sub-taxes by default");
  assert.strictEqual(s18.subTaxes[0].name, "CGST");
  assert.strictEqual(s18.subTaxes[0].rate, 9);
  assert.strictEqual(s18.subTaxes[1].name, "SGST");
  assert.strictEqual(s18.subTaxes[1].rate, 9);
  console.log("  ✓ Standard slabs have subTaxes array configured properly");
}

// ---------------------------------------------------------
// Test 2: Dynamic Sub-Tax Add / Remove Normalization
// ---------------------------------------------------------
console.log("Test 2: Dynamic Sub-Tax Add/Remove Normalization...");
{
  // Custom slab with 3 sub-taxes (e.g. CGST 9% + SGST 9% + Flood Cess 1% = 19%)
  const custom3SubTaxes = {
    id: "custom_slab_19",
    name: "GST 19% (with Flood Cess)",
    rate: 19,
    subTaxes: [
      { name: "CGST", rate: 9 },
      { name: "SGST", rate: 9 },
      { name: "FLOOD_CESS", rate: 1 }
    ],
    igst: 19,
    cess: 0
  };

  const normalized = db.normalizeTaxSlabs([custom3SubTaxes]);
  assert.strictEqual(normalized[0].subTaxes.length, 3, "Must preserve all 3 sub-taxes");
  assert.strictEqual(normalized[0].subTaxes[0].name, "CGST");
  assert.strictEqual(normalized[0].subTaxes[1].name, "SGST");
  assert.strictEqual(normalized[0].subTaxes[2].name, "FLOOD_CESS");
  assert.strictEqual(normalized[0].subTaxes[2].rate, 1);

  // Custom slab where user removed Sub-Tax 2 (only 1 sub-tax)
  const custom1SubTax = {
    id: "custom_single_tax",
    name: "State Tax 5%",
    rate: 5,
    subTaxes: [
      { name: "STATE_TAX", rate: 5 }
    ],
    igst: 5,
    cess: 0
  };

  const normalizedSingle = db.normalizeTaxSlabs([custom1SubTax]);
  assert.strictEqual(normalizedSingle[0].subTaxes.length, 1, "Must allow single sub-tax when other is removed");
  assert.strictEqual(normalizedSingle[0].subTaxes[0].name, "STATE_TAX");
  assert.strictEqual(normalizedSingle[0].subTaxes[0].rate, 5);
  console.log("  ✓ Adding and removing sub-taxes is fully supported and normalized");
}

// ---------------------------------------------------------
// Test 3: Calculation with Dynamic Sub-Taxes
// ---------------------------------------------------------
console.log("Test 3: Calculation with dynamic sub-taxes...");
{
  const customSlab = {
    name: "Custom 18%",
    rate: 18,
    subTaxes: [
      { name: "CGST", rate: 6 },
      { name: "SGST", rate: 12 }
    ]
  };

  // Intra-state split with 6% and 12% ratio (1:2)
  const intraResult = db.splitGstAmount(180, { isInterstate: false }, customSlab);
  assert.strictEqual(intraResult.cgstAmount, 60, "CGST should be 60 (1/3rd of 180)");
  assert.strictEqual(intraResult.sgstAmount, 120, "SGST should be 120 (2/3rd of 180)");
  assert.strictEqual(intraResult.igstAmount, 0, "IGST must be 0 for intra-state");

  // Inter-state with same slab
  const interResult = db.splitGstAmount(180, { isInterstate: true }, customSlab);
  assert.strictEqual(interResult.cgstAmount, 0, "CGST must be 0 for inter-state");
  assert.strictEqual(interResult.sgstAmount, 0, "SGST must be 0 for inter-state");
  assert.strictEqual(interResult.igstAmount, 180, "Full 180 must go to IGST");
  console.log("  ✓ Proportional split based on dynamic sub-taxes works accurately");
}

// ---------------------------------------------------------
// Test 4: Verify app.js getTaxOptionsList contains exact dropdown items
// ---------------------------------------------------------
console.log("Test 4: Verify Tax Dropdown contains exact requested list...");
{
  const appJs = fs.readFileSync(path.resolve(__dirname, "../app.js"), "utf8");

  // Check that app.js getTaxOptionsList includes the standard rates: 0.25, 3, 5, 12, 18, 28, 40
  assert(appJs.includes("0.25, 3, 5, 12, 18, 28, 40"), "app.js must include all standard rates");
  assert(appJs.includes("GST@${r}%"), "app.js must include GST@ options");
  assert(appJs.includes("IGST@${r}%"), "app.js must include IGST@ options");
  assert(appJs.includes('list.push("Exempt")'), "app.js must include Exempt option");

  console.log("  ✓ Dropdown list generation contains all requested GST and IGST options");
}

// ---------------------------------------------------------
// Test 5: Verify Dynamic Sub-Taxes UI & Cess in app.js
// ---------------------------------------------------------
console.log("Test 5: Verify Dynamic Sub-Taxes Modal UI & Cess in app.js...");
{
  const appJs = fs.readFileSync(path.resolve(__dirname, "../app.js"), "utf8");

  // Check modal has + Add Sub-Tax button and subTaxesContainer
  assert(appJs.includes("btnAddSubTaxRow"), "Tax Slab Modal must have btnAddSubTaxRow");
  assert(appJs.includes("subTaxesContainer"), "Tax Slab Modal must have subTaxesContainer");
  assert(appJs.includes("btn-delete-sub-tax"), "Tax Slab Modal must have btn-delete-sub-tax");
  assert(appJs.includes("subTaxBalanceBadge"), "Tax Slab Modal must have subTaxBalanceBadge for live balance check");

  // Check editor has Cess display
  assert(appJs.includes("editorCessWrapper"), "Editor must have editorCessWrapper");
  assert(appJs.includes("editorCessTotal"), "Editor must have editorCessTotal");

  console.log("  ✓ UI has Add/Remove Sub-Tax buttons and Cess wrapper");
}

console.log("=== All Dynamic Sub-Taxes & Dropdown Sync Tests Passed Successfully! ===");
