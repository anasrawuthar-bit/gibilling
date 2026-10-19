const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-neg-stock-test-"));
app.setPath("userData", testRoot);

const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity\\brain\\bed9650d-397d-4216-aa80-c0ae1c3c4fcb";
const capturePath = path.join(artifactDir, "negative_stock_verified.png");

app.whenReady().then(async () => {
  let win;
  try {
    await database.initDatabase(testRoot);

    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
    ipcMain.handle("db:get-last-active-company", () => database.getLastActiveCompany());
    ipcMain.handle("db:create-party", (_event, party) => database.createParty(party));
    ipcMain.handle("db:create-item", (_event, item) => database.createItem(item));
    ipcMain.handle("db:create-transaction", (_event, tx) => database.createTransaction(tx));
    ipcMain.handle("db:update-business-settings", (_event, s) => database.updateBusinessSettings(s));
    ipcMain.handle("db:preview-next-invoice-number", (_event, type, date) => database.previewNextInvoiceNumber(type, date));

    win = new BrowserWindow({
      show: true,
      width: 1366,
      height: 800,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 800));

    // Open active company
    await win.webContents.executeJavaScript(`
      (async () => {
        const btn = document.querySelector(".open-company-button");
        const companyName = btn?.dataset?.company || "testt";
        await openCompany(companyName);
      })()
    `);
    await new Promise((r) => setTimeout(r, 1200));

    // 1. Create a customer and an item with 0 stock
    const setupResult = await win.webContents.executeJavaScript(`
      (async () => {
        const party = await window.giDB.createParty({
          name: "Apex Retailers",
          phone: "9876543210",
          state: "Karnataka",
          taxType: "unregistered",
          type: "customer"
        });
        const item = await window.giDB.createItem({
          name: "Widget Zero",
          itemType: "product",
          sku: "WID-001",
          category: "Hardware",
          unit: "PCS",
          salePrice: 250,
          purchasePrice: 150,
          taxRate: 18,
          openingStock: 0,
          lowStockAlert: 5
        });
        state = normalizeState(await window.giDB.getState());
        return {
          partyId: party.id,
          itemId: item.id,
          initialStock: Number(item.currentStock || 0)
        };
      })()
    `);

    console.log("Setup result:", setupResult);
    assert.strictEqual(setupResult.initialStock, 0, "Initial stock should be 0");
    console.log("✓ Initial stock is 0");

    // 2. Test item lookup UI and smart hints for 0-stock item
    const lookupCheck = await win.webContents.executeJavaScript(`
      (() => {
        const item = state.items.find(i => i.name === "Widget Zero");
        const btnHtml = itemLookupButton(item);
        return {
          hasNegativeSaleText: btnHtml.includes("Out of stock (Negative sale)"),
          btnHtml
        };
      })()
    `);
    assert.strictEqual(lookupCheck.hasNegativeSaleText, true, "Item picker button must indicate negative sale is permitted");
    console.log("✓ Item lookup button allows negative sale for 0 stock");

    // 3. Test Transaction Editor row smart hint and smart checks with 0 stock
    const editorChecks = await win.webContents.executeJavaScript(`
      (async () => {
        openTransactionEditor("sale");
        await new Promise(r => setTimeout(r, 100));

        const partyInput = elements.featureView.querySelector('[name="party"]');
        const party = state.parties.find(p => p.name === "Apex Retailers");
        selectTransactionParty(party);

        const row = elements.featureView.querySelector("#transactionRows tr");
        const item = state.items.find(i => i.name === "Widget Zero");
        selectTransactionItem(row, item);

        const qtyInput = row.querySelector('[name="qty"]');
        qtyInput.value = "5";
        qtyInput.dispatchEvent(new Event("input", { bubbles: true }));

        const hint = row.querySelector(".row-smart-hint");
        const hintText = hint ? hint.textContent : "";
        const isHintWarn = hint ? hint.classList.contains("warn") : false;
        const isHintDanger = hint ? hint.classList.contains("danger") : false;

        const smartChecks = elements.featureView.querySelectorAll(".editor-smart-panel li");
        const checksList = Array.from(smartChecks).map(li => ({
          text: li.textContent,
          className: li.className
        }));

        return {
          hintText,
          isHintWarn,
          isHintDanger,
          checksList
        };
      })()
    `);

    console.log("Editor smart checks with stopSaleOnNegativeStock=false:", editorChecks);
    assert.ok(editorChecks.hintText.includes("Stock 0 → -5 (Negative)"), "Hint should show Stock 0 → -5 (Negative)");
    assert.strictEqual(editorChecks.isHintWarn, true, "Hint should be warn, not danger");
    assert.strictEqual(editorChecks.isHintDanger, false, "Hint must not be danger when setting is off");
    
    const dangerCheck = editorChecks.checksList.find(c => c.className.includes("danger") && c.text.includes("Widget Zero"));
    assert.strictEqual(dangerCheck, undefined, "Smart checks must not have a blocking danger check for out-of-stock item");
    const infoCheck = editorChecks.checksList.find(c => c.className.includes("info") && c.text.includes("Widget Zero"));
    assert.ok(infoCheck, "Smart checks must display informative notice about negative stock recording");
    console.log("✓ Transaction editor shows informative negative stock notice instead of blocking danger");

    // 4. Save the sale invoice and verify stock becomes -5
    const saleResult = await win.webContents.executeJavaScript(`
      (async () => {
        const form = elements.featureView.querySelector("#transactionForm");
        const submitEvent = new Event("submit", { cancelable: true, bubbles: true });
        form.dispatchEvent(submitEvent);
        await new Promise(r => setTimeout(r, 600));

        state = normalizeState(await window.giDB.getState());
        const updatedItem = state.items.find(i => i.name === "Widget Zero");
        return {
          currentStock: Number(updatedItem.currentStock)
        };
      })()
    `);

    console.log("Stock after sale invoice:", saleResult.currentStock);
    assert.strictEqual(saleResult.currentStock, -5, "Stock must decrease from 0 to -5");
    console.log("✓ Sale invoice successfully recorded negative stock (-5)");

    // 5. Test itemLookupButton when stock is already negative (-5)
    const negativeLookupCheck = await win.webContents.executeJavaScript(`
      (() => {
        const item = state.items.find(i => i.name === "Widget Zero");
        const btnHtml = itemLookupButton(item);
        return {
          hasNegativeStockText: btnHtml.includes("Stock: -5 (Negative)"),
          btnHtml
        };
      })()
    `);
    assert.strictEqual(negativeLookupCheck.hasNegativeStockText, true, "Item picker button must display negative stock label");
    console.log("✓ Item lookup button shows Stock: -5 (Negative)");

    // 6. Test POS Product Card badges
    const posCardCheck = await win.webContents.executeJavaScript(`
      (() => {
        const item = state.items.find(i => i.name === "Widget Zero");
        const cardHtml = posProductCard(item);
        
        // Mock zero stock item
        const zeroItem = { ...item, currentStock: 0 };
        const zeroCardHtml = posProductCard(zeroItem);

        return {
          negBadge: cardHtml.includes("Stock: -5 (Neg)"),
          zeroBadge: zeroCardHtml.includes("Out of Stock (Neg OK)"),
          cardHtml,
          zeroCardHtml
        };
      })()
    `);
    assert.strictEqual(posCardCheck.negBadge, true, "POS product card must show Stock: -5 (Neg)");
    assert.strictEqual(posCardCheck.zeroBadge, true, "POS product card for 0 stock must show Out of Stock (Neg OK)");
    console.log("✓ POS product card badges render (Neg OK) and (Neg) properly");

    // 7. Test Items View Negative Filter and Styling
    const itemsFilterCheck = await win.webContents.executeJavaScript(`
      (() => {
        itemAdvancedFilter.stockLevel = "negative";
        const allItems = (state.items || []).filter(item => !isExpenseItem(item));
        const filtered = applyItemAdvancedFilter(allItems, itemAdvancedFilter);
        const item = state.items.find(i => i.name === "Widget Zero");
        const buttonHtml = itemListButton(item, item.id);
        const detailHtml = itemDetail(item);

        return {
          matchedItemNames: filtered.map(i => i.name),
          buttonHasClass: buttonHtml.includes('class="stock-negative"'),
          detailHasClass: detailHtml.includes('class="stock-negative"'),
          detailHasNegativeLabel: detailHtml.includes("-5 (Negative)")
        };
      })()
    `);
    console.log("Items view negative stock check:", itemsFilterCheck);
    assert.ok(itemsFilterCheck.matchedItemNames.includes("Widget Zero"), "Filter 'negative' must return negative stock item");
    assert.strictEqual(itemsFilterCheck.buttonHasClass, true, "Item list button must apply stock-negative class");
    assert.strictEqual(itemsFilterCheck.detailHasClass, true, "Item detail must apply stock-negative class");
    assert.strictEqual(itemsFilterCheck.detailHasNegativeLabel, true, "Item detail must show (Negative) indicator");
    console.log("✓ Items view filter and styling for negative stock passed");

    // 8. Test Low Stock Report negative stock badge
    const lowStockCheck = await win.webContents.executeJavaScript(`
      (() => {
        reportCategoryFilter = "";
        reportSearchQuery = "Widget Zero";
        const reportHtml = lowStockReport();
        return {
          hasNegativeBadge: reportHtml.includes("Negative (-5)"),
          hasStockNegativeClass: reportHtml.includes('class="stock-negative"'),
          reportHtml
        };
      })()
    `);
    assert.strictEqual(lowStockCheck.hasNegativeBadge, true, "Low stock report must display Negative (-5) status pill");
    assert.strictEqual(lowStockCheck.hasStockNegativeClass, true, "Low stock report available stock must be styled with stock-negative");
    console.log("✓ Low stock alert report badges negative stock correctly");

    // 9. Test stopSaleOnNegativeStock enforcement when enabled
    const restrictionCheck = await win.webContents.executeJavaScript(`
      (async () => {
        await window.giDB.updateBusinessSettings({
          ...state.businessSettings,
          stopSaleOnNegativeStock: true
        });
        state = normalizeState(await window.giDB.getState());

        openTransactionEditor("sale");
        await new Promise(r => setTimeout(r, 100));

        const party = state.parties.find(p => p.name === "Apex Retailers");
        selectTransactionParty(party);

        const row = elements.featureView.querySelector("#transactionRows tr");
        const item = state.items.find(i => i.name === "Widget Zero");
        selectTransactionItem(row, item);

        const qtyInput = row.querySelector('[name="qty"]');
        qtyInput.value = "2";
        qtyInput.dispatchEvent(new Event("input", { bubbles: true }));

        const hint = row.querySelector(".row-smart-hint");
        const isHintDanger = hint ? hint.classList.contains("danger") : false;

        const smartChecks = elements.featureView.querySelectorAll(".editor-smart-panel li");
        const checksList = Array.from(smartChecks).map(li => ({
          text: li.textContent,
          className: li.className
        }));

        const validation = validateTransactionEditorSelections();

        return {
          isHintDanger,
          checksList,
          validationValid: validation.valid,
          validationMessage: validation.message
        };
      })()
    `);

    console.log("Restriction check when stopSaleOnNegativeStock=true:", restrictionCheck);
    assert.strictEqual(restrictionCheck.isHintDanger, true, "Row hint must be danger when stopSaleOnNegativeStock is enabled");
    const dangerRestricted = restrictionCheck.checksList.find(c => c.className.includes("danger") && c.text.includes("negative stock restricted"));
    assert.ok(dangerRestricted, "Smart checks must show danger restriction when stopSaleOnNegativeStock is enabled");
    assert.strictEqual(restrictionCheck.validationValid, false, "Validation must fail when stopSaleOnNegativeStock is enabled");
    assert.ok(restrictionCheck.validationMessage.includes("Negative stock sales are blocked in settings"), "Validation message must state that negative stock sales are blocked");
    console.log("✓ stopSaleOnNegativeStock successfully blocks sale when enabled");

    // 10. Reset stopSaleOnNegativeStock to false and capture screenshot of Items screen
    await win.webContents.executeJavaScript(`
      (async () => {
        await window.giDB.updateBusinessSettings({
          ...state.businessSettings,
          stopSaleOnNegativeStock: false
        });
        state = normalizeState(await window.giDB.getState());
        itemAdvancedFilter.stockLevel = "all";
        itemSearchQuery = "Widget Zero";
        elements.featureView.innerHTML = itemsTemplate(null, "overview", "Widget Zero");
        bindFeatureActions();
      })()
    `);
    await new Promise(r => setTimeout(r, 600));

    const image = await win.webContents.capturePage();
    fs.writeFileSync(capturePath, image.toPNG());
    console.log("✓ Screenshot captured to:", capturePath);

    console.log("=== ALL NEGATIVE STOCK TESTS PASSED 100% ===");
  } catch (err) {
    console.error("Test failed with error:", err);
    process.exitCode = 1;
  } finally {
    if (win) win.close();
    app.quit();
  }
});
