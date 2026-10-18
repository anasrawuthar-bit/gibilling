const { app, BrowserWindow } = require("electron");
const path = require("path");
const assert = require("assert");
const fs = require("fs");

const screenshotPath = path.join(
  "C:",
  "Users",
  "ANAS",
  ".gemini",
  "antigravity",
  "brain",
  "bed9650d-397d-4216-aa80-c0ae1c3c4fcb",
  "items_filter_date_verified.png"
);

async function runItemFilterTests() {
  const window = new BrowserWindow({
    show: true,
    width: 1366,
    height: 768,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  try {
    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 800));

    // Setup mock items, movements, and invoices
    await window.webContents.executeJavaScript(`
      (() => {
        state.items = [
          { id: 101, name: "Wireless Mouse", sku: "WM-01", category: "Electronics", itemType: "product", currentStock: 25, salePrice: 600, purchasePrice: 400, unit: "Pcs" },
          { id: 102, name: "Mechanical Keyboard", sku: "MK-02", category: "Electronics", itemType: "product", currentStock: 4, salePrice: 2500, purchasePrice: 1800, unit: "Pcs" },
          { id: 103, name: "USB-C Hub", sku: "UH-03", category: "Accessories", itemType: "product", currentStock: 0, salePrice: 1200, purchasePrice: 800, unit: "Pcs" },
          { id: 104, name: "Hardware Repair Service", sku: "SRV-01", category: "Services", itemType: "service", currentStock: 0, salePrice: 1500, purchasePrice: 0, unit: "Hrs" }
        ];

        state.itemCategories = [
          { id: 1, name: "Electronics", is_active: true },
          { id: 2, name: "Accessories", is_active: true },
          { id: 3, name: "Services", is_active: true }
        ];

        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = String(today.getMonth() + 1).padStart(2, "0");
        const thisMonthDate = currentYear + "-" + currentMonth + "-10";
        const oldDate = "2025-01-15";

        state.stockMovements = [
          { id: "sm-1", itemId: 101, item: "Wireless Mouse", movementType: "in", quantity: 30, rate: 400, movementDate: oldDate, transactionId: "PO-OLD-01" },
          { id: "sm-2", itemId: 101, item: "Wireless Mouse", movementType: "out", quantity: 5, rate: 600, movementDate: thisMonthDate, invoiceId: "inv-active-1" },
          { id: "sm-3", itemId: 102, item: "Mechanical Keyboard", movementType: "in", quantity: 4, rate: 1800, movementDate: oldDate, transactionId: "PO-OLD-02" }
        ];

        state.invoices = [
          { id: "inv-active-1", invoiceNo: "INV-2026-001", type: "sale", party: "Demo Client", date: thisMonthDate, total: 3000 }
        ];

        state.invoiceItems = [
          { id: "ii-1", invoiceId: "inv-active-1", itemId: 101, item: "Wireless Mouse", qty: 5, price: 600, lineTotal: 3000 }
        ];

        itemAdvancedFilter = { category: "", itemType: "all", stockLevel: "all", datePreset: "all", dateFrom: "", dateTo: "" };
        itemSearchQuery = "";
        showView("items");
      })()
    `);

    await new Promise((r) => setTimeout(r, 400));

    console.log("Test 1: Verify Filter Options, Item Type, Category, and Date Type dropdown select lists exist...");
    const check1 = await window.webContents.executeJavaScript(`
      (() => {
        const stockSelect = document.getElementById("itemStockFilterSelect");
        const typeSelect = document.getElementById("itemTypeFilterSelect");
        const catSelect = document.getElementById("itemCategoryFilter");
        const dateSelect = document.getElementById("itemDateTypeSelect");

        if (!stockSelect || !typeSelect || !dateSelect) {
          return { ok: false, error: "Filter select elements missing" };
        }

        const stockOptions = Array.from(stockSelect.options).map(o => o.value);
        const typeOptions = Array.from(typeSelect.options).map(o => o.value);
        const dateOptions = Array.from(dateSelect.options).map(o => o.value);

        return {
          ok: true,
          stockOptions,
          typeOptions,
          dateOptions,
          hasCatSelect: !!catSelect,
          stockVal: stockSelect.value,
          typeVal: typeSelect.value,
          dateVal: dateSelect.value
        };
      })()
    `);

    assert.strictEqual(check1.ok, true, check1.error);
    assert.deepStrictEqual(check1.stockOptions, ["all", "instock", "low", "out", "active"]);
    assert.deepStrictEqual(check1.typeOptions, ["all", "product", "service"]);
    assert.deepStrictEqual(check1.dateOptions, ["all", "today", "yesterday", "thisWeek", "thisMonth", "lastMonth", "thisQuarter", "thisYear", "custom"]);
    assert.strictEqual(check1.hasCatSelect, true);
    assert.strictEqual(check1.stockVal, "all");
    assert.strictEqual(check1.typeVal, "all");
    assert.strictEqual(check1.dateVal, "all");
    console.log("  ✓ Filter Options, Item Type, Category, and Date Type dropdown selects verified.");

    console.log("Test 2: Verify stock level dropdown filtering (In Stock, Low Stock, Out of Stock)...");
    const checkLow = await window.webContents.executeJavaScript(`
      (() => {
        const stockSelect = document.getElementById("itemStockFilterSelect");
        stockSelect.value = "low";
        stockSelect.dispatchEvent(new Event("change"));
        const items = Array.from(document.querySelectorAll(".item-list-item")).map(i => i.querySelector("strong").textContent);
        return { items };
      })()
    `);
    assert.strictEqual(checkLow.items.length, 1);
    assert.strictEqual(checkLow.items[0], "Mechanical Keyboard");
    console.log("  ✓ Low Stock filter correctly filtered to Mechanical Keyboard (stock: 4).");

    const checkOut = await window.webContents.executeJavaScript(`
      (() => {
        const stockSelect = document.getElementById("itemStockFilterSelect");
        stockSelect.value = "out";
        stockSelect.dispatchEvent(new Event("change"));
        const items = Array.from(document.querySelectorAll(".item-list-item")).map(i => i.querySelector("strong").textContent);
        return { items };
      })()
    `);
    assert.strictEqual(checkOut.items.length, 2); // USB-C Hub (0) and Hardware Repair Service (0)
    console.log("  ✓ Out of Stock filter correctly returned 0-stock items.");

    console.log("Test 3: Verify Item Type dropdown filtering (Services)...");
    const checkService = await window.webContents.executeJavaScript(`
      (() => {
        const stockSelect = document.getElementById("itemStockFilterSelect");
        stockSelect.value = "all";
        stockSelect.dispatchEvent(new Event("change"));

        const typeSelect = document.getElementById("itemTypeFilterSelect");
        typeSelect.value = "service";
        typeSelect.dispatchEvent(new Event("change"));

        const items = Array.from(document.querySelectorAll(".item-list-item")).map(i => i.querySelector("strong").textContent);
        return { items };
      })()
    `);
    assert.strictEqual(checkService.items.length, 1);
    assert.strictEqual(checkService.items[0], "Hardware Repair Service");
    console.log("  ✓ Item Type filter 'Services' returned Hardware Repair Service.");

    console.log("Test 4: Verify Date Type preset (This Month), range badge, and Stock Ledger filtering...");
    const checkDate = await window.webContents.executeJavaScript(`
      (() => {
        const typeSelect = document.getElementById("itemTypeFilterSelect");
        typeSelect.value = "all";
        typeSelect.dispatchEvent(new Event("change"));

        // Select Wireless Mouse (id 101) which has stock movements
        const mouseItem = document.querySelector('.item-list-item[data-item-id="101"]');
        if (mouseItem) mouseItem.click();

        const dateSelect = document.getElementById("itemDateTypeSelect");
        dateSelect.value = "thisMonth";
        dateSelect.dispatchEvent(new Event("change"));

        const badge = document.querySelector(".item-filter-range-badge");
        const periodBanner = document.querySelector(".item-ledger-period-banner");
        const ledgerRows = Array.from(document.querySelectorAll(".item-tab-body tbody tr"));

        return {
          hasBadge: !!badge,
          badgeText: badge ? badge.textContent.trim() : "",
          hasPeriodBanner: !!periodBanner,
          periodText: periodBanner ? periodBanner.textContent.trim() : "",
          rowCount: ledgerRows.length
        };
      })()
    `);
    assert.strictEqual(checkDate.hasBadge, true, "Range badge should be visible for thisMonth preset");
    assert.strictEqual(checkDate.hasPeriodBanner, true, "Period banner should appear above Stock Ledger");
    assert.strictEqual(checkDate.rowCount, 1, "Only 1 movement for Wireless Mouse occurred in thisMonth");
    console.log("  ✓ Date Type 'This Month' rendered range badge and filtered Stock Ledger rows (" + checkDate.periodText + ").");

    console.log("Test 5: Verify Active in Period filter option...");
    const checkActive = await window.webContents.executeJavaScript(`
      (() => {
        const stockSelect = document.getElementById("itemStockFilterSelect");
        stockSelect.value = "active";
        stockSelect.dispatchEvent(new Event("change"));

        const items = Array.from(document.querySelectorAll(".item-list-item")).map(i => i.querySelector("strong").textContent);
        return { items };
      })()
    `);
    assert.strictEqual(checkActive.items.length, 1);
    assert.strictEqual(checkActive.items[0], "Wireless Mouse");
    console.log("  ✓ 'Active in Period' filter correctly isolated Wireless Mouse as the only item active in This Month.");

    console.log("Test 6: Verify Custom Range date pickers From & To...");
    const checkCustom = await window.webContents.executeJavaScript(`
      (() => {
        const dateSelect = document.getElementById("itemDateTypeSelect");
        dateSelect.value = "custom";
        dateSelect.dispatchEvent(new Event("change"));

        const fromInput = document.getElementById("itemDateFrom");
        const toInput = document.getElementById("itemDateTo");

        return {
          hasFrom: !!fromInput,
          hasTo: !!toInput
        };
      })()
    `);
    assert.strictEqual(checkCustom.hasFrom, true);
    assert.strictEqual(checkCustom.hasTo, true);

    const checkCustomFilter = await window.webContents.executeJavaScript(`
      (() => {
        const fromInput = document.getElementById("itemDateFrom");
        const toInput = document.getElementById("itemDateTo");
        fromInput.value = "2025-01-01";
        fromInput.dispatchEvent(new Event("change"));
        toInput.value = "2025-01-31";
        toInput.dispatchEvent(new Event("change"));

        const items = Array.from(document.querySelectorAll(".item-list-item")).map(i => i.querySelector("strong").textContent);
        const ledgerRows = Array.from(document.querySelectorAll(".item-tab-body tbody tr"));

        return {
          items,
          rowCount: ledgerRows.length
        };
      })()
    `);
    // In Jan 2025, Wireless Mouse (PO-OLD-01) and Mechanical Keyboard (PO-OLD-02) were active
    assert.strictEqual(checkCustomFilter.items.length, 2);
    assert.strictEqual(checkCustomFilter.rowCount, 1); // 1 movement for selected Wireless Mouse in Jan 2025
    console.log("  ✓ Custom date range correctly filtered active items and stock ledger movements.");

    console.log("Test 7: Verify Clear Filters button resets everything...");
    const checkClear = await window.webContents.executeJavaScript(`
      (() => {
        const clearBtn = document.getElementById("clearItemFilters");
        if (!clearBtn) return { hasClear: false };
        clearBtn.click();

        const stockSelect = document.getElementById("itemStockFilterSelect");
        const typeSelect = document.getElementById("itemTypeFilterSelect");
        const dateSelect = document.getElementById("itemDateTypeSelect");
        const items = Array.from(document.querySelectorAll(".item-list-item")).map(i => i.querySelector("strong").textContent);

        return {
          hasClear: true,
          stockVal: stockSelect.value,
          typeVal: typeSelect.value,
          dateVal: dateSelect.value,
          totalItems: items.length
        };
      })()
    `);
    assert.strictEqual(checkClear.hasClear, true);
    assert.strictEqual(checkClear.stockVal, "all");
    assert.strictEqual(checkClear.typeVal, "all");
    assert.strictEqual(checkClear.dateVal, "all");
    assert.strictEqual(checkClear.totalItems, 4);
    console.log("  ✓ Clear button reset all dropdowns to default ('all') and restored all items.");

    // Set This Month to take clean verified screenshot
    await window.webContents.executeJavaScript(`
      (() => {
        const dateSelect = document.getElementById("itemDateTypeSelect");
        dateSelect.value = "thisMonth";
        dateSelect.dispatchEvent(new Event("change"));
      })()
    `);
    await new Promise((r) => setTimeout(r, 400));

    // Capture screenshot
    const image = await window.webContents.capturePage();
    fs.writeFileSync(screenshotPath, image.toPNG());
    console.log("  ✓ Saved verification screenshot to " + screenshotPath);

    console.log("\nALL ITEM FILTER & DATE TESTS PASSED SUCCESSFULLY!");
  } finally {
    window.close();
  }
}

app.whenReady().then(async () => {
  try {
    await runItemFilterTests();
    app.exit(0);
  } catch (err) {
    console.error("Test failed with error:", err);
    app.exit(1);
  }
});
