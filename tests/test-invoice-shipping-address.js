const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const database = require("../database");

const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity-ide\\brain\\5c203056-94d8-4fb0-8e73-230da57f94fe";
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-shipping-test-"));
app.setPath("userData", testRoot);

async function runShippingTest() {
  await database.initDatabase(testRoot);

  ipcMain.handle("db:get-state", () => database.getState());
  ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
  ipcMain.handle("db:create-party", (_event, party) => database.createParty(party));
  ipcMain.handle("db:update-party", (_event, party) => database.updateParty(party));
  ipcMain.handle("db:create-item", (_event, item) => database.createItem(item));
  ipcMain.handle("db:create-transaction", (_event, txn) => database.createTransaction(txn));
  ipcMain.handle("db:preview-next-invoice-number", (_event, type, date) => database.previewNextInvoiceNumber(type, date));

  const win = new BrowserWindow({
    show: true,
    width: 1366,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 800));

    // Open company
    await win.webContents.executeJavaScript(`document.querySelector(".open-company-button").click(); undefined`);
    await new Promise((r) => setTimeout(r, 500));

    // Create party with both billing and shipping addresses
    await win.webContents.executeJavaScript(`
      (async () => {
        state = normalizeState(await window.giDB.createParty({
          name: "Global Shipments Pvt Ltd",
          phone: "9876543210",
          type: "customer",
          billingAddress: "42 Billing Hub, Brigade Road, Bangalore 560001",
          shippingAddress: "Warehouse 9, Electronic City, Bangalore 560100",
          taxType: "unregistered"
        }));

        state = normalizeState(await window.giDB.createParty({
          name: "Fresh Customer No Address",
          phone: "9123456789",
          type: "customer",
          taxType: "unregistered"
        }));

        state = normalizeState(await window.giDB.createItem({
          name: "Shipping Test Item",
          salePrice: 500,
          unit: "Pcs",
          taxRate: 18,
          taxType: "GST@18%"
        }));
      })()
    `);
    await new Promise((r) => setTimeout(r, 400));

    // Open sale invoice editor
    await win.webContents.executeJavaScript(`openTransactionEditor("sale"); undefined`);
    await new Promise((r) => setTimeout(r, 600));

    // 1. Verify Shipping Address textarea exists in the DOM
    const fieldsCheck = await win.webContents.executeJavaScript(`
      (() => {
        const billingTa = document.querySelector('.transaction-editor textarea[name="address"]');
        const shippingTa = document.querySelector('.transaction-editor textarea[name="shippingAddress"]');
        return {
          hasBilling: Boolean(billingTa),
          hasShipping: Boolean(shippingTa),
          billingPlaceholder: billingTa?.placeholder,
          shippingPlaceholder: shippingTa?.placeholder
        };
      })()
    `);
    console.log("Fields presence check:", fieldsCheck);
    assert.strictEqual(fieldsCheck.hasBilling, true, "Must have Billing Address textarea");
    assert.strictEqual(fieldsCheck.hasShipping, true, "Must have Shipping Address textarea");

    // 2. Select party with saved addresses
    const partyWithAddressCheck = await win.webContents.executeJavaScript(`
      (() => {
        const party = state.parties.find(p => p.name === "Global Shipments Pvt Ltd");
        selectTransactionParty(party);

        const billingTa = document.querySelector('.transaction-editor textarea[name="address"]');
        const shippingTa = document.querySelector('.transaction-editor textarea[name="shippingAddress"]');

        return {
          billingVal: billingTa.value,
          billingReadonly: billingTa.readOnly,
          shippingVal: shippingTa.value,
          shippingReadonly: shippingTa.readOnly
        };
      })()
    `);
    console.log("Party with addresses check:", partyWithAddressCheck);
    assert.strictEqual(partyWithAddressCheck.billingVal, "42 Billing Hub, Brigade Road, Bangalore 560001");
    assert.strictEqual(partyWithAddressCheck.billingReadonly, true, "Billing address must be readonly");
    assert.strictEqual(partyWithAddressCheck.shippingVal, "Warehouse 9, Electronic City, Bangalore 560100");
    assert.strictEqual(partyWithAddressCheck.shippingReadonly, true, "Shipping address must be readonly");

    // Capture visual screenshot of populated billing + shipping addresses
    await new Promise((r) => setTimeout(r, 300));
    const shotPopulated = await win.webContents.capturePage();
    const shotPath1 = path.join(artifactDir, "invoice_shipping_address_populated_verified.png");
    fs.writeFileSync(shotPath1, shotPopulated.toPNG());
    console.log("Saved populated shipping screenshot to:", shotPath1);

    // 3. Test party with NO address -> both should be editable
    const partyNoAddressCheck = await win.webContents.executeJavaScript(`
      (() => {
        const party = state.parties.find(p => p.name === "Fresh Customer No Address");
        selectTransactionParty(party);

        const billingTa = document.querySelector('.transaction-editor textarea[name="address"]');
        const shippingTa = document.querySelector('.transaction-editor textarea[name="shippingAddress"]');

        return {
          billingVal: billingTa.value,
          billingReadonly: billingTa.readOnly,
          shippingVal: shippingTa.value,
          shippingReadonly: shippingTa.readOnly
        };
      })()
    `);
    console.log("Party without address check:", partyNoAddressCheck);
    assert.strictEqual(partyNoAddressCheck.billingReadonly, false, "Billing address must be editable");
    assert.strictEqual(partyNoAddressCheck.shippingReadonly, false, "Shipping address must be editable");

    // 4. Enter addresses in invoice screen and save invoice
    const saveCheck = await win.webContents.executeJavaScript(`
      (async () => {
        const billingTa = document.querySelector('.transaction-editor textarea[name="address"]');
        const shippingTa = document.querySelector('.transaction-editor textarea[name="shippingAddress"]');

        billingTa.value = "100 New Billing Street, Cochin 682001";
        billingTa.dispatchEvent(new Event("input", { bubbles: true }));

        shippingTa.value = "Dock 4, Port Area, Cochin 682003";
        shippingTa.dataset.manuallyEdited = "true";
        shippingTa.dispatchEvent(new Event("input", { bubbles: true }));

        // Fill item row
        const item = state.items.find(i => i.name === "Shipping Test Item");
        const row = document.querySelector("#transactionRows tr");
        selectTransactionItem(row, item);
        recalcTransactionEditor();

        // Submit form
        const form = document.getElementById("transactionEditorForm");
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await new Promise(r => setTimeout(r, 900));

        const updatedParty = state.parties.find(p => p.name === "Fresh Customer No Address");
        const createdInvoice = (state.invoices || [])[0];

        return {
          partyBilling: updatedParty?.billingAddress,
          partyShipping: updatedParty?.shippingAddress,
          invoiceBilling: createdInvoice?.billingAddress,
          invoiceShipping: createdInvoice?.shippingAddress
        };
      })()
    `);
    console.log("After save check:", saveCheck);
    assert.strictEqual(saveCheck.partyBilling, "100 New Billing Street, Cochin 682001", "Party billing address must be auto-saved");
    assert.strictEqual(saveCheck.partyShipping, "Dock 4, Port Area, Cochin 682003", "Party shipping address must be auto-saved");
    assert.strictEqual(saveCheck.invoiceBilling, "100 New Billing Street, Cochin 682001", "Invoice billing address must be saved");
    assert.strictEqual(saveCheck.invoiceShipping, "Dock 4, Port Area, Cochin 682003", "Invoice shipping address must be saved");

    // 5. Select the party in a new invoice -> must auto-refill readonly
    const refilledCheck = await win.webContents.executeJavaScript(`
      (() => {
        openTransactionEditor("sale");
        const party = state.parties.find(p => p.name === "Fresh Customer No Address");
        selectTransactionParty(party);

        const billingTa = document.querySelector('.transaction-editor textarea[name="address"]');
        const shippingTa = document.querySelector('.transaction-editor textarea[name="shippingAddress"]');

        return {
          billingVal: billingTa.value,
          billingReadonly: billingTa.readOnly,
          shippingVal: shippingTa.value,
          shippingReadonly: shippingTa.readOnly
        };
      })()
    `);
    console.log("Refilled in next invoice check:", refilledCheck);
    assert.strictEqual(refilledCheck.billingVal, "100 New Billing Street, Cochin 682001");
    assert.strictEqual(refilledCheck.billingReadonly, true, "Refilled billing address must be readonly");
    assert.strictEqual(refilledCheck.shippingVal, "Dock 4, Port Area, Cochin 682003");
    assert.strictEqual(refilledCheck.shippingReadonly, true, "Refilled shipping address must be readonly");

    // Capture visual screenshot of refilled state
    await new Promise((r) => setTimeout(r, 300));
    const shotRefilled = await win.webContents.capturePage();
    const shotPath2 = path.join(artifactDir, "invoice_shipping_address_refilled_readonly_verified.png");
    fs.writeFileSync(shotPath2, shotRefilled.toPNG());
    console.log("Saved refilled screenshot to:", shotPath2);

    console.log("\n==================================================================");
    console.log("  INVOICE SHIPPING ADDRESS VERIFICATION PASSED 100%!              ");
    console.log("==================================================================\n");

  } catch (err) {
    console.error("Test failed:", err);
    process.exitCode = 1;
  } finally {
    win.close();
    app.quit();
  }
}

app.whenReady().then(runShippingTest);
