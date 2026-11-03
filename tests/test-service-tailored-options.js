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

    console.log("TEST 1: Verifying Service Item Type Tailored Options...");
    const serviceCheck = await window.webContents.executeJavaScript(`
      (() => {
        openEntryModal("item");

        // Click Service Chip
        const serviceChip = document.querySelector('.item-type-chip[data-item-type="service"]');
        serviceChip.click();

        const taxSelect = document.getElementById("itemTaxRate");
        const taxOptions = taxSelect ? Array.from(taxSelect.options).map(o => o.value) : [];

        const unitSelect = document.getElementById("itemUnitInput");
        const unitOptions = unitSelect ? Array.from(unitSelect.options).map(o => o.value) : [];

        const skuLabel = document.getElementById("itemSkuLabel")?.textContent?.trim();
        const skuPlaceholder = document.getElementById("itemSkuInput")?.placeholder;
        const autoBarcodeVisible = document.getElementById("generateBarcodeBtn")?.style.display !== "none";
        const printBarcodeVisible = document.getElementById("printBarcodeBtn")?.style.display !== "none";
        const hsnSacLabel = document.getElementById("hsnSacLabel")?.textContent?.trim();

        const purchasePriceGroup = document.getElementById("itemPurchasePriceFieldGroup");
        const purchasePriceVisible = purchasePriceGroup && purchasePriceGroup.style.display !== "none";
        const purchasePillVisible = document.getElementById("itemSummaryPurchasePill")?.style.display !== "none";
        const marginPillVisible = document.getElementById("itemSummaryMarginPill")?.style.display !== "none";
        const summaryStripIsService = document.getElementById("itemSummaryStrip")?.classList.contains("service-summary");
        const salePriceGridColumn = document.getElementById("itemSalePriceFieldGroup")?.style.gridColumn;

        return {
          taxOptions,
          unitOptions,
          skuLabel,
          skuPlaceholder,
          autoBarcodeVisible,
          printBarcodeVisible,
          hsnSacLabel,
          selectedUnit: unitSelect?.value,
          purchasePriceVisible,
          purchasePillVisible,
          marginPillVisible,
          summaryStripIsService,
          salePriceGridColumn,
        };
      })()
    `);

    // Verify Purchase Price is HIDDEN for Service
    assert.strictEqual(serviceCheck.purchasePriceVisible, false, "Purchase price field group must be hidden for service");
    assert.strictEqual(serviceCheck.purchasePillVisible, false, "Purchase summary pill must be hidden for service");
    assert.strictEqual(serviceCheck.marginPillVisible, false, "Margin summary pill must be hidden for service");
    assert.strictEqual(serviceCheck.summaryStripIsService, true, "Summary strip must have service-summary class");
    console.log("✓ Purchase Price input and cost/margin summary pills are completely hidden for service!");

    // 1. Verify Tax Options for Service (Should NOT include 0.25%, 3%, 40%)
    const unsuitedTax = ["IGST@0.25%", "GST@0.25%", "IGST@3%", "GST@3%", "IGST@40%", "GST@40%"];
    for (const badTax of unsuitedTax) {
      assert.ok(!serviceCheck.taxOptions.includes(badTax), `Service tax options must NOT include ${badTax}`);
    }
    assert.strictEqual(serviceCheck.taxOptions.length, 12, "Service should have exactly 12 valid GST tax options");
    console.log("✓ Service tax options properly exclude goods-only rates (0.25%, 3%, 40%)!");

    // 2. Verify Unit Options for Service (Should NOT include Kg, Gram, Litre, etc.)
    const unsuitedUnits = ["Kg", "Gram", "Litre", "ML", "Meter", "Sq Ft", "Bundle", "Roll", "Box", "Pair", "Pack"];
    for (const badUnit of unsuitedUnits) {
      assert.ok(!serviceCheck.unitOptions.includes(badUnit), `Service units must NOT include physical unit ${badUnit}`);
    }
    assert.ok(serviceCheck.unitOptions.includes("Hr"), "Service units must include Hr");
    assert.ok(serviceCheck.unitOptions.includes("Day"), "Service units must include Day");
    assert.ok(serviceCheck.unitOptions.includes("Month"), "Service units must include Month");
    assert.ok(serviceCheck.unitOptions.includes("Service"), "Service units must include Service");
    console.log("✓ Service unit options properly exclude physical goods packaging/weight units!");

    // 3. Verify Barcode / SKU tailored
    assert.strictEqual(serviceCheck.autoBarcodeVisible, false, "Auto barcode button must be hidden for service");
    assert.strictEqual(serviceCheck.printBarcodeVisible, false, "Print barcode button must be hidden for service");
    assert.strictEqual(serviceCheck.skuLabel, "Service Code", "SKU label should say Service Code");
    assert.strictEqual(serviceCheck.hsnSacLabel, "SAC Code", "HSN/SAC label should say SAC Code");
    console.log("✓ Barcode scanner and auto-generate buttons properly hidden for service!");

    // Capture screenshot of Service Item modal
    await new Promise((r) => setTimeout(r, 400));
    const imgServiceModal = await window.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "service_item_tailored_modal.png"), imgServiceModal.toPNG());
    console.log("✓ Saved service_item_tailored_modal.png");

    console.log("\nTEST 2: Verifying switching back to Product restores all standard options...");
    const productCheck = await window.webContents.executeJavaScript(`
      (() => {
        const productChip = document.querySelector('.item-type-chip[data-item-type="product"]');
        productChip.click();

        const taxSelect = document.getElementById("itemTaxRate");
        const taxOptions = taxSelect ? Array.from(taxSelect.options).map(o => o.value) : [];

        const unitSelect = document.getElementById("itemUnitInput");
        const unitOptions = unitSelect ? Array.from(unitSelect.options).map(o => o.value) : [];

        const skuLabel = document.getElementById("itemSkuLabel")?.textContent?.trim();
        const autoBarcodeVisible = document.getElementById("generateBarcodeBtn")?.style.display !== "none";
        const printBarcodeVisible = document.getElementById("printBarcodeBtn")?.style.display !== "none";

        const purchasePriceGroup = document.getElementById("itemPurchasePriceFieldGroup");
        const purchasePriceVisible = purchasePriceGroup && purchasePriceGroup.style.display !== "none";
        const purchasePillVisible = document.getElementById("itemSummaryPurchasePill")?.style.display !== "none";
        const marginPillVisible = document.getElementById("itemSummaryMarginPill")?.style.display !== "none";
        const summaryStripIsService = document.getElementById("itemSummaryStrip")?.classList.contains("service-summary");

        return {
          taxOptionsCount: taxOptions.length,
          taxOptions,
          unitOptions,
          skuLabel,
          autoBarcodeVisible,
          printBarcodeVisible,
          purchasePriceVisible,
          purchasePillVisible,
          marginPillVisible,
          summaryStripIsService,
        };
      })()
    `);

    assert.strictEqual(productCheck.taxOptionsCount, 18, "Product tax options must restore all 18 options");
    assert.ok(productCheck.unitOptions.includes("Kg"), "Product units must include physical units like Kg");
    assert.strictEqual(productCheck.autoBarcodeVisible, true, "Auto barcode button must be visible for product");
    assert.strictEqual(productCheck.printBarcodeVisible, true, "Print barcode button must be visible for product");
    assert.strictEqual(productCheck.skuLabel, "Barcode / SKU", "SKU label should restore to Barcode / SKU");
    assert.strictEqual(productCheck.purchasePriceVisible, true, "Purchase price must restore for product");
    assert.strictEqual(productCheck.purchasePillVisible, true, "Purchase pill must restore for product");
    assert.strictEqual(productCheck.marginPillVisible, true, "Margin pill must restore for product");
    assert.strictEqual(productCheck.summaryStripIsService, false, "Summary strip must not be service-summary for product");
    console.log("✓ Product type cleanly restores all standard product options, purchase fields and barcode controls!");

    console.log("\n=======================================================");
    console.log("   ALL SERVICE TAILORED OPTIONS TESTS PASSED 100%!     ");
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
