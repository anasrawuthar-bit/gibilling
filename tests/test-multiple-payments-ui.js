const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const database = require("../database");

const screenshotDir = path.join(
  "C:",
  "Users",
  "ANAS",
  ".gemini",
  "antigravity",
  "brain",
  "bed9650d-397d-4216-aa80-c0ae1c3c4fcb"
);
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-multi-pmt-ui-test-"));
app.setPath("userData", testRoot);

app.whenReady().then(async () => {
  let win = null;
  try {
    await database.initDatabase(testRoot);

    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
    ipcMain.handle("db:create-party", (_event, party) => database.createParty(party));
    ipcMain.handle("db:update-party", (_event, party) => database.updateParty(party));
    ipcMain.handle("db:create-item", (_event, item) => database.createItem(item));
    ipcMain.handle("db:create-transaction", (_event, txn) => database.createTransaction(txn));
    ipcMain.handle("db:update-invoice", (_event, invoice) => database.updateInvoice(invoice));
    ipcMain.handle("db:record-payment-in", (_event, payment) => database.recordPaymentIn(payment));
    ipcMain.handle("db:record-payment-out", (_event, payment) => database.recordPaymentOut(payment));
    ipcMain.handle("db:record-invoice-payment", (_event, payment) => database.recordInvoicePayment(payment));
    ipcMain.handle("db:preview-next-invoice-number", (_event, type, date) => database.previewNextInvoiceNumber(type, date));

    win = new BrowserWindow({
      show: false,
      width: 1366,
      height: 800,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 1200));

    console.log("TEST 1: Verifying Split Payment in Sale Transaction Editor...");
    const saleEditorCheck = await win.webContents.executeJavaScript(`
      (() => {
        openTransactionEditor("sale");
        const toggleBtn = document.getElementById("btnToggleSplitPayment");
        const splitBox = document.getElementById("editorSplitPaymentsBox");
        const singleRow = document.getElementById("editorSinglePaymentMethodRow");
        if (!toggleBtn || !splitBox || !singleRow) {
          return { error: "Missing toggle button or containers" };
        }

        // Initially split box is hidden
        const initHidden = splitBox.classList.contains("hidden");

        // Click toggle to open split payment
        toggleBtn.click();
        const opened = !splitBox.classList.contains("hidden");
        const rowsContainer = document.getElementById("editorSplitPaymentRows");
        const rowCount = rowsContainer ? rowsContainer.children.length : 0;

        // Set split amounts: Row 1 = 2000 (Cash), Row 2 = 3000 (UPI)
        const rows = rowsContainer.querySelectorAll("[data-split-row]");
        if (rows.length >= 2) {
          const r1Amt = rows[0].querySelector(".split-amount-input");
          const r1Method = rows[0].querySelector(".split-method-select");
          const r2Amt = rows[1].querySelector(".split-amount-input");
          const r2Method = rows[1].querySelector(".split-method-select");

          r1Method.value = "Cash";
          r1Amt.value = "2000";
          r1Amt.dispatchEvent(new Event("input", { bubbles: true }));

          r2Method.value = "UPI";
          r2Amt.value = "3000";
          r2Amt.dispatchEvent(new Event("input", { bubbles: true }));
        }

        const receivedVal = document.getElementById("editorReceived")?.value;
        const totalDisplay = document.getElementById("editorSplitTotalDisplay")?.textContent;

        return {
          initHidden,
          opened,
          rowCount,
          receivedVal,
          totalDisplay,
        };
      })()
    `);

    console.log("Sale editor check result:", saleEditorCheck);
    assert.strictEqual(saleEditorCheck.initHidden, true, "Split box initially hidden");
    assert.strictEqual(saleEditorCheck.opened, true, "Split box opened on toggle");
    assert.strictEqual(saleEditorCheck.rowCount >= 2, true, "At least 2 split rows initialized");
    assert.strictEqual(saleEditorCheck.receivedVal, "5000.00", "Received auto-sums to ₹5000.00");

    // Take screenshot of Sale Editor with split payment
    const saleShot = await win.webContents.capturePage();
    fs.writeFileSync(
      path.join(screenshotDir, "clean_sale_editor_split_payments.png"),
      saleShot.toPNG()
    );
    console.log("Saved clean_sale_editor_split_payments.png");

    console.log("TEST 2: Verifying Split Payment in Payment-In Modal...");
    const paymentInCheck = await win.webContents.executeJavaScript(`
      (() => {
        openPaymentInModal();
        const toggleBtn = document.getElementById("btnPaymentInSplitToggle");
        const splitBox = document.getElementById("paymentInSplitBox");
        const singleGroup = document.getElementById("paymentInSingleMethodGroup");
        if (!toggleBtn || !splitBox) {
          return { error: "Missing Payment-In split elements" };
        }

        const initHidden = splitBox.classList.contains("hidden");
        toggleBtn.click();
        const opened = !splitBox.classList.contains("hidden");
        const rowsContainer = document.getElementById("paymentInSplitRows");
        const rowCount = rowsContainer ? rowsContainer.children.length : 0;

        // Enter split amounts
        const rows = rowsContainer.querySelectorAll("[data-split-row]");
        if (rows.length >= 2) {
          const r1Amt = rows[0].querySelector(".split-amount-input");
          const r1Method = rows[0].querySelector(".split-method-select");
          const r2Amt = rows[1].querySelector(".split-amount-input");
          const r2Method = rows[1].querySelector(".split-method-select");

          r1Method.value = "Cash";
          r1Amt.value = "1500";
          r1Amt.dispatchEvent(new Event("input", { bubbles: true }));

          r2Method.value = "UPI";
          r2Amt.value = "2500";
          r2Amt.dispatchEvent(new Event("input", { bubbles: true }));
        }

        const amountInputVal = document.querySelector('#paymentInForm [name="amount"]')?.value;
        const totalDisplay = document.getElementById("paymentInSplitTotalDisplay")?.textContent;

        return {
          initHidden,
          opened,
          rowCount,
          amountInputVal,
          totalDisplay,
        };
      })()
    `);

    console.log("Payment-In modal check result:", paymentInCheck);
    assert.strictEqual(paymentInCheck.initHidden, true, "Payment-In split box initially hidden");
    assert.strictEqual(paymentInCheck.opened, true, "Payment-In split box opened");
    assert.strictEqual(paymentInCheck.amountInputVal, "4000.00", "Amount input auto-sums to ₹4000.00");

    const pmtInShot = await win.webContents.capturePage();
    fs.writeFileSync(
      path.join(screenshotDir, "clean_payment_in_split_modal.png"),
      pmtInShot.toPNG()
    );
    console.log("Saved clean_payment_in_split_modal.png");

    console.log("TEST 3: Verifying Split Payment in Payment-Out Modal...");
    const paymentOutCheck = await win.webContents.executeJavaScript(`
      (() => {
        document.getElementById("paymentInModal")?.remove();
        openPaymentOutModal();
        const toggleBtn = document.getElementById("btnPaymentOutSplitToggle");
        const splitBox = document.getElementById("paymentOutSplitBox");
        if (!toggleBtn || !splitBox) {
          return { error: "Missing Payment-Out split elements" };
        }

        const initHidden = splitBox.classList.contains("hidden");
        toggleBtn.click();
        const opened = !splitBox.classList.contains("hidden");
        const rowsContainer = document.getElementById("paymentOutSplitRows");

        const rows = rowsContainer.querySelectorAll("[data-split-row]");
        if (rows.length >= 2) {
          const r1Amt = rows[0].querySelector(".split-amount-input");
          const r1Method = rows[0].querySelector(".split-method-select");
          const r2Amt = rows[1].querySelector(".split-amount-input");
          const r2Method = rows[1].querySelector(".split-method-select");

          r1Method.value = "Cash";
          r1Amt.value = "2000";
          r1Amt.dispatchEvent(new Event("input", { bubbles: true }));

          r2Method.value = "Bank";
          r2Amt.value = "3000";
          r2Amt.dispatchEvent(new Event("input", { bubbles: true }));
        }

        const amountInputVal = document.querySelector('#paymentOutForm [name="amount"]')?.value;
        const totalDisplay = document.getElementById("paymentOutSplitTotalDisplay")?.textContent;

        return {
          initHidden,
          opened,
          amountInputVal,
          totalDisplay,
        };
      })()
    `);

    console.log("Payment-Out modal check result:", paymentOutCheck);
    assert.strictEqual(paymentOutCheck.initHidden, true, "Payment-Out split box initially hidden");
    assert.strictEqual(paymentOutCheck.opened, true, "Payment-Out split box opened");
    assert.strictEqual(paymentOutCheck.amountInputVal, "5000.00", "Amount input auto-sums to ₹5000.00");

    const pmtOutShot = await win.webContents.capturePage();
    fs.writeFileSync(
      path.join(screenshotDir, "clean_payment_out_split_modal.png"),
      pmtOutShot.toPNG()
    );
    console.log("Saved clean_payment_out_split_modal.png");

    console.log("TEST 4: Verifying Split Payment in Invoice Action Modal (Receive Payment)...");
    const invoiceModalCheck = await win.webContents.executeJavaScript(`
      (() => {
        document.getElementById("paymentOutModal")?.remove();
        const dummyInvoice = {
          id: "inv-dummy-1",
          invoiceNo: "INV-2026-0099",
          type: "sale",
          party: "Anas Customer",
          total: 8000,
          received: 0,
          balance: 8000,
          status: "unpaid",
        };
        openInvoicePaymentModal(dummyInvoice);
        const toggleBtn = document.getElementById("btnInvoiceModalSplitToggle");
        const splitBox = document.getElementById("invoiceModalSplitBox");
        if (!toggleBtn || !splitBox) {
          return { error: "Missing Invoice Action Modal split elements" };
        }

        const initHidden = splitBox.classList.contains("hidden");
        toggleBtn.click();
        const opened = !splitBox.classList.contains("hidden");
        const rowsContainer = document.getElementById("invoiceModalSplitRows");

        const rows = rowsContainer.querySelectorAll("[data-split-row]");
        if (rows.length >= 2) {
          const r1Amt = rows[0].querySelector(".split-amount-input");
          const r1Method = rows[0].querySelector(".split-method-select");
          const r2Amt = rows[1].querySelector(".split-amount-input");
          const r2Method = rows[1].querySelector(".split-method-select");

          r1Method.value = "Cash";
          r1Amt.value = "3000";
          r1Amt.dispatchEvent(new Event("input", { bubbles: true }));

          r2Method.value = "UPI";
          r2Amt.value = "5000";
          r2Amt.dispatchEvent(new Event("input", { bubbles: true }));
        }

        const amountVal = document.querySelector('#invoicePaymentForm [name="amount"]')?.value;

        return {
          initHidden,
          opened,
          amountVal,
        };
      })()
    `);

    console.log("Invoice action modal check result:", invoiceModalCheck);
    assert.strictEqual(invoiceModalCheck.initHidden, true, "Invoice modal split box initially hidden");
    assert.strictEqual(invoiceModalCheck.opened, true, "Invoice modal split box opened");
    assert.strictEqual(invoiceModalCheck.amountVal, "8000.00", "Amount auto-sums to ₹8000.00");

    const invModalShot = await win.webContents.capturePage();
    fs.writeFileSync(
      path.join(screenshotDir, "clean_invoice_action_split_modal.png"),
      invModalShot.toPNG()
    );
    console.log("Saved clean_invoice_action_split_modal.png");

    console.log("\n========================================================");
    console.log("   ALL MULTIPLE PAYMENT METHOD UI TESTS PASSED 100%!   ");
    console.log("========================================================\n");
  } catch (err) {
    console.error("UI Test error:", err);
    process.exitCode = 1;
  } finally {
    if (win) win.destroy();
    app.quit();
  }
});
