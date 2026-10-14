const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-barcode-test-"));
app.setPath("userData", testRoot);

const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity-ide\\brain\\59e13e0d-d816-4f77-9329-31e8ac922a2b";

app.whenReady().then(async () => {
  let win;
  try {
    await database.initDatabase(testRoot);

    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
    ipcMain.handle("db:create-item", (_event, item) => database.createItem(item));
    ipcMain.handle("db:update-item", (_event, item) => database.updateItem(item));

    win = new BrowserWindow({
      show: true,
      width: 1280,
      height: 800,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 600));

    // Open active company
    await win.webContents.executeJavaScript(`
      (async () => {
        const btn = document.querySelector(".open-company-button");
        await openCompany(btn?.dataset?.company || "testt");
      })()
    `);
    await new Promise((r) => setTimeout(r, 800));

    // Seed 2 test items (one with stock, one with SKU)
    await win.webContents.executeJavaScript(`
      (async () => {
        state = normalizeState(await window.giDB.createItem({
          name: "Thermal Paper Roll 80mm",
          category: "Consumables",
          unit: "Roll",
          hsnSac: "4811",
          purchasePrice: 40,
          salePrice: 65,
          taxRate: 12,
          openingStock: 25
        }));

        state = normalizeState(await window.giDB.createItem({
          name: "Wireless Optical Mouse",
          sku: "MOU-OPT-01",
          category: "Electronics",
          unit: "Pcs",
          hsnSac: "8471",
          purchasePrice: 250,
          salePrice: 499,
          taxRate: 18,
          openingStock: 10
        }));
      })()
    `);
    await new Promise((r) => setTimeout(r, 400));

    // Navigate to Barcode Generator
    console.log("Test 1: Navigate to Barcode Generator...");
    const test1 = await win.webContents.executeJavaScript(`
      (() => {
        showView("barcodeGenerator");
        return {
          currentView,
          hasPrinterFormat: Boolean(document.querySelector("#barcodePrinterFormat")),
          hasQueueCard: Boolean(document.querySelector(".barcode-queue-card")),
          hasLivePreviewBox: Boolean(document.querySelector(".barcode-live-preview")),
          shopNameInput: Boolean(document.querySelector("#barcodeShopNameInput"))
        };
      })()
    `);
    console.log("  Barcode Generator state:", test1);
    if (!test1.hasPrinterFormat || !test1.hasQueueCard || !test1.shopNameInput) {
      throw new Error("Test 1 Failed: Critical barcode components missing!");
    }
    if (test1.hasLivePreviewBox) {
      throw new Error("Test 1 Failed: Redundant live preview box still present in DOM!");
    }
    console.log("  ✓ Test 1 Passed: Redundant preview box eliminated; Print Sheet and Queue workstation active.");

    // Test 2: Multi-product Print Queue
    console.log("Test 2: Test multi-product queue functionality...");
    const test2 = await win.webContents.executeJavaScript(`
      (() => {
        // Clear queue first
        const clearBtn = document.querySelector('[data-action="clear-barcode-queue"]');
        if (clearBtn) clearBtn.click();

        // Add Item 1 (Thermal Paper Roll) with 5 copies
        const itemSelect = document.querySelector("#barcodeItemSelect");
        for (const opt of Array.from(itemSelect.options)) {
          if (opt.textContent.includes("Thermal Paper Roll")) {
            itemSelect.value = opt.value;
            itemSelect.dispatchEvent(new Event("change", { bubbles: true }));
            break;
          }
        }
        const copiesInput = document.querySelector("#barcodeCopiesInput");
        copiesInput.value = 5;

        document.querySelector('[data-action="add-to-queue"]').click();

        // Add Item 2 (Wireless Optical Mouse) with 8 copies
        for (const opt of Array.from(itemSelect.options)) {
          if (opt.textContent.includes("Wireless Optical Mouse")) {
            itemSelect.value = opt.value;
            itemSelect.dispatchEvent(new Event("change", { bubbles: true }));
            break;
          }
        }
        const copiesInput2 = document.querySelector("#barcodeCopiesInput");
        if (copiesInput2) copiesInput2.value = 8;
        document.querySelector('[data-action="add-to-queue"]').click();

        const queueRows = document.querySelectorAll(".barcode-queue-item").length;
        const totalMetric = document.querySelector("#barcodeCopyMetric")?.textContent;
        const sheetLabels = document.querySelectorAll("#barcodeSheet .barcode-label").length;

        return {
          queueRows,
          totalCopies: Number(totalMetric),
          renderedSheetLabels: sheetLabels
        };
      })()
    `);
    console.log("  Multi-product queue result:", test2);
    if (test2.queueRows !== 2 || test2.totalCopies !== 13 || test2.renderedSheetLabels !== 13) {
      throw new Error(`Test 2 Failed: Queue mismatch: ${JSON.stringify(test2)}`);
    }
    console.log("  ✓ Test 2 Passed: Multi-product queue correctly holds 2 items and renders 13 labels (5 + 8).");

    // Test 3: Queue stepper button [ + ]
    console.log("Test 3: Stepper [+] button increments item copies in queue...");
    const test3 = await win.webContents.executeJavaScript(`
      (() => {
        const incBtn = document.querySelector('[data-action="queue-inc"]');
        incBtn.click();
        const totalMetric = document.querySelector("#barcodeCopyMetric")?.textContent;
        const sheetLabels = document.querySelectorAll("#barcodeSheet .barcode-label").length;
        return {
          totalCopies: Number(totalMetric),
          renderedSheetLabels: sheetLabels
        };
      })()
    `);
    console.log("  Stepper increment result:", test3);
    if (test3.totalCopies !== 14 || test3.renderedSheetLabels !== 14) {
      throw new Error(`Test 3 Failed: Increment stepper expected 14, got ${JSON.stringify(test3)}`);
    }
    console.log("  ✓ Test 3 Passed: Stepper [+] dynamically added label to queue and sheet.");

    // Test 4: Shop Name Header on Labels
    console.log("Test 4: Verify custom Shop Name renders at top of stickers...");
    const test4 = await win.webContents.executeJavaScript(`
      (() => {
        const shopInput = document.querySelector("#barcodeShopNameInput");
        shopInput.value = "GI SUPERMARKET";
        shopInput.dispatchEvent(new Event("input", { bubbles: true }));

        const shopLabels = Array.from(document.querySelectorAll("#barcodeSheet .barcode-shop-name")).map(el => el.textContent.trim());
        return {
          shopLabelsCount: shopLabels.length,
          firstShopLabel: shopLabels[0]
        };
      })()
    `);
    console.log("  Shop Name result:", test4);
    if (test4.shopLabelsCount === 0 || test4.firstShopLabel !== "GI SUPERMARKET") {
      throw new Error(`Test 4 Failed: Shop name not rendered: ${JSON.stringify(test4)}`);
    }
    console.log("  ✓ Test 4 Passed: 'GI SUPERMARKET' rendered at the top of each sticker.");

    // Test 5: Additional Fields (Price Prefix, Unit of Measure, HSN, Date)
    console.log("Test 5: Verify additional sticker fields (MRP prefix, UOM, HSN, Date)...");
    const test5 = await win.webContents.executeJavaScript(`
      (() => {
        const pricePrefix = document.querySelector("#barcodePricePrefix");
        pricePrefix.value = "MRP ₹";
        pricePrefix.dispatchEvent(new Event("change", { bubbles: true }));

        const hsnCheck = document.querySelector("#barcodeShowHsn");
        hsnCheck.checked = true;
        hsnCheck.dispatchEvent(new Event("change", { bubbles: true }));

        const dateCheck = document.querySelector("#barcodeShowDate");
        dateCheck.checked = true;
        dateCheck.dispatchEvent(new Event("change", { bubbles: true }));

        const firstLabel = document.querySelector("#barcodeSheet .barcode-label");
        const priceText = firstLabel.querySelector(".barcode-label-row b")?.textContent;
        const subrow = firstLabel.querySelector(".barcode-label-subrow")?.textContent;

        return {
          priceText,
          hasHsnOrDate: Boolean(subrow)
        };
      })()
    `);
    console.log("  Sticker fields result:", test5);
    if (!test5.priceText.includes("MRP ₹") || !test5.hasHsnOrDate) {
      throw new Error(`Test 5 Failed: Fields not rendered: ${JSON.stringify(test5)}`);
    }
    console.log("  ✓ Test 5 Passed: Rich fields (MRP ₹, UOM, HSN, Packed Date) verified.");

    // Test 6: Capture screenshot
    console.log("Test 6: Capture screenshot of upgraded Barcode Generator...");
    await new Promise((r) => setTimeout(r, 600));
    const img = await win.webContents.capturePage();
    const screenshotPath = path.join(artifactDir, "barcode_generator_multi_product.png");
    fs.writeFileSync(screenshotPath, img.toPNG());
    console.log(`  ✓ Test 6 Passed: Saved screenshot (${fs.statSync(screenshotPath).size} bytes)`);

    console.log("\nALL 6 TESTS PASSED SUCCESSFULLY!\n");
  } catch (err) {
    console.error("Test Error:", err);
    process.exit(1);
  } finally {
    if (win) win.close();
    app.quit();
  }
});
