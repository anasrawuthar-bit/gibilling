const { app, BrowserWindow } = require("electron");
const path = require("path");
const assert = require("assert");
const fs = require("fs");

const testRoot = path.join(__dirname, "..", "tmp-test-items-nodate");
if (!fs.existsSync(testRoot)) fs.mkdirSync(testRoot, { recursive: true });
app.setPath("userData", testRoot);

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      width: 1366,
      height: 820,
      show: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 1200));

    console.log("Navigating to Items page...");
    await win.webContents.executeJavaScript(`
      (() => {
        state.items = [
          { id: 1, name: "Wireless Mouse", sku: "WM-01", category: "Electronics", itemType: "product", currentStock: 25, salePrice: 600, purchasePrice: 400, unit: "Pcs" },
          { id: 2, name: "Mechanical Keyboard", sku: "MK-02", category: "Electronics", itemType: "product", currentStock: 4, minStock: 5, salePrice: 2500, purchasePrice: 1800, unit: "Pcs" },
          { id: 3, name: "USB-C Hub", sku: "UH-03", category: "Accessories", itemType: "product", currentStock: 0, salePrice: 1200, purchasePrice: 800, unit: "Pcs" },
          { id: 4, name: "Hardware Repair Service", sku: "SRV-01", category: "Services", itemType: "service", currentStock: 0, salePrice: 1500, purchasePrice: 0, unit: "Hrs" }
        ];
        state.itemCategories = [
          { id: 1, name: "Electronics", is_active: true },
          { id: 2, name: "Accessories", is_active: true },
          { id: 3, name: "Services", is_active: true }
        ];
        const itemsBtn = document.querySelector('.nav-item[data-view="items"]');
        if (itemsBtn) {
          itemsBtn.click();
        } else {
          navigateView("items");
        }
      })()
    `);

    await new Promise((r) => setTimeout(r, 1500));

    const check = await win.webContents.executeJavaScript(`
      (() => {
        const filterBar = document.querySelector(".item-filter-bar");
        const dateSelect = document.querySelector("#itemDateTypeSelect");
        const dateFrom = document.querySelector("#itemDateFrom");
        const dateTo = document.querySelector("#itemDateTo");
        const stockSelect = document.querySelector("#itemStockFilterSelect");
        const typeSelect = document.querySelector("#itemTypeFilterSelect");
        const catSelect = document.querySelector("#itemCategoryFilter");
        const filterBarText = filterBar?.textContent || "";

        return {
          hasDateSelect: Boolean(dateSelect),
          hasDateFrom: Boolean(dateFrom),
          hasDateTo: Boolean(dateTo),
          hasStockSelect: Boolean(stockSelect),
          hasTypeSelect: Boolean(typeSelect),
          hasCatSelect: Boolean(catSelect),
          filterBarHasDateTypeText: filterBarText.includes("Date Type")
        };
      })()
    `);

    console.log("Items page filter check:", check);
    assert.strictEqual(check.hasDateSelect, false, "itemDateTypeSelect must NOT be present");
    assert.strictEqual(check.hasDateFrom, false, "itemDateFrom must NOT be present");
    assert.strictEqual(check.hasDateTo, false, "itemDateTo must NOT be present");
    assert.strictEqual(check.filterBarHasDateTypeText, false, "Text 'Date Type' must NOT be in filter bar");
    assert.strictEqual(check.hasStockSelect, true, "Stock filter select must be present");
    assert.strictEqual(check.hasTypeSelect, true, "Item type select must be present");
    assert.strictEqual(check.hasCatSelect, true, "Category select must be present");

    console.log("✓ Date Type successfully removed from items page!");

    // Capture screenshot
    const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity\\brain\\bed9650d-397d-4216-aa80-c0ae1c3c4fcb";
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "items_page_no_date_type_verified.png"), img.toPNG());
    console.log("✓ Saved screenshot: items_page_no_date_type_verified.png");

    win.close();
    app.quit();
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  }
});
