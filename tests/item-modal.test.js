const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-item-modal-test-"));
app.setPath("userData", testRoot);

app.whenReady().then(async () => {
  const rendererErrors = [];

  try {
    await database.initDatabase(testRoot);
    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
    ipcMain.handle("db:create-party", (_event, party) => database.createParty(party));
    ipcMain.handle("db:create-item", (_event, item) => database.createItem(item));
    ipcMain.handle("db:update-item", (_event, item) => database.updateItem(item));

    const window = new BrowserWindow({
      width: 1366,
      height: 768,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    window.webContents.on("console-message", (_event, level, message) => {
      if (level >= 2) rendererErrors.push(message);
    });

    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Open first company
    await window.webContents.executeJavaScript(`document.querySelector(".open-company-button").click(); undefined`);
    await new Promise((resolve) => setTimeout(resolve, 300));

    console.log("Test 1: Opening Add Item modal and verifying header, 3 tabs, and pinned footer...");
    const modalInitialState = await window.webContents.executeJavaScript(`(() => {
      openEntryModal("item");
      const modal = document.getElementById("entryModal");
      const title = document.getElementById("entryTitle");
      const subtitle = document.getElementById("entrySubtitle");
      const tabs = document.getElementById("itemTabs");
      const partyTabs = document.getElementById("partyTabs");
      const tabBtns = Array.from(tabs.querySelectorAll(".item-tab-btn")).map(b => ({
        tab: b.dataset.tab,
        text: b.innerText.trim(),
        active: b.classList.contains("active")
      }));
      const tabPanels = {
        basic: !document.getElementById("itemTabBasic").classList.contains("hidden"),
        stock: !document.getElementById("itemTabStock").classList.contains("hidden"),
        notes: !document.getElementById("itemTabNotes").classList.contains("hidden"),
      };
      const footer = modal.querySelector(".entry-modal-footer");
      const saveBtn = document.getElementById("saveEntryButton");
      const cancelBtn = document.getElementById("cancelEntryButton");

      const modalRect = modal.querySelector(".entry-modal").getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();

      return {
        isVisible: !modal.classList.contains("hidden"),
        titleText: title.innerText.trim(),
        subtitleText: subtitle.innerText.trim(),
        partyTabsHidden: partyTabs.offsetParent === null,
        tabBtns,
        tabPanels,
        saveBtnText: saveBtn.innerText.trim(),
        footerVisibleWithinModal: footerRect.bottom <= modalRect.bottom + 2,
        modalHeight: modalRect.height,
        windowHeight: window.innerHeight
      };
    })()`);

    assert.strictEqual(modalInitialState.isVisible, true, "Entry modal must be visible");
    assert.strictEqual(modalInitialState.titleText, "Add Item", "Title must be Add Item");
    assert.strictEqual(modalInitialState.subtitleText, "Add product or service to inventory", "Subtitle must be accurate");
    assert.strictEqual(modalInitialState.partyTabsHidden, true, "Party tabs must be hidden");
    assert.strictEqual(modalInitialState.tabBtns.length, 3, "Must have 3 item tabs");
    assert.strictEqual(modalInitialState.tabBtns[0].tab, "basic");
    assert.strictEqual(modalInitialState.tabBtns[0].active, true, "Basic & Pricing tab must start active");
    assert.strictEqual(modalInitialState.tabPanels.basic, true, "Basic panel must be visible");
    assert.strictEqual(modalInitialState.tabPanels.stock, false, "Stock panel must be hidden initially");
    assert.strictEqual(modalInitialState.tabPanels.notes, false, "Notes panel must be hidden initially");
    assert.strictEqual(modalInitialState.saveBtnText, "Save Item", "Save button text must be Save Item");
    assert.strictEqual(modalInitialState.footerVisibleWithinModal, true, "Footer must be pinned within modal bounds");
    console.log("  ✓ Add Item modal header, tabs, and pinned footer verified.");

    console.log("Test 2: Switching tabs (Stock & Warehouse, Description & Notes)...");
    const tabSwitchResult = await window.webContents.executeJavaScript(`(() => {
      const stockBtn = document.querySelector('.item-tab-btn[data-tab="stock"]');
      stockBtn.click();
      const afterStockClick = {
        stockActive: stockBtn.classList.contains("active"),
        stockPanelVisible: !document.getElementById("itemTabStock").classList.contains("hidden"),
        basicPanelVisible: !document.getElementById("itemTabBasic").classList.contains("hidden"),
      };

      const notesBtn = document.querySelector('.item-tab-btn[data-tab="notes"]');
      notesBtn.click();
      const afterNotesClick = {
        notesActive: notesBtn.classList.contains("active"),
        notesPanelVisible: !document.getElementById("itemTabNotes").classList.contains("hidden"),
        stockPanelVisible: !document.getElementById("itemTabStock").classList.contains("hidden"),
      };

      // Switch back to basic
      document.querySelector('.item-tab-btn[data-tab="basic"]').click();

      return { afterStockClick, afterNotesClick };
    })()`);

    assert.strictEqual(tabSwitchResult.afterStockClick.stockActive, true, "Stock tab button should be active");
    assert.strictEqual(tabSwitchResult.afterStockClick.stockPanelVisible, true, "Stock panel should be visible");
    assert.strictEqual(tabSwitchResult.afterStockClick.basicPanelVisible, false, "Basic panel should be hidden");
    assert.strictEqual(tabSwitchResult.afterNotesClick.notesActive, true, "Notes tab button should be active");
    assert.strictEqual(tabSwitchResult.afterNotesClick.notesPanelVisible, true, "Notes panel should be visible");
    assert.strictEqual(tabSwitchResult.afterNotesClick.stockPanelVisible, false, "Stock panel should be hidden");
    console.log("  ✓ Tab switching between Basic, Stock, and Notes works smoothly.");

    console.log("Test 3: Testing Item Type chips (Product vs Service) and dynamic behavior...");
    const chipTest = await window.webContents.executeJavaScript(`(() => {
      const productChip = document.querySelector('.item-type-chip[data-item-type="product"]');
      const serviceChip = document.querySelector('.item-type-chip[data-item-type="service"]');
      const select = document.querySelector('select[name="itemType"]');
      const unitInput = document.querySelector('[name="unit"]');
      const hsnLabel = document.getElementById("hsnSacLabel");
      const serviceNotice = document.getElementById("itemServiceStockNotice");
      const stockGroup = document.getElementById("itemStockFieldsGroup");

      const initialProduct = productChip.classList.contains("active") && select.value === "product";
      const initialUnit = unitInput.value;

      // Click service chip
      serviceChip.click();
      const afterService = {
        serviceChipActive: serviceChip.classList.contains("active"),
        productChipActive: productChip.classList.contains("active"),
        selectValue: select.value,
        unitValue: unitInput.value,
        hsnLabelText: hsnLabel.textContent.trim(),
        serviceNoticeVisible: serviceNotice.style.display !== "none",
        stockGroupHidden: stockGroup.style.display === "none",
      };

      // Click product chip back
      productChip.click();
      const afterProduct = {
        productChipActive: productChip.classList.contains("active"),
        serviceChipActive: serviceChip.classList.contains("active"),
        selectValue: select.value,
        unitValue: unitInput.value,
        hsnLabelText: hsnLabel.textContent.trim(),
        serviceNoticeHidden: serviceNotice.style.display === "none",
        stockGroupVisible: stockGroup.style.display !== "none",
      };

      return { initialProduct, initialUnit, afterService, afterProduct };
    })()`);

    assert.strictEqual(chipTest.initialProduct, true, "Default item type must be product");
    assert.strictEqual(chipTest.initialUnit, "Pcs", "Default product unit should be Pcs");
    assert.strictEqual(chipTest.afterService.serviceChipActive, true, "Service chip must be active");
    assert.strictEqual(chipTest.afterService.selectValue, "service", "itemType must be service");
    assert.strictEqual(chipTest.afterService.unitValue, "Hr", "Service should default unit to Hr");
    assert.strictEqual(chipTest.afterService.hsnLabelText, "SAC Code", "Label should say SAC Code for service");
    assert.strictEqual(chipTest.afterService.serviceNoticeVisible, true, "Service notice banner should be visible");
    assert.strictEqual(chipTest.afterService.stockGroupHidden, true, "Stock fields should be hidden for service");
    assert.strictEqual(chipTest.afterProduct.productChipActive, true, "Product chip back to active");
    assert.strictEqual(chipTest.afterProduct.hsnLabelText, "HSN Code", "Label should say HSN Code for product");
    console.log("  ✓ Item Type chips toggle cleanly with accurate labels and stock section visibility.");

    console.log("Test 4: Testing Stock Valuation auto-calculation (Qty × Purchase Price)...");
    const autoCalcTest = await window.webContents.executeJavaScript(`(() => {
      const stockInput = document.querySelector('input[name="openingStock"]');
      const purchasePriceInput = document.querySelector('input[name="purchasePrice"]');
      const stockValInput = document.querySelector('input[name="openingStockValue"]');

      stockInput.value = "50";
      stockInput.dispatchEvent(new Event("input", { bubbles: true }));

      purchasePriceInput.value = "120";
      purchasePriceInput.dispatchEvent(new Event("input", { bubbles: true }));

      const autoValue = stockValInput.value;

      // Now manual override
      stockValInput.value = "6500";
      stockValInput.dispatchEvent(new Event("input", { bubbles: true }));

      // Changing stock qty should NOT overwrite manual value
      stockInput.value = "60";
      stockInput.dispatchEvent(new Event("input", { bubbles: true }));
      const manualPreserved = stockValInput.value;

      return { autoValue, manualPreserved };
    })()`);

    assert.strictEqual(autoCalcTest.autoValue, "6000.00", "Stock value should auto-calc to 50 * 120 = 6000.00");
    assert.strictEqual(autoCalcTest.manualPreserved, "6500", "Manual edit should be preserved upon subsequent qty edits");
    console.log("  ✓ Opening stock valuation auto-calculation and manual override verified.");

    console.log("Test 5: Creating a Product item with all 3 tabs filled and submitting...");
    await window.webContents.executeJavaScript(`(() => {
      // Tab 1: Basic
      document.querySelector('.item-tab-btn[data-tab="basic"]').click();
      document.getElementById("itemNameInput").value = "Industrial Bearing 6205";
      document.getElementById("itemCategoryInput").value = "Mechanical";
      document.getElementById("itemUnitInput").value = "Pcs";
      document.getElementById("itemSkuInput").value = "BRG-6205-Z";
      document.getElementById("itemHsnSacInput").value = "8482";
      document.getElementById("itemSalePriceInput").value = "350.00";
      document.getElementById("itemSaleTaxType").value = "without_tax";
      document.getElementById("itemPurchasePriceInput").value = "220.00";
      document.getElementById("itemPurchaseTaxType").value = "without_tax";
      document.getElementById("itemTaxRate").value = "18";
      document.getElementById("itemDiscountInput").value = "5";

      // Tab 2: Stock
      document.querySelector('.item-tab-btn[data-tab="stock"]').click();
      document.getElementById("itemOpeningStockInput").value = "100";
      document.getElementById("itemOpeningStockDateInput").value = "2026-04-01";
      document.getElementById("itemOpeningStockValueInput").value = "22000.00";
      document.getElementById("itemLowStockAlertInput").value = "15";
      document.getElementById("itemStorageLocationInput").value = "Bay 3, Rack A, Shelf 2";

      // Tab 3: Notes
      document.querySelector('.item-tab-btn[data-tab="notes"]').click();
      document.getElementById("itemDescriptionInput").value = "Deep groove ball bearing 25x52x15mm, high grade steel.";
      document.getElementById("itemNotesInput").value = "Vendor: SKF India. Lead time 3 days.";

      // Submit form
      document.getElementById("entryForm").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 600));

    const dbState = await database.getState();
    const createdItem = dbState.items.find((i) => i.name === "Industrial Bearing 6205");
    assert.ok(createdItem, "Item 'Industrial Bearing 6205' must exist in database");
    assert.strictEqual(createdItem.itemType, "product");
    assert.strictEqual(createdItem.sku, "BRG-6205-Z");
    assert.strictEqual(createdItem.category, "Mechanical");
    assert.strictEqual(createdItem.unit, "Pcs");
    assert.strictEqual(createdItem.hsnSac, "8482");
    assert.strictEqual(Number(createdItem.salePrice), 350);
    assert.strictEqual(Number(createdItem.purchasePrice), 220);
    assert.strictEqual(Number(createdItem.taxRate), 18);
    assert.strictEqual(Number(createdItem.discount), 5);
    assert.strictEqual(Number(createdItem.openingStock), 100);
    assert.strictEqual(Number(createdItem.openingStockValue), 22000);
    assert.strictEqual(Number(createdItem.lowStockAlert), 15);
    assert.strictEqual(createdItem.storageLocation, "Bay 3, Rack A, Shelf 2");
    assert.strictEqual(createdItem.description, "Deep groove ball bearing 25x52x15mm, high grade steel.");
    assert.strictEqual(createdItem.notes, "Vendor: SKF India. Lead time 3 days.");
    console.log("  ✓ Product item created successfully with all fields persisted across database tables.");

    console.log("Test 6: Editing the created item...");
    const editItemResult = await window.webContents.executeJavaScript(`(() => {
      const itemToEdit = state.items.find(i => i.name === "Industrial Bearing 6205");
      openEntryModal("item", itemToEdit);

      const title = document.getElementById("entryTitle").innerText.trim();
      const saveBtn = document.getElementById("saveEntryButton").innerText.trim();
      const itemName = document.getElementById("itemNameInput").value;
      const sku = document.getElementById("itemSkuInput").value;
      const salePrice = document.getElementById("itemSalePriceInput").value;
      const stock = document.getElementById("itemOpeningStockInput").value;
      const lowStock = document.getElementById("itemLowStockAlertInput").value;
      const location = document.getElementById("itemStorageLocationInput").value;
      const desc = document.getElementById("itemDescriptionInput").value;
      const basicTabActive = document.querySelector('.item-tab-btn[data-tab="basic"]').classList.contains("active");

      return {
        title,
        saveBtn,
        itemName,
        sku,
        salePrice,
        stock,
        lowStock,
        location,
        desc,
        basicTabActive
      };
    })()`);

    assert.strictEqual(editItemResult.title, "Edit Item", "Title must be Edit Item");
    assert.strictEqual(editItemResult.saveBtn, "Update Item", "Button must be Update Item");
    assert.strictEqual(editItemResult.itemName, "Industrial Bearing 6205");
    assert.strictEqual(editItemResult.sku, "BRG-6205-Z");
    assert.strictEqual(editItemResult.salePrice, "350");
    assert.strictEqual(editItemResult.stock, "100");
    assert.strictEqual(editItemResult.lowStock, "15");
    assert.strictEqual(editItemResult.location, "Bay 3, Rack A, Shelf 2");
    assert.strictEqual(editItemResult.desc, "Deep groove ball bearing 25x52x15mm, high grade steel.");
    assert.strictEqual(editItemResult.basicTabActive, true);
    console.log("  ✓ Edit Item populated all fields across all 3 tabs accurately.");

    // Update item price and save
    await window.webContents.executeJavaScript(`(() => {
      document.getElementById("itemSalePriceInput").value = "375.00";
      document.getElementById("entryForm").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 600));

    const updatedState = await database.getState();
    const updatedItem = updatedState.items.find((i) => i.name === "Industrial Bearing 6205");
    assert.strictEqual(Number(updatedItem.salePrice), 375, "Sale price should be updated to 375");
    console.log("  ✓ Item successfully updated and saved in database.");

    console.log("Test 7: Creating a Service item...");
    await window.webContents.executeJavaScript(`(() => {
      openEntryModal("item");
      document.getElementById("itemNameInput").value = "Annual Maintenance Service";
      document.querySelector('.item-type-chip[data-item-type="service"]').click();
      document.getElementById("itemCategoryInput").value = "Maintenance";
      document.getElementById("itemHsnSacInput").value = "9987";
      document.getElementById("itemSalePriceInput").value = "5000.00";
      document.getElementById("itemTaxRate").value = "18";

      document.getElementById("entryForm").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 600));

    const serviceState = await database.getState();
    const serviceItem = serviceState.items.find((i) => i.name === "Annual Maintenance Service");
    assert.ok(serviceItem, "Service item must exist");
    assert.strictEqual(serviceItem.itemType, "service");
    assert.strictEqual(serviceItem.hsnSac, "9987");
    assert.strictEqual(Number(serviceItem.openingStock), 0, "Service opening stock must be 0");
    assert.strictEqual(Number(serviceItem.salePrice), 5000);
    console.log("  ✓ Service item created with zero stock and proper SAC classification.");

    console.log("Test 8: Cross-modal non-regression: Opening Party modal again...");
    const partyCheck = await window.webContents.executeJavaScript(`(() => {
      openEntryModal("party");
      const title = document.getElementById("entryTitle").innerText.trim();
      const partyTabsVisible = !document.getElementById("partyTabs").classList.contains("hidden") && document.getElementById("partyTabs").offsetParent !== null;
      const itemTabsVisible = !document.getElementById("itemTabs").classList.contains("hidden") && document.getElementById("itemTabs").offsetParent !== null;
      const saveBtn = document.getElementById("saveEntryButton").innerText.trim();
      return { title, partyTabsVisible, itemTabsVisible, saveBtn };
    })()`);

    assert.strictEqual(partyCheck.title, "Add Party");
    assert.strictEqual(partyCheck.saveBtn, "Save Party");
    assert.strictEqual(partyCheck.partyTabsVisible, true, "Party tabs must be visible");
    assert.strictEqual(partyCheck.itemTabsVisible, false, "Item tabs must be hidden");
    console.log("  ✓ Party modal continues to work perfectly with full tab isolation.");

    console.log("\n=== ALL ITEM MODAL TESTS PASSED SUCCESSFULLY! ===");
  } catch (error) {
    console.error("Test failed:", error);
    process.exitCode = 1;
  } finally {
    try { fs.rmSync(testRoot, { recursive: true, force: true }); } catch {}
    app.exit(process.exitCode || 0);
  }
});
