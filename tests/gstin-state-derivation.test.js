const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-gstin-test-"));
app.setPath("userData", testRoot);

const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity\\brain\\bed9650d-397d-4216-aa80-c0ae1c3c4fcb";
const capturePath = path.join(artifactDir, "gstin_state_auto_derived_verified.png");

app.whenReady().then(async () => {
  let win;
  try {
    await database.initDatabase(testRoot);

    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
    ipcMain.handle("db:get-last-active-company", () => database.getLastActiveCompany());
    ipcMain.handle("db:create-party", (_event, party) => database.createParty(party));

    win = new BrowserWindow({
      show: true,
      width: 1366,
      height: 768,
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

    // Test 1: Unit tests on getStateByGstin inside renderer context
    const unitResults = await win.webContents.executeJavaScript(`(() => {
      return {
        chhattisgarh: getStateByGstin("22AAAAA0000A1Z5"),
        kerala: getStateByGstin("32ABCDE1234F1Z5"),
        maharashtra: getStateByGstin("27AAAAA0000A1Z5"),
        karnataka: getStateByGstin("29AABCU9603R1ZM"),
        delhi: getStateByGstin("07AAAAA0000A1Z5"),
        blank: getStateByGstin(""),
        invalid: getStateByGstin("99AAAAA0000A1Z5")
      };
    })()`);

    console.log("Unit test results:", unitResults);
    assert.strictEqual(unitResults.chhattisgarh, "Chhattisgarh");
    assert.strictEqual(unitResults.kerala, "Kerala");
    assert.strictEqual(unitResults.maharashtra, "Maharashtra");
    assert.strictEqual(unitResults.karnataka, "Karnataka");
    assert.strictEqual(unitResults.delhi, "Delhi");
    assert.strictEqual(unitResults.blank, "");
    console.log("✓ getStateByGstin unit tests passed!");

    // Test 2: Party Modal GSTIN Entry
    const partyModalResult = await win.webContents.executeJavaScript(`(() => {
      openEntryModal("party");
      activatePartyTab("gst");
      const gstinInput = document.querySelector("#partyGstinInput");
      const stateInput = document.querySelector("#partyStateInput");
      const panInput = document.querySelector("#partyPanInput");
      const taxType = document.querySelector("#partyTaxType");

      gstinInput.value = "22AAAAA0000A1Z5";
      gstinInput.dispatchEvent(new Event("input", { bubbles: true }));

      const stateVal = stateInput.value;
      const panVal = panInput.value;
      const taxTypeVal = taxType.value;

      closeEntryModal();
      return { stateVal, panVal, taxTypeVal };
    })()`);

    console.log("Party Modal test result:", partyModalResult);
    assert.strictEqual(partyModalResult.stateVal, "Chhattisgarh");
    assert.strictEqual(partyModalResult.panVal, "AAAAA0000A");
    assert.strictEqual(partyModalResult.taxTypeVal, "gst_registered");
    console.log("✓ Party Modal GSTIN auto-derivation passed!");

    // Test 3: Transaction Editor - party selection with GSTIN
    await win.webContents.executeJavaScript(`(async () => {
      await window.giDB.createParty({
        name: "techii",
        phone: "8476541513",
        gstin: "22AAAAA0000A1Z5",
        state: "Kerala",
        billingAddress: "pattambi",
        taxType: "gst_registered"
      });
      state = normalizeState(await window.giDB.getState());
    })()`);
    await new Promise((r) => setTimeout(r, 400));

    // Open sale editor
    await win.webContents.executeJavaScript(`openTransactionEditor("sale")`);
    await new Promise((r) => setTimeout(r, 600));

    // Open more details in sale editor
    await win.webContents.executeJavaScript(`document.querySelector(".editor-more-details").open = true`);

    // Select party "techii"
    const salePartySelectResult = await win.webContents.executeJavaScript(`(() => {
      const techii = (state.parties || []).find(x => x.name === "techii");
      selectTransactionParty(techii);
      const stateSelect = elements.featureView.querySelector('[name="state"]');
      const gstinInput = elements.featureView.querySelector('[name="partyGstin"]');
      const supplyType = elements.featureView.querySelector('[name="supplyType"]');
      const taxSplit = editorTaxSplitMode();
      return {
        placeOfSupply: stateSelect?.value,
        partyGstin: gstinInput?.value,
        supplyType: supplyType?.value,
        taxSplit
      };
    })()`);

    console.log("Sale Party Select test result:", salePartySelectResult);
    assert.strictEqual(salePartySelectResult.placeOfSupply, "Chhattisgarh");
    assert.strictEqual(salePartySelectResult.partyGstin, "22AAAAA0000A1Z5");
    assert.strictEqual(salePartySelectResult.supplyType, "b2b");
    assert.strictEqual(salePartySelectResult.taxSplit, "igst");
    console.log("✓ Sale Editor party select with GSTIN passed!");

    // Test 4: Transaction Editor - direct entry in Party GSTIN input
    const directEntryResult = await win.webContents.executeJavaScript(`(() => {
      const gstinInput = elements.featureView.querySelector('[name="partyGstin"]');
      gstinInput.value = "27AAAAA0000A1Z5";
      gstinInput.dispatchEvent(new Event("input", { bubbles: true }));

      const stateSelect = elements.featureView.querySelector('[name="state"]');
      const supplyType = elements.featureView.querySelector('[name="supplyType"]');
      const taxSplit = editorTaxSplitMode();
      return {
        placeOfSupply: stateSelect?.value,
        partyGstin: gstinInput?.value,
        supplyType: supplyType?.value,
        taxSplit
      };
    })()`);

    console.log("Direct Party GSTIN Entry test result:", directEntryResult);
    assert.strictEqual(directEntryResult.placeOfSupply, "Maharashtra");
    assert.strictEqual(directEntryResult.partyGstin, "27AAAAA0000A1Z5");
    assert.strictEqual(directEntryResult.supplyType, "b2b");
    assert.strictEqual(directEntryResult.taxSplit, "igst");
    console.log("✓ Sale Editor direct GSTIN entry passed!");

    // Now re-select techii and add item row so the screenshot mirrors user request exactly
    await win.webContents.executeJavaScript(`(() => {
      const techii = (state.parties || []).find(x => x.name === "techii");
      selectTransactionParty(techii);

      const itemField = document.querySelector('#transactionRows tr:first-child [name="item"]');
      const qtyField = document.querySelector('#transactionRows tr:first-child [name="qty"]');
      const priceField = document.querySelector('#transactionRows tr:first-child [name="price"]');
      const taxField = document.querySelector('#transactionRows tr:first-child [name="tax"]');
      if (itemField) itemField.value = "256 ssd wd";
      if (qtyField) qtyField.value = "5";
      if (priceField) priceField.value = "4500";
      if (taxField) taxField.value = "18";
      recalcTransactionEditor();

      const moreDetails = document.querySelector(".editor-more-details");
      if (moreDetails) moreDetails.open = true;
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Capture screenshot
    const image = await win.webContents.capturePage();
    fs.writeFileSync(capturePath, image.toPNG());
    console.log("Screenshot captured to:", capturePath);

    console.log("\nALL GSTIN-STATE DERIVATION TESTS PASSED 100%!");
    win.destroy();
    app.quit();
  } catch (err) {
    console.error("Test failed:", err);
    if (win) win.destroy();
    app.quit();
    process.exit(1);
  }
});
