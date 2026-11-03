const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const database = require("../database");

const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity-ide\\brain\\9dd39af8-a7ad-430b-8ee8-49729ceb732f";
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-multi-address-test-"));
app.setPath("userData", testRoot);

async function runTest() {
  await database.initDatabase(testRoot);
  ipcMain.handle("db:get-state", () => database.getState());
  ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
  ipcMain.handle("db:create-party", (_event, party) => database.createParty(party));
  ipcMain.handle("db:update-party", (_event, party) => database.updateParty(party));
  ipcMain.handle("db:create-transaction", (_event, txn) => database.createTransaction(txn));
  ipcMain.handle("db:create-item", (_event, item) => database.createItem(item));
  ipcMain.handle("db:preview-next-invoice-number", (_event, type, date) => database.previewNextInvoiceNumber(type, date));

  const window = new BrowserWindow({
    show: true,
    width: 1366,
    height: 920,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 800));

    // Open first company
    await window.webContents.executeJavaScript(`document.querySelector(".open-company-button").click(); undefined`);
    await new Promise((r) => setTimeout(r, 500));

    // ═══════════════════════════════════════════════════════════════════
    // PART 1: Multi-address cards separation in Add Party modal
    // ═══════════════════════════════════════════════════════════════════
    console.log("TEST 1: Opening Add Party modal and entering multiple addresses...");
    const multiAddressCheck = await window.webContents.executeJavaScript(`
      (() => {
        openEntryModal("party");
        document.getElementById("partyNameInput").value = "Multi Address Enterprises";
        document.getElementById("partyPhoneInput").value = "9811122233";

        // Tab 1: GST & Address
        const billingList = document.getElementById("billingAddressList");
        const shippingList = document.getElementById("shippingAddressList");

        // 1. Enter text in Card 1 of billing
        const card1BillingTa = billingList.querySelector(".address-card textarea");
        card1BillingTa.value = "101 Alpha Tower, Ring Road, Surat 395001";
        card1BillingTa.dispatchEvent(new Event("input", { bubbles: true }));

        // 2. Click + Add New Address in billing
        document.getElementById("addBillingAddressBtn").click();

        // 3. Enter text in Card 2 of billing
        const billingCards = billingList.querySelectorAll(".address-card");
        const card2BillingTa = billingCards[1].querySelector("textarea");
        card2BillingTa.value = "202 Beta Plaza, GIDC Estate, Vapi 396191";
        card2BillingTa.dispatchEvent(new Event("input", { bubbles: true }));

        // 4. Enter text in Card 1 of shipping
        const card1ShippingTa = shippingList.querySelector(".address-card textarea");
        card1ShippingTa.value = "Warehouse A, Sector 4, Gandhinagar 382010";
        card1ShippingTa.dispatchEvent(new Event("input", { bubbles: true }));

        // 5. Click + Add New Address in shipping
        document.getElementById("addShippingAddressBtn").click();

        // 6. Enter text in Card 2 of shipping
        const shippingCards = shippingList.querySelectorAll(".address-card");
        const card2ShippingTa = shippingCards[1].querySelector("textarea");
        card2ShippingTa.value = "Warehouse B, Express Way, Ahmedabad 380001";
        card2ShippingTa.dispatchEvent(new Event("input", { bubbles: true }));

        // Check values in all cards
        return {
          billingCard1: card1BillingTa.value,
          billingCard2: card2BillingTa.value,
          shippingCard1: card1ShippingTa.value,
          shippingCard2: card2ShippingTa.value,
          totalBillingCards: billingCards.length,
          totalShippingCards: shippingCards.length
        };
      })()
    `);

    console.log("  Multi-address cards check:", multiAddressCheck);
    assert.strictEqual(multiAddressCheck.totalBillingCards, 2, "Must have 2 billing address cards");
    assert.strictEqual(multiAddressCheck.totalShippingCards, 2, "Must have 2 shipping address cards");
    assert.strictEqual(multiAddressCheck.billingCard1, "101 Alpha Tower, Ring Road, Surat 395001", "Card 1 must NOT be replaced by Card 2");
    assert.strictEqual(multiAddressCheck.billingCard2, "202 Beta Plaza, GIDC Estate, Vapi 396191", "Card 2 must hold its own text");
    assert.strictEqual(multiAddressCheck.shippingCard1, "Warehouse A, Sector 4, Gandhinagar 382010", "Card 1 shipping must NOT be replaced");
    assert.strictEqual(multiAddressCheck.shippingCard2, "Warehouse B, Express Way, Ahmedabad 380001", "Card 2 shipping must hold its own text");
    assert.notStrictEqual(multiAddressCheck.billingCard1, multiAddressCheck.billingCard2, "Billing addresses must be different");
    assert.notStrictEqual(multiAddressCheck.shippingCard1, multiAddressCheck.shippingCard2, "Shipping addresses must be different");

    // Capture screenshot of party modal with independent multi-addresses
    await new Promise((r) => setTimeout(r, 300));
    const partyShot = await window.webContents.capturePage();
    const partyShotPath = path.join(artifactDir, "party_multi_address_independent_verified.png");
    fs.writeFileSync(partyShotPath, partyShot.toPNG());
    console.log("  Saved multi-address party modal screenshot to:", partyShotPath);

    // Save the party
    console.log("TEST 2: Saving party with multiple addresses...");
    await window.webContents.executeJavaScript(`
      (() => {
        const form = document.getElementById("entryForm");
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      })()
    `);
    await new Promise((r) => setTimeout(r, 600));

    // Re-open in edit mode and verify multiple addresses are restored
    console.log("TEST 3: Re-opening party in edit mode to verify address restoration...");
    const editCheck = await window.webContents.executeJavaScript(`
      (() => {
        const party = state.parties.find(p => p.name === "Multi Address Enterprises");
        openEntryModal("party", party);

        const billingList = document.getElementById("billingAddressList");
        const shippingList = document.getElementById("shippingAddressList");
        const bCards = billingList.querySelectorAll(".address-card textarea");
        const sCards = shippingList.querySelectorAll(".address-card textarea");

        return {
          partyFound: Boolean(party),
          billingCount: bCards.length,
          billing1: bCards[0]?.value,
          billing2: bCards[1]?.value,
          shippingCount: sCards.length,
          shipping1: sCards[0]?.value,
          shipping2: sCards[1]?.value,
        };
      })()
    `);

    console.log("  Edit restoration check:", editCheck);
    assert.strictEqual(editCheck.billingCount, 2, "Should restore 2 billing address cards");
    assert.strictEqual(editCheck.billing1, "101 Alpha Tower, Ring Road, Surat 395001");
    assert.strictEqual(editCheck.billing2, "202 Beta Plaza, GIDC Estate, Vapi 396191");
    assert.strictEqual(editCheck.shippingCount, 2, "Should restore 2 shipping address cards");
    assert.strictEqual(editCheck.shipping1, "Warehouse A, Sector 4, Gandhinagar 382010");
    assert.strictEqual(editCheck.shipping2, "Warehouse B, Express Way, Ahmedabad 380001");

    // Close party modal
    await window.webContents.executeJavaScript(`closeEntryModal()`);
    await new Promise((r) => setTimeout(r, 400));

    // ═══════════════════════════════════════════════════════════════════
    // PART 2: Invoice Screen Address Workflow
    // ═══════════════════════════════════════════════════════════════════
    console.log("\nTEST 4: Creating a party with NO address (Addressless Party Ltd)...");
    await window.webContents.executeJavaScript(`
      (async () => {
        state = normalizeState(await window.giDB.createParty({
          name: "Addressless Party Ltd",
          phone: "9876500001",
          type: "customer",
          taxType: "unregistered"
        }));
      })()
    `);
    await new Promise((r) => setTimeout(r, 400));

    console.log("TEST 5: Selecting party with NO address in invoice screen -> address must be editable (NOT readonly)...");
    const addresslessCheck = await window.webContents.executeJavaScript(`
      (() => {
        openTransactionEditor("sale");
        const party = state.parties.find(p => p.name === "Addressless Party Ltd");
        selectTransactionParty(party);

        const addressInput = document.querySelector('.transaction-editor [name="address"]');
        return {
          isReadonly: addressInput.readOnly,
          tabIndex: addressInput.getAttribute("tabindex"),
          value: addressInput.value,
          placeholder: addressInput.placeholder
        };
      })()
    `);

    console.log("  Party without address check:", addresslessCheck);
    assert.strictEqual(addresslessCheck.isReadonly, false, "Address MUST be editable (readOnly=false) when party has no address");
    assert.strictEqual(addresslessCheck.tabIndex, null, "tabIndex=-1 must be removed so user can focus");
    assert.strictEqual(addresslessCheck.value, "", "Initial address value must be empty");

    console.log("TEST 6: Entering party address directly in invoice screen and saving invoice...");
    const invoiceSaveCheck = await window.webContents.executeJavaScript(`
      (async () => {
        // Create an item first so row matches an existing item
        state = normalizeState(await window.giDB.createItem({
          name: "Test Consulting Product",
          type: "product",
          salePrice: 1000,
          unit: "PCS"
        }));

        const addressInput = document.querySelector('.transaction-editor [name="address"]');
        addressInput.value = "456 Commerce Avenue, Suite 7, Chennai 600002";
        addressInput.dispatchEvent(new Event("input", { bubbles: true }));

        // Fill item row
        const itemRow = document.querySelector("#transactionRows tr");
        itemRow.querySelector('[name="item"]').value = "Test Consulting Product";
        itemRow.querySelector('[name="qty"]').value = "1";
        itemRow.querySelector('[name="price"]').value = "1000";
        recalcTransactionEditor();

        // Submit invoice form
        const form = document.querySelector("#transactionEditorForm");
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await new Promise(r => setTimeout(r, 800));

        const updatedParty = state.parties.find(p => p.name === "Addressless Party Ltd");
        return {
          partyAddressAfterSave: updatedParty?.billingAddress
        };
      })()
    `);

    console.log("  After invoice save check:", invoiceSaveCheck);
    assert.strictEqual(
      invoiceSaveCheck.partyAddressAfterSave,
      "456 Commerce Avenue, Suite 7, Chennai 600002",
      "Address entered in invoice screen MUST be saved to party details!"
    );

    console.log("TEST 7: Selecting the same party in a new invoice -> address must automatically refill READ ONLY...");
    const refilledCheck = await window.webContents.executeJavaScript(`
      (() => {
        openTransactionEditor("sale");
        const party = state.parties.find(p => p.name === "Addressless Party Ltd");
        selectTransactionParty(party);

        const addressInput = document.querySelector('.transaction-editor [name="address"]');
        return {
          value: addressInput.value,
          isReadonly: addressInput.readOnly,
          tabIndex: addressInput.getAttribute("tabindex")
        };
      })()
    `);

    console.log("  Next invoice selection check:", refilledCheck);
    assert.strictEqual(
      refilledCheck.value,
      "456 Commerce Avenue, Suite 7, Chennai 600002",
      "Saved address must be automatically refilled"
    );
    assert.strictEqual(refilledCheck.isReadonly, true, "Refilled address must now be read only");
    assert.strictEqual(refilledCheck.tabIndex, "-1", "Refilled address must have tabindex='-1'");

    // Open more details so address field is fully visible in screenshot
    await window.webContents.executeJavaScript(`
      (() => {
        const moreDetails = document.querySelector(".editor-unified-more-details");
        if (moreDetails) moreDetails.open = true;
      })()
    `);
    await new Promise((r) => setTimeout(r, 300));

    const invoiceShot = await window.webContents.capturePage();
    const invoiceShotPath = path.join(artifactDir, "invoice_editor_saved_address_readonly_verified.png");
    fs.writeFileSync(invoiceShotPath, invoiceShot.toPNG());
    console.log("  Saved refilled readonly address screenshot to:", invoiceShotPath);

    console.log("\n==================================================================");
    console.log("  ALL MULTI-ADDRESS & INVOICE ADDRESS REFILL TESTS PASSED 100%!   ");
    console.log("==================================================================\n");

  } catch (err) {
    console.error("Test failed:", err);
    process.exitCode = 1;
  } finally {
    window.close();
    app.quit();
  }
}

app.whenReady().then(runTest);
