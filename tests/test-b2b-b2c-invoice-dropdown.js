const { app, BrowserWindow } = require("electron");
const path = require("path");
const assert = require("assert");
const fs = require("fs");

const screenshotDir = path.join(
  "C:",
  "Users",
  "ANAS",
  ".gemini",
  "antigravity",
  "brain",
  "bed9650d-397d-4216-aa80-c0ae1c3c4fcb"
);

async function runTest() {
  const window = new BrowserWindow({
    show: false,
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
    await new Promise((r) => setTimeout(r, 1000));

    console.log("Setting up test environment with clean DB state...");
    await window.webContents.executeJavaScript(`
      (() => {
        state.parties = [
          { id: 1, name: "Consumer Walkin", phone: "9876543210", balance: 0, state: "Kerala" },
          { id: 2, name: "Acme Enterprises", phone: "9123456789", gstin: "32ABCDE1234F1Z5", taxType: "gst_registered", balance: 0, state: "Kerala" }
        ];
        state.items = [
          { id: 10, name: "Wireless Mouse", sku: "WM-01", stock: 100, salePrice: 600, taxRate: 18 }
        ];
        state.invoices = [];
        state.transactions = [];
        state.businessSettings = {
          invoicePrefix: "INV",
          invoicePrefixB2B: "INV",
          invoicePrefixB2C: "B2C",
          startingNo: 1,
          startingNoB2B: 1,
          startingNoB2C: 1,
          state: "Kerala"
        };
        openTransactionEditor("sale");
      })()
    `);
    await new Promise((r) => setTimeout(r, 600));

    console.log("Test 1: Verify B2B/B2C dropdown exists in invoice number field...");
    const dropdownCheck = await window.webContents.executeJavaScript(`
      (() => {
        const seriesSelect = document.querySelector('.invoice-no-dropdown-group select[name="supplyType"]');
        const invoiceInput = document.querySelector('.invoice-no-dropdown-group input[name="invoiceNo"]');
        return {
          hasSelect: Boolean(seriesSelect),
          selectedOption: seriesSelect?.value,
          options: seriesSelect ? Array.from(seriesSelect.options).map(o => o.value) : [],
          invoiceNo: invoiceInput?.value
        };
      })()
    `);
    console.log("  Dropdown check result:", dropdownCheck);
    assert(dropdownCheck.hasSelect, "Invoice series dropdown must exist in invoice number field");
    assert.deepStrictEqual(dropdownCheck.options, ["b2b", "b2c"], "Dropdown must have B2B and B2C options");
    assert.strictEqual(dropdownCheck.selectedOption, "b2b", "Initial selection should be B2B");
    assert(dropdownCheck.invoiceNo.startsWith("INV-"), `B2B invoice should start with INV-, got ${dropdownCheck.invoiceNo}`);

    // Capture B2B screenshot
    const b2bImg = await window.webContents.capturePage();
    fs.writeFileSync(path.join(screenshotDir, "b2b_dropdown_selected.png"), b2bImg.toPNG());
    console.log("  Saved b2b_dropdown_selected.png");

    console.log("Test 2: Switch dropdown to B2C and verify invoice number auto-switches to B2C sequence...");
    await window.webContents.executeJavaScript(`
      (() => {
        const seriesSelect = document.querySelector('.invoice-no-dropdown-group select[name="supplyType"]');
        seriesSelect.value = "b2c";
        seriesSelect.dispatchEvent(new Event("change", { bubbles: true }));
      })()
    `);
    await new Promise((r) => setTimeout(r, 300));

    const b2cCheck = await window.webContents.executeJavaScript(`
      (() => {
        const seriesSelect = document.querySelector('.invoice-no-dropdown-group select[name="supplyType"]');
        const invoiceInput = document.querySelector('.invoice-no-dropdown-group input[name="invoiceNo"]');
        return {
          selectedOption: seriesSelect?.value,
          invoiceNo: invoiceInput?.value
        };
      })()
    `);
    console.log("  B2C switch result:", b2cCheck);
    assert.strictEqual(b2cCheck.selectedOption, "b2c", "Selection must be b2c");
    assert(b2cCheck.invoiceNo.startsWith("B2C-"), `B2C invoice number must start with B2C-, got ${b2cCheck.invoiceNo}`);

    // Capture B2C screenshot
    const b2cImg = await window.webContents.capturePage();
    fs.writeFileSync(path.join(screenshotDir, "b2c_dropdown_selected.png"), b2cImg.toPNG());
    console.log("  Saved b2c_dropdown_selected.png");

    console.log("Test 3: Switch back to B2B and verify invoice number auto-switches back to B2B sequence...");
    await window.webContents.executeJavaScript(`
      (() => {
        const seriesSelect = document.querySelector('.invoice-no-dropdown-group select[name="supplyType"]');
        seriesSelect.value = "b2b";
        seriesSelect.dispatchEvent(new Event("change", { bubbles: true }));
      })()
    `);
    await new Promise((r) => setTimeout(r, 300));

    const b2bSwitchBack = await window.webContents.executeJavaScript(`
      (() => {
        const seriesSelect = document.querySelector('.invoice-no-dropdown-group select[name="supplyType"]');
        const invoiceInput = document.querySelector('.invoice-no-dropdown-group input[name="invoiceNo"]');
        return {
          selectedOption: seriesSelect?.value,
          invoiceNo: invoiceInput?.value
        };
      })()
    `);
    console.log("  Switch back result:", b2bSwitchBack);
    assert.strictEqual(b2bSwitchBack.selectedOption, "b2b");
    assert(b2bSwitchBack.invoiceNo.startsWith("INV-"), `Must revert to INV- prefix, got ${b2bSwitchBack.invoiceNo}`);

    console.log("Test 4: Verify independent counting in state - create B2C invoice and check sequences...");
    const countingCheck = await window.webContents.executeJavaScript(`
      (() => {
        // Mock 1 saved B2C invoice and 2 saved B2B invoices
        state.invoices = [
          { id: "inv-b2c-1", invoiceNo: "B2C-2627-0001", type: "sale", supplyType: "b2c", total: 100 },
          { id: "inv-b2b-1", invoiceNo: "INV-2627-0001", type: "sale", supplyType: "b2b", total: 500 },
          { id: "inv-b2b-2", invoiceNo: "INV-2627-0002", type: "sale", supplyType: "b2b", total: 700 }
        ];

        const nextB2C = computeNextDocumentNumber("sale", new Date(), "b2c");
        const nextB2B = computeNextDocumentNumber("sale", new Date(), "b2b");

        return { nextB2C, nextB2B };
      })()
    `);
    console.log("  Independent sequence check:", countingCheck);
    assert(countingCheck.nextB2C.includes("0002"), `B2C sequence should be 0002, got ${countingCheck.nextB2C}`);
    assert(countingCheck.nextB2B.includes("0003"), `B2B sequence should be 0003, got ${countingCheck.nextB2B}`);

    console.log("Test 5: Party with GSTIN auto-switches to B2B...");
    await window.webContents.executeJavaScript(`
      (() => {
        // Set dropdown to B2C first
        const seriesSelect = document.querySelector('.invoice-no-dropdown-group select[name="supplyType"]');
        seriesSelect.value = "b2c";
        seriesSelect.dispatchEvent(new Event("change", { bubbles: true }));

        // Now select registered party
        const partyInput = document.querySelector('[name="party"]');
        partyInput.value = "Acme Enterprises";
        selectTransactionParty(state.parties[1]);
      })()
    `);
    await new Promise((r) => setTimeout(r, 400));

    const registeredPartyCheck = await window.webContents.executeJavaScript(`
      (() => {
        const seriesSelect = document.querySelector('.invoice-no-dropdown-group select[name="supplyType"]');
        const invoiceInput = document.querySelector('.invoice-no-dropdown-group input[name="invoiceNo"]');
        return {
          series: seriesSelect?.value,
          invoiceNo: invoiceInput?.value
        };
      })()
    `);
    console.log("  Registered party auto-switch result:", registeredPartyCheck);
    assert.strictEqual(registeredPartyCheck.series, "b2b", "Registered party with GSTIN should auto-select B2B");
    assert(registeredPartyCheck.invoiceNo.startsWith("INV-"), `Should propose INV- number, got ${registeredPartyCheck.invoiceNo}`);

    console.log("Test 6: Check Settings Invoicing page renders B2B and B2C prefix inputs...");
    await window.webContents.executeJavaScript(`
      (() => {
        elements.featureView.classList.remove("hidden");
        elements.featureView.innerHTML = settingsTemplate("INVOICING");
        bindFeatureActions();
      })()
    `);
    await new Promise((r) => setTimeout(r, 500));

    const settingsCheck = await window.webContents.executeJavaScript(`
      (() => {
        const b2bPrefix = document.querySelector('[name="invoicePrefixB2B"]');
        const b2cPrefix = document.querySelector('[name="invoicePrefixB2C"]');
        const b2bStart = document.querySelector('[name="startingNoB2B"]');
        const b2cStart = document.querySelector('[name="startingNoB2C"]');
        return {
          hasB2BPrefix: Boolean(b2bPrefix),
          b2bPrefixVal: b2bPrefix?.value,
          hasB2CPrefix: Boolean(b2cPrefix),
          b2cPrefixVal: b2cPrefix?.value,
          b2bStartVal: b2bStart?.value,
          b2cStartVal: b2cStart?.value
        };
      })()
    `);
    console.log("  Settings check result:", settingsCheck);
    assert(settingsCheck.hasB2BPrefix, "Settings must have B2B prefix field");
    assert(settingsCheck.hasB2CPrefix, "Settings must have B2C prefix field");
    assert.strictEqual(settingsCheck.b2bPrefixVal, "INV");
    assert.strictEqual(settingsCheck.b2cPrefixVal, "B2C");

    const settingsImg = await window.webContents.capturePage();
    fs.writeFileSync(path.join(screenshotDir, "settings_b2b_b2c_prefixes.png"), settingsImg.toPNG());
    console.log("  Saved settings_b2b_b2c_prefixes.png");

    console.log("\n==============================================");
    console.log("  ALL B2B/B2C INVOICE DROPDOWN TESTS PASSED!  ");
    console.log("==============================================\n");

  } catch (err) {
    console.error("Test failed:", err);
    process.exitCode = 1;
  } finally {
    window.destroy();
    app.quit();
  }
}

app.whenReady().then(runTest);
