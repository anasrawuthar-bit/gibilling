const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-barcode-workflow-"));
app.setPath("userData", testRoot);

const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity-ide\\brain\\59e13e0d-d816-4f77-9329-31e8ac922a2b";

app.whenReady().then(async () => {
  let win = null;
  try {
    await database.initDatabase(testRoot);

    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
    ipcMain.handle("db:create-item", (_event, item) => database.createItem(item));
    ipcMain.handle("db:update-item", (_event, item) => database.updateItem(item));

    win = new BrowserWindow({
      show: true,
      width: 1440,
      height: 900,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    win.webContents.on("console-message", (_event, _level, message) => {
      if (message.includes("error") || message.includes("Error")) {
        console.log("Renderer Console:", message);
      }
    });

    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Open company
    await win.webContents.executeJavaScript(`
      (async () => {
        const btn = document.querySelector(".open-company-button");
        await openCompany(btn?.dataset?.company || "testt");
      })()
    `);
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Seed test products: one with stock & SKU, one with stock without SKU
    await win.webContents.executeJavaScript(`
      (async () => {
        state = normalizeState(await window.giDB.createItem({
          name: "Thermal Paper Roll 80mm",
          category: "Consumables",
          unit: "Roll",
          salePrice: 65,
          openingStock: 25,
          sku: "10001",
          hsnSac: "4811",
        }));
        state = normalizeState(await window.giDB.createItem({
          name: "Wireless Optical Mouse",
          category: "Electronics",
          unit: "Pcs",
          salePrice: 450,
          openingStock: 14,
          sku: "",
          hsnSac: "8471",
        }));
      })()
    `);
    await new Promise((resolve) => setTimeout(resolve, 500));

    console.log("\n=== TESTING COMPREHENSIVE BARCODE WORKFLOW INTEGRATION ===\n");

    // Test 1: Item Modal Auto-Generate Barcode & Print Action
    console.log("Test 1: Verify Item Modal 'Auto-Generate' button generates valid barcode...");
    const test1 = await win.webContents.executeJavaScript(`
      (async () => {
        openEntryModal("item");
        const skuInput = document.querySelector("#itemSkuInput");
        const autogenBtn = document.querySelector('[data-action="generate-item-barcode"]');
        const printBtn = document.querySelector('[data-action="print-single-item-barcode"]');

        const initialSku = skuInput?.value || "";
        if (autogenBtn) autogenBtn.click();
        const generatedSku = skuInput?.value || "";

        closeEntryModal();

        return {
          hasAutogenBtn: Boolean(autogenBtn),
          hasPrintBtn: Boolean(printBtn),
          initialSku,
          generatedSku,
          isValidFormat: /^\\d{5,}$/.test(generatedSku)
        };
      })()
    `);
    console.log("  Item Modal barcode tools:", test1);
    if (!test1.hasAutogenBtn || !test1.hasPrintBtn || !test1.isValidFormat) {
      throw new Error(`Test 1 Failed: Item Modal auto-gen failed: ${JSON.stringify(test1)}`);
    }
    console.log("  ✓ Test 1 Passed: Item Modal includes 'Auto-Generate' & 'Quick Print' buttons, generating valid barcode:", test1.generatedSku);

    // Test 2: Item Detail 'Print Barcode' button
    console.log("Test 2: Verify Item Detail 'Print Barcode' button loads product into print center...");
    const test2 = await win.webContents.executeJavaScript(`
      (async () => {
        showView("items");
        const firstRow = document.querySelector(".item-row");
        if (firstRow) firstRow.click();
        
        const printBarcodeBtn = document.querySelector('[data-action="print-item-barcode"]');
        const hasBtn = Boolean(printBarcodeBtn);
        if (printBarcodeBtn) printBarcodeBtn.click();

        return {
          hasBtn,
          currentView: currentView || document.body.dataset.view,
          queuedCount: barcodeQueue.length
        };
      })()
    `);
    console.log("  Item Detail print action:", test2);
    if (!test2.hasBtn || test2.currentView !== "barcodeGenerator" || test2.queuedCount < 1) {
      throw new Error(`Test 2 Failed: Item Detail print failed: ${JSON.stringify(test2)}`);
    }
    console.log("  ✓ Test 2 Passed: Clicking 'Print Barcode' on Item Detail opens Barcode Generator with product queued.");

    // Test 3: Catalog Checklist Table and Select All
    console.log("Test 3: Verify Catalog Checklist Table and 'Select All' bulk action...");
    const test3 = await win.webContents.executeJavaScript(`
      (async () => {
        showView("barcodeGenerator");
        const clearBtn = document.querySelector('[data-action="clear-barcode-queue"]');
        if (clearBtn) clearBtn.click();

        const selectAllBtn = document.querySelector('[data-action="select-all-visible"]');
        if (selectAllBtn) selectAllBtn.click();

        const totalItems = barcodeFilteredItems(state.items || []).length;
        const totalMetric = Number(document.querySelector("#barcodeCopyMetric")?.textContent || 0);
        const queuedCount = barcodeQueue.length;

        return {
          totalItems,
          queuedCount,
          totalMetric
        };
      })()
    `);
    console.log("  Bulk select result:", test3);
    if (test3.queuedCount !== test3.totalItems || test3.totalMetric < test3.totalItems) {
      throw new Error(`Test 3 Failed: Bulk select failed: ${JSON.stringify(test3)}`);
    }
    console.log(`  ✓ Test 3 Passed: 'Select All' selected all ${test3.queuedCount} catalog products into the queue.`);

    // Test 4: 'Copies = Stock' Bulk Action
    console.log("Test 4: Verify 'Copies = Stock' matches label copies to live stock quantities...");
    const test4 = await win.webContents.executeJavaScript(`
      (async () => {
        const matchStockBtn = document.querySelector('[data-action="match-all-stock-copies"]');
        if (matchStockBtn) matchStockBtn.click();

        const totalStockSum = barcodeQueue.reduce((sum, entry) => {
          const item = findBarcodeItem(entry.itemId);
          return sum + Math.max(1, Number(item?.currentStock || item?.openingStock || 1));
        }, 0);

        const totalMetric = Number(document.querySelector("#barcodeCopyMetric")?.textContent || 0);

        return {
          totalStockSum,
          totalMetric,
          matches: totalStockSum === totalMetric
        };
      })()
    `);
    console.log("  Copies = Stock result:", test4);
    if (!test4.matches) {
      throw new Error(`Test 4 Failed: Stock copies mismatch: ${JSON.stringify(test4)}`);
    }
    console.log("  ✓ Test 4 Passed: 'Copies = Stock' dynamically set total copies to match live stock:", test4.totalMetric);

    // Test 5: '⚡ Auto-Generate SKUs' Bulk Action
    console.log("Test 5: Verify '⚡ Auto-Generate SKUs' assigns barcodes to items lacking SKUs...");
    const test5 = await win.webContents.executeJavaScript(`
      (async () => {
        const autogenBtn = document.querySelector('[data-action="autogen-all-missing"]');
        if (autogenBtn) autogenBtn.click();
        await new Promise((r) => setTimeout(r, 600));

        const unassigned = (state.items || []).filter((i) => itemKind(i).label !== "Service" && !String(i.sku || "").trim());
        const mouse = (state.items || []).find((i) => i.name === "Wireless Optical Mouse");

        return {
          unassignedCount: unassigned.length,
          mouseSku: mouse?.sku || ""
        };
      })()
    `);
    console.log("  Batch SKU generation result:", test5);
    if (test5.unassignedCount > 0 || !test5.mouseSku) {
      throw new Error(`Test 5 Failed: Missing SKUs not generated: ${JSON.stringify(test5)}`);
    }
    console.log(`  ✓ Test 5 Passed: All products assigned barcodes (e.g. Wireless Mouse = ${test5.mouseSku}).`);

    // Test 6: Capture screenshot of the enhanced Barcode Workstation
    console.log("Test 6: Capture screenshot of the enhanced Barcode Workstation...");
    await new Promise((resolve) => setTimeout(resolve, 800));
    const img = await win.webContents.capturePage();
    const screenshotPath = path.join(artifactDir, "barcode_center_comprehensive_workflow.png");
    fs.writeFileSync(screenshotPath, img.toPNG());
    console.log(`  ✓ Test 6 Passed: Screenshot captured (${fs.statSync(screenshotPath).size} bytes) -> ${screenshotPath}`);

    console.log("\nALL 6 WORKFLOW INTEGRATION TESTS PASSED 100%!\n");
  } catch (err) {
    console.error("Test Error:", err);
    process.exit(1);
  } finally {
    if (win) win.close();
    app.quit();
  }
});
