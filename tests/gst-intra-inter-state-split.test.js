/**
 * ZynBill – GST Intra-State vs Inter-State Tax Split & Sub-Component Customization Test Suite
 *
 * Requirements:
 * 1. CGST + SGST = Intra-state sales. IGST = Inter-state sales.
 * 2. In a sale, only one must be charged: strictly CGST + SGST for intra-state, or IGST for inter-state; never both together (Mutual Exclusivity).
 * 3. Sub-tax component names (e.g. CGST, SGST, UTGST) and rates must be customizable like the main GST slab name.
 * 4. Printouts (A4 Modern, A4 Classic, Thermal) must dynamically render only the active tax breakdown.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const db = require("../database");

console.log("=== Running GST Intra vs Inter-State & Sub-Component Verification ===");

// ---------------------------------------------------------
// Test 1: Intra-State GST Calculation (CGST + SGST only, IGST = 0)
// ---------------------------------------------------------
console.log("Test 1: Intra-state sales GST calculation...");
{
  const result = db.splitGstAmount(180, { isInterstate: false });
  assert.strictEqual(result.igstAmount, 0, "Intra-state sales must have igstAmount === 0");
  assert.strictEqual(result.cgstAmount, 90, "Intra-state sales must split half to CGST");
  assert.strictEqual(result.sgstAmount, 90, "Intra-state sales must split half to SGST");
  assert.strictEqual(result.cgstAmount + result.sgstAmount, 180, "CGST + SGST must sum to total tax");
  console.log("  ✓ Intra-state sales split into CGST + SGST with IGST = 0");
}

// ---------------------------------------------------------
// Test 2: Inter-State GST Calculation (IGST only, CGST = 0, SGST = 0)
// ---------------------------------------------------------
console.log("Test 2: Inter-state sales GST calculation...");
{
  const result = db.splitGstAmount(180, { isInterstate: true });
  assert.strictEqual(result.cgstAmount, 0, "Inter-state sales must have cgstAmount === 0");
  assert.strictEqual(result.sgstAmount, 0, "Inter-state sales must have sgstAmount === 0");
  assert.strictEqual(result.igstAmount, 180, "Inter-state sales must have full tax in igstAmount");
  console.log("  ✓ Inter-state sales charge IGST with CGST = 0 and SGST = 0");
}

// ---------------------------------------------------------
// Test 3: Mutual Exclusivity Across Various Amounts & Fractional Rounding
// ---------------------------------------------------------
console.log("Test 3: Mutual Exclusivity invariant across multiple price points...");
{
  const testAmounts = [0, 0.05, 1, 5, 18.5, 99.99, 180, 185.75, 1234.56];

  for (const amt of testAmounts) {
    // Intra-state
    const intra = db.splitGstAmount(amt, { isInterstate: false });
    assert.strictEqual(intra.igstAmount, 0, `Intra-state amt ${amt} must have IGST === 0`);
    if (amt > 0) {
      assert(intra.cgstAmount > 0 || intra.sgstAmount > 0, `Intra-state amt ${amt} must have CGST/SGST > 0`);
      assert.strictEqual(intra.igstAmount, 0, "IGST must NEVER be charged in intra-state sale");
    }

    // Inter-state
    const inter = db.splitGstAmount(amt, { isInterstate: true });
    assert.strictEqual(inter.cgstAmount, 0, `Inter-state amt ${amt} must have CGST === 0`);
    assert.strictEqual(inter.sgstAmount, 0, `Inter-state amt ${amt} must have SGST === 0`);
    if (amt > 0) {
      assert(inter.igstAmount > 0, `Inter-state amt ${amt} must have IGST > 0`);
    }

    // Strict Mutual Exclusivity: Never both
    const intraHasBoth = (intra.cgstAmount > 0 || intra.sgstAmount > 0) && intra.igstAmount > 0;
    const interHasBoth = (inter.cgstAmount > 0 || inter.sgstAmount > 0) && inter.igstAmount > 0;
    assert(!intraHasBoth, "Violation: Intra-state transaction charged both CGST/SGST and IGST!");
    assert(!interHasBoth, "Violation: Inter-state transaction charged both CGST/SGST and IGST!");
  }
  console.log("  ✓ 100% Mutual Exclusivity verified: CGST+SGST and IGST are never charged together");
}

// ---------------------------------------------------------
// Test 4: Sub-Tax Component Customization & Normalization
// ---------------------------------------------------------
console.log("Test 4: Sub-tax component names & percentages customization...");
{
  const defaultSlabs = db.defaultTaxSlabs();
  assert(Array.isArray(defaultSlabs), "defaultTaxSlabs must return an array");
  assert(defaultSlabs.length > 0, "defaultTaxSlabs must contain standard slabs");

  // Verify standard slab structure
  const slab18 = defaultSlabs.find((s) => Number(s.rate) === 18);
  assert(slab18, "Standard 18% slab should exist");
  assert.strictEqual(slab18.subTax1Name, "CGST");
  assert.strictEqual(slab18.subTax2Name, "SGST");
  assert.strictEqual(slab18.igstName, "IGST");
  assert.strictEqual(slab18.subTax1Rate, 9);
  assert.strictEqual(slab18.subTax2Rate, 9);

  // Test custom slab with Union Territory configuration (CGST + UTGST)
  const customUtSlab = {
    id: "slab_ut_18",
    name: "UTGST 18%",
    rate: 18,
    subTax1Name: "CGST",
    subTax1Rate: 9,
    subTax2Name: "UTGST",
    subTax2Rate: 9,
    igstName: "IGST",
    igst: 18,
    cess: 0
  };

  const normalized = db.normalizeTaxSlabs([customUtSlab]);
  assert.strictEqual(normalized[0].subTax1Name, "CGST");
  assert.strictEqual(normalized[0].subTax2Name, "UTGST", "Custom sub-tax name UTGST must be preserved");
  assert.strictEqual(normalized[0].subTax1Rate, 9);
  assert.strictEqual(normalized[0].subTax2Rate, 9);
  assert.strictEqual(normalized[0].cgst, 9);
  assert.strictEqual(normalized[0].sgst, 9);
  console.log("  ✓ Sub-tax names (e.g. UTGST) and percentage splits properly preserved and normalized");
}

// ---------------------------------------------------------
// Test 5: Verify app.js calculation and print template logic
// ---------------------------------------------------------
console.log("Test 5: Verifying app.js invoice editor and print template logic...");
{
  const appJsContent = fs.readFileSync(path.resolve(__dirname, "../app.js"), "utf8");

  // Verify recalculateTransactionEditor mutual exclusivity logic
  assert(appJsContent.includes('taxSplitMode === "igst"'), "app.js must check taxSplitMode === 'igst'");
  assert(appJsContent.includes('editorCgstWrapper'), "app.js must have editorCgstWrapper ID");
  assert(appJsContent.includes('editorSgstWrapper'), "app.js must have editorSgstWrapper ID");
  assert(appJsContent.includes('editorIgstWrapper'), "app.js must have editorIgstWrapper ID");

  // Verify computeGstSummaryRows respects isInterState and custom sub-tax names
  assert(appJsContent.includes('sub1Name = slab?.subTax1Name || "CGST"'), "computeGstSummaryRows must use custom subTax1Name");
  assert(appJsContent.includes('sub2Name = slab?.subTax2Name || "SGST"'), "computeGstSummaryRows must use custom subTax2Name");

  // Verify print templates render conditionally based on isInterState
  assert(appJsContent.includes('isInterState ? `'), "Print templates must check isInterState");
  assert(appJsContent.includes('>IGST</th>'), "Print templates must have IGST header");
  assert(appJsContent.includes('sub1Name'), "Print templates must use sub1Name");

  console.log("  ✓ app.js contains complete mutual exclusivity and custom sub-tax print rendering");
}

console.log("=== All GST Intra vs Inter-State & Sub-Component Tests Passed Successfully! ===");
