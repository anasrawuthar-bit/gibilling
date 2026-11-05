const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const db = require("../database");

async function run() {
  console.log("▶ Testing Tax Customization, Split Breakdown & Cess Architecture...");

  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "zynbill-tax-cess-test-"));
  await db.initDatabase(testRoot);

  // 1. Verify default taxSlabs and Cess setting in database
  const state = db.getState();
  const settings = state.businessSettings || {};

  assert.strictEqual(settings.enableTax, true, "enableTax should default to true");
  assert.strictEqual(settings.enableCess, false, "enableCess should default to false");
  assert.ok(Array.isArray(settings.taxSlabs), "taxSlabs should be an array");
  assert.strictEqual(settings.taxSlabs.length, 8, "Default standard tax slabs count should be 8 (0, 0.25, 3, 5, 12, 18, 28, 40)");

  // Verify intra-state split (CGST + SGST = rate) on 18% slab
  const slab18 = settings.taxSlabs.find((s) => s.rate === 18);
  assert.ok(slab18, "18% tax slab must exist");
  assert.strictEqual(slab18.cgst, 9, "CGST for 18% must be 9%");
  assert.strictEqual(slab18.sgst, 9, "SGST for 18% must be 9%");
  assert.strictEqual(slab18.igst, 18, "IGST for 18% must be 18%");
  assert.strictEqual(slab18.cess, 0, "Default Cess for 18% must be 0%");

  console.log("  ✓ Database defaults verified: enableTax=true, enableCess=false, 8 standard slabs with 50/50 CGST/SGST split");

  // 2. Test enabling Cess and adding a custom slab with Cess (e.g. 28% + 12% Cess or new 6% rate)
  const updatedSlabs = [
    ...settings.taxSlabs,
    { id: "tax_6", name: "GST 6%", rate: 6, cgst: 3, sgst: 3, igst: 6, cess: 0, isStandard: false },
    { id: "tax_28_cess", name: "Luxury Goods 28% + 12% Cess", rate: 28, cgst: 14, sgst: 14, igst: 28, cess: 12, isStandard: false },
  ];

  const updatedState = await db.updateBusinessSettings({
    enableCess: true,
    taxSlabs: updatedSlabs,
  });

  const nextSettings = updatedState.businessSettings;
  assert.strictEqual(nextSettings.enableCess, true, "enableCess should be updated to true");
  assert.ok(nextSettings.taxSlabs.some((s) => s.name === "GST 6%" && s.rate === 6 && s.cgst === 3 && s.sgst === 3), "Custom 6% slab persisted with split");
  assert.ok(nextSettings.taxSlabs.some((s) => s.cess === 12), "Slab with 12% Cess persisted");
  assert.ok(nextSettings.customTaxRates.includes(6), "customTaxRates automatically synced custom 6% rate");

  console.log("  ✓ Cess toggle and custom slab addition verified with SQLite persistence");

  // 3. Test editing an existing slab
  const editedSlabs = nextSettings.taxSlabs.map((s) => {
    if (s.rate === 6) {
      return { ...s, name: "Concessional GST 6%", cgst: 3, sgst: 3, igst: 6 };
    }
    return s;
  });

  const afterEditState = await db.updateBusinessSettings({
    taxSlabs: editedSlabs,
  });

  const editedSlab = afterEditState.businessSettings.taxSlabs.find((s) => s.rate === 6);
  assert.strictEqual(editedSlab.name, "Concessional GST 6%", "Edited slab name updated in database");

  console.log("  ✓ Editing tax slab verified with SQLite persistence");

  // 4. Test deleting a slab
  const without6 = afterEditState.businessSettings.taxSlabs.filter((s) => s.rate !== 6);
  const afterDeleteState = await db.updateBusinessSettings({
    taxSlabs: without6,
  });
  assert.ok(!afterDeleteState.businessSettings.taxSlabs.some((s) => s.rate === 6), "Deleted 6% slab no longer in database");

  console.log("  ✓ Deleting tax slab verified");

  // 5. Test frontend app.js structural integrity
  const appJs = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");

  // Must have dedicated Tax tab (not Tax & Inventory)
  assert.ok(appJs.includes('{ id: "TAX", label: "Tax", note: "GST slabs, CGST/SGST & Cess", icon: "calculator" }'), "SETTINGS_TABS must include dedicated 'Tax' tab");
  assert.ok(appJs.includes('{ id: "INVENTORY", label: "Inventory Rules", note: "Negative stock, MRP & HSN", icon: "box" }'), "SETTINGS_TABS must include dedicated 'Inventory Rules' tab");
  assert.ok(appJs.includes('function settingsTaxTemplate()'), "settingsTaxTemplate must be defined");
  assert.ok(appJs.includes('function settingsInventoryTemplate()'), "settingsInventoryTemplate must be defined");
  assert.ok(appJs.includes('function openTaxSlabModal('), "openTaxSlabModal must be defined for adding & editing slabs");
  assert.ok(appJs.includes('Intra-State Split (CGST + SGST)'), "Tax table must display Intra-State Split (CGST + SGST)");
  assert.ok(appJs.includes('Inter-State (IGST)'), "Tax table must display Inter-State (IGST)");
  assert.ok(appJs.includes('Enable Cess (Compensation / Additional Cess)'), "Settings must have Enable Cess toggle");

  console.log("  ✓ app.js UI templates verified: Dedicated 'Tax' tab, split columns, modal dialog, and Cess control");

  console.log("\n==================================================================");
  console.log("   TAX CUSTOMIZATION, SPLIT & CESS TESTS PASSED 100%!           ");
  console.log("==================================================================\n");
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
