const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-units-cats-test-"));
app.setPath("userData", testRoot);

app.whenReady().then(async () => {
  let window;
  try {
    await database.initDatabase(testRoot);

    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
    ipcMain.handle("db:create-unit", (_event, unit) => database.createUnit(unit));
    ipcMain.handle("db:update-unit", (_event, unit) => database.updateUnit(unit));
    ipcMain.handle("db:delete-unit", (_event, payload) => database.deleteUnit(payload));
    ipcMain.handle("db:toggle-unit-active", (_event, payload) => database.toggleUnitActive(payload));
    ipcMain.handle("db:create-item-category", (_event, cat) => database.createItemCategory(cat));
    ipcMain.handle("db:update-item-category", (_event, cat) => database.updateItemCategory(cat));
    ipcMain.handle("db:delete-item-category", (_event, payload) => database.deleteItemCategory(payload));
    ipcMain.handle("db:toggle-item-category-active", (_event, payload) => database.toggleItemCategoryActive(payload));

    window = new BrowserWindow({
      show: false,
      width: 1280,
      height: 800,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 600));

    console.log("Test 1: Verify #gi-ban symbol exists in SVG sprite...");
    const banSymbolCheck = await window.webContents.executeJavaScript(`
      (() => {
        const sym = document.getElementById("gi-ban");
        return {
          exists: Boolean(sym),
          tagName: sym?.tagName?.toLowerCase()
        };
      })()
    `);
    assert.strictEqual(banSymbolCheck.exists, true, "gi-ban SVG symbol must exist in DOM");
    assert.strictEqual(banSymbolCheck.tagName, "symbol");
    console.log("  ✓ #gi-ban SVG symbol exists in sprite.");

    // Open active company
    await window.webContents.executeJavaScript(`
      (async () => {
        const btn = document.querySelector(".open-company-button");
        const companyName = btn?.dataset?.company || "testt";
        await openCompany(companyName);
      })()
    `);
    await new Promise((r) => setTimeout(r, 600));

    console.log("Test 2: Verify standard units have GST UQC codes and correct decimal allowances...");
    const unitsDataCheck = await window.webContents.executeJavaScript(`
      (() => {
        const units = state.units || [];
        const kg = units.find(u => u.name.toLowerCase() === "kg");
        const pcs = units.find(u => u.name.toLowerCase() === "pcs");
        const litre = units.find(u => u.name.toLowerCase() === "litre");
        const meter = units.find(u => u.name.toLowerCase() === "meter");
        const gram = units.find(u => u.name.toLowerCase() === "gram");

        return {
          totalUnits: units.length,
          kg: { code: kg?.code, short: kg?.short_name, decimal: kg?.allows_decimal_quantity },
          pcs: { code: pcs?.code, short: pcs?.short_name, decimal: pcs?.allows_decimal_quantity },
          litre: { code: litre?.code, short: litre?.short_name, decimal: litre?.allows_decimal_quantity },
          meter: { code: meter?.code, short: meter?.short_name, decimal: meter?.allows_decimal_quantity },
          gram: { code: gram?.code, short: gram?.short_name, decimal: gram?.allows_decimal_quantity }
        };
      })()
    `);

    assert(unitsDataCheck.totalUnits >= 18, `Expected at least 18 units, got ${unitsDataCheck.totalUnits}`);
    assert.strictEqual(unitsDataCheck.kg.code, "KGS");
    assert.strictEqual(unitsDataCheck.kg.short, "kg");
    assert.strictEqual(unitsDataCheck.kg.decimal, true, "Kg must allow decimals");

    assert.strictEqual(unitsDataCheck.pcs.code, "PCS");
    assert.strictEqual(unitsDataCheck.pcs.short, "pcs");
    assert.strictEqual(unitsDataCheck.pcs.decimal, false, "Pcs should not allow decimals");

    assert.strictEqual(unitsDataCheck.litre.code, "LTR");
    assert.strictEqual(unitsDataCheck.litre.decimal, true, "Litre must allow decimals");

    assert.strictEqual(unitsDataCheck.meter.code, "MTR");
    assert.strictEqual(unitsDataCheck.meter.decimal, true, "Meter must allow decimals");
    console.log("  ✓ Standard units verified with GST UQC codes and decimal rules.");

    console.log("Test 3: Verify standard categories have codes and descriptions...");
    const categoriesDataCheck = await window.webContents.executeJavaScript(`
      (() => {
        const cats = state.itemCategories || [];
        const elec = cats.find(c => c.name.toLowerCase() === "electronics");
        const stat = cats.find(c => c.name.toLowerCase() === "stationery");
        return {
          totalCats: cats.length,
          elecCode: elec?.code,
          statCode: stat?.code
        };
      })()
    `);
    assert(categoriesDataCheck.totalCats >= 18, `Expected at least 18 categories, got ${categoriesDataCheck.totalCats}`);
    assert.strictEqual(categoriesDataCheck.elecCode, "ELEC");
    assert.strictEqual(categoriesDataCheck.statCode, "STAT");
    console.log("  ✓ Standard categories verified with codes.");

    console.log("Test 4: Verify Units table renders action buttons with valid SVG icon...");
    const tableRenderCheck = await window.webContents.executeJavaScript(`
      (() => {
        elements.featureView.innerHTML = itemMastersTemplate();
        bindMastersActions();
        const firstRow = document.querySelector("#unitsTableBody tr");
        const toggleBtn = firstRow?.querySelector("[data-toggle-unit]");
        const iconUse = toggleBtn?.querySelector("use")?.getAttribute("href");
        return {
          hasToggleBtn: Boolean(toggleBtn),
          iconUse
        };
      })()
    `);
    assert.strictEqual(tableRenderCheck.hasToggleBtn, true);
    assert.strictEqual(tableRenderCheck.iconUse, "#gi-ban", "Active unit toggle button must use #gi-ban icon");
    console.log("  ✓ Units table renders #gi-ban icon in toggle button (empty box bug resolved).");

    console.log("Test 5: Verify Items page category filter includes Master categories...");
    const itemsFilterCheck = await window.webContents.executeJavaScript(`
      (() => {
        showView("items");
        const select = document.getElementById("itemCategoryFilter");
        const options = Array.from(select?.options || []).map(o => o.value).filter(Boolean);
        return {
          hasSelect: Boolean(select),
          optionsCount: options.length,
          hasElectronics: options.includes("Electronics"),
          hasStationery: options.includes("Stationery")
        };
      })()
    `);
    assert.strictEqual(itemsFilterCheck.hasSelect, true);
    assert.strictEqual(itemsFilterCheck.hasElectronics, true, "Items filter must include Master category 'Electronics'");
    assert.strictEqual(itemsFilterCheck.hasStationery, true, "Items filter must include Master category 'Stationery'");
    console.log("  ✓ Items page category filter includes all Master categories.");

    console.log("Test 6: Verify newly created unit cascades to invoice item unit options...");
    const unitCascadeCheck = await window.webContents.executeJavaScript(`
      (async () => {
        const customUnitName = "Pallet-" + Date.now();
        const updatedState = await window.giDB.createUnit({
          name: customUnitName,
          short_name: "plt",
          code: "PLT",
          allows_decimal_quantity: false
        });
        state = normalizeState(updatedState);
        const markup = editorUnitOptionsMarkup();
        return {
          customUnitName,
          inMarkup: markup.includes(customUnitName)
        };
      })()
    `);
    assert.strictEqual(unitCascadeCheck.inMarkup, true, "Custom unit must appear in bill editor line item options");
    console.log(`  ✓ Custom unit '${unitCascadeCheck.customUnitName}' appears in bill line item unit options.`);

    console.log("Test 7: Verify Add Item modal renders Unit as a select listing all master units...");
    const itemModalUnitCheck = await window.webContents.executeJavaScript(`
      (() => {
        openEntryModal("item");
        const unitSelect = document.getElementById("itemUnitInput");
        const options = Array.from(unitSelect?.options || []).map(o => o.value);
        return {
          isSelect: unitSelect?.tagName === "SELECT",
          selectedValue: unitSelect?.value,
          totalOptions: options.length,
          hasPcs: options.includes("Pcs"),
          hasKg: options.includes("Kg"),
          hasLitre: options.includes("Litre"),
          hasGram: options.includes("Gram"),
          hasMeter: options.includes("Meter"),
          hasBox: options.includes("Box")
        };
      })()
    `);
    assert.strictEqual(itemModalUnitCheck.isSelect, true, "Unit input must be a select element");
    assert.strictEqual(itemModalUnitCheck.selectedValue, "Pcs", "Default selected unit for product must be Pcs");
    assert(itemModalUnitCheck.totalOptions >= 18, `Expected at least 18 units in select, got ${itemModalUnitCheck.totalOptions}`);
    assert.strictEqual(itemModalUnitCheck.hasPcs, true);
    assert.strictEqual(itemModalUnitCheck.hasKg, true);
    assert.strictEqual(itemModalUnitCheck.hasLitre, true);
    assert.strictEqual(itemModalUnitCheck.hasGram, true);
    assert.strictEqual(itemModalUnitCheck.hasMeter, true);
    assert.strictEqual(itemModalUnitCheck.hasBox, true);
    console.log("  ✓ Add Item modal Unit dropdown lists all master units (Pcs, Kg, Litre, Gram, Meter, Box, etc.).");

    console.log("Test 8: Verify clicking '+' next to Unit opens rich Master dialog and auto-selects new unit on save...");
    const quickAddDialogCheck = await window.webContents.executeJavaScript(`
      (async () => {
        const plusBtn = document.querySelector("[data-action='quick-add-unit']");
        plusBtn.click();
        const dialog = document.querySelector(".masters-form-dialog");
        const nameInput = dialog?.querySelector("input[name='name']");
        const shortInput = dialog?.querySelector("input[name='short_name']");
        const codeInput = dialog?.querySelector("input[name='code']");
        const decimalCheck = dialog?.querySelector("input[name='allows_decimal_quantity']");
        const form = dialog?.querySelector("#mastersUnitForm");

        const hasDialog = Boolean(dialog);
        const hasFields = Boolean(nameInput && shortInput && codeInput && decimalCheck);

        // Fill and submit rich form
        const newUnitName = "Cylinder-" + Date.now();
        nameInput.value = newUnitName;
        shortInput.value = "cyl";
        codeInput.value = "CYL";
        decimalCheck.checked = true;

        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await new Promise(r => setTimeout(r, 400));

        const unitSelect = document.getElementById("itemUnitInput");
        const isDialogClosed = !document.querySelector(".masters-form-backdrop");

        return {
          hasDialog,
          hasFields,
          isDialogClosed,
          newUnitName,
          selectedUnit: unitSelect?.value
        };
      })()
    `);
    assert.strictEqual(quickAddDialogCheck.hasDialog, true, "Rich masters dialog must open on '+' click");
    assert.strictEqual(quickAddDialogCheck.hasFields, true, "Dialog must have name, short_name, code, and decimal checkbox");
    assert.strictEqual(quickAddDialogCheck.isDialogClosed, true, "Dialog must close after saving");
    assert.strictEqual(quickAddDialogCheck.selectedUnit, quickAddDialogCheck.newUnitName, "New unit must be automatically selected in Item modal");
    console.log(`  ✓ Rich Master dialog opened, saved '${quickAddDialogCheck.newUnitName}' with GST code, and auto-selected in dropdown.`);

    console.log("\nALL 8 UNITS & CATEGORIES INTEGRATION TESTS PASSED SUCCESSFULLY!\n");
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  } finally {
    if (window && !window.isDestroyed()) window.destroy();
    app.quit();
  }
});
