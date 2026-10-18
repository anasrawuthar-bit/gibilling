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
  "payment_out_modal_verified.png"
);

async function runPaymentModalTests() {
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

    // Setup mock suppliers and purchase bills
    await window.webContents.executeJavaScript(`
      (() => {
        state.parties = [
          { id: 1, name: "Bharat Steel Distributors", type: "supplier", phone: "9876543210", balance: -50000 },
          { id: 2, name: "Apex Tools Ltd", type: "supplier", phone: "9876543211", balance: -20000 }
        ];

        state.invoices = [
          { id: "pb-101", invoiceNo: "PB-2627-0001", type: "purchase", party: "Bharat Steel Distributors", total: 50000, paidAmount: 0, balance: 50000, date: "2026-10-10" },
          { id: "pb-102", invoiceNo: "PB-2627-0002", type: "purchase", party: "Apex Tools Ltd", total: 20000, paidAmount: 5000, balance: 15000, date: "2026-10-12" }
        ];

        state.payments = [];

        showView("paymentOut");
        openPaymentOutModal();
      })()
    `);

    await new Promise((r) => setTimeout(r, 400));

    console.log("Test 1: Verify Payment-Out Modal DOM structure, solid background, and styling...");
    const checkModal = await window.webContents.executeJavaScript(`
      (() => {
        const modalBackdrop = document.getElementById("paymentOutModal");
        if (!modalBackdrop) return { ok: false, error: "Modal backdrop not found" };

        const modalShell = modalBackdrop.querySelector(".payment-modal-shell");
        if (!modalShell) return { ok: false, error: "payment-modal-shell not found" };

        const header = modalShell.querySelector(".entry-modal-header");
        const title = modalShell.querySelector("#paymentOutTitle")?.textContent.trim();
        const closeBtn = modalShell.querySelector("[data-close-payment-out-modal]");
        const supplierInput = modalShell.querySelector('input[name="party"]');
        const invoiceRefSelect = modalShell.querySelector('select[name="invoiceRef"]');
        const amountInput = modalShell.querySelector('input[name="amount"]');
        const dateInput = modalShell.querySelector('input[name="paymentDate"]');
        const methodSelect = modalShell.querySelector('select[name="method"]');
        const submitBtn = modalShell.querySelector('button[type="submit"]');

        const shellStyle = window.getComputedStyle(modalShell);
        const backdropStyle = window.getComputedStyle(modalBackdrop);

        return {
          ok: true,
          hasHeader: !!header,
          title,
          hasCloseBtn: !!closeBtn,
          hasSupplier: !!supplierInput,
          hasInvoiceRef: !!invoiceRefSelect,
          hasAmount: !!amountInput,
          hasDate: !!dateInput,
          hasMethod: !!methodSelect,
          hasSubmit: !!submitBtn,
          shellBg: shellStyle.backgroundColor,
          shellBorderRadius: shellStyle.borderRadius,
          backdropBg: backdropStyle.backgroundColor
        };
      })()
    `);

    assert.strictEqual(checkModal.ok, true, checkModal.error);
    assert.strictEqual(checkModal.hasHeader, true);
    assert.strictEqual(checkModal.title, "Record Payment-Out");
    assert.strictEqual(checkModal.hasCloseBtn, true);
    assert.strictEqual(checkModal.hasSupplier, true);
    assert.strictEqual(checkModal.hasInvoiceRef, true);
    assert.strictEqual(checkModal.hasAmount, true);
    assert.strictEqual(checkModal.hasDate, true);
    assert.strictEqual(checkModal.hasMethod, true);
    assert.strictEqual(checkModal.hasSubmit, true);
    // Background must be solid white (rgb(255, 255, 255)), not transparent!
    assert.strictEqual(checkModal.shellBg, "rgb(255, 255, 255)", "Modal shell must have solid white background");
    console.log("  ✓ Payment-Out modal rendered with solid white background, title, and all required fields.");

    // Capture screenshot of the Payment-Out window
    const image = await window.webContents.capturePage();
    fs.writeFileSync(screenshotPath, image.toPNG());
    console.log("  ✓ Saved verification screenshot to " + screenshotPath);

    console.log("Test 2: Auto-populate supplier and amount when purchase bill is selected...");
    const checkAutoPopulate = await window.webContents.executeJavaScript(`
      (() => {
        const select = document.querySelector('#paymentOutModal select[name="invoiceRef"]');
        const partyInput = document.querySelector('#paymentOutModal input[name="party"]');
        const amountInput = document.querySelector('#paymentOutModal input[name="amount"]');

        select.value = "PB-2627-0001";
        select.dispatchEvent(new Event("change"));

        return {
          party: partyInput.value,
          amount: amountInput.value
        };
      })()
    `);

    assert.strictEqual(checkAutoPopulate.party, "Bharat Steel Distributors");
    assert.strictEqual(checkAutoPopulate.amount, "50000");
    console.log("  ✓ Auto-populated supplier 'Bharat Steel Distributors' and balance '50000'.");

    console.log("Test 3: Submit Payment-Out form and verify closure and record creation...");
    const checkSubmit = await window.webContents.executeJavaScript(`
      (() => {
        const form = document.querySelector("#paymentOutForm");
        form.dispatchEvent(new Event("submit", { cancelable: true }));

        const modalAfter = document.getElementById("paymentOutModal");
        return {
          modalClosed: !modalAfter,
          paymentCount: (state.payments || []).length
        };
      })()
    `);

    assert.strictEqual(checkSubmit.modalClosed, true, "Modal should be closed after submit");
    assert.strictEqual(checkSubmit.paymentCount, 1, "Payment record should be added to state");
    console.log("  ✓ Payment-Out saved successfully and modal cleanly dismissed.");

    console.log("\nALL PAYMENT MODAL TESTS PASSED SUCCESSFULLY!");
  } finally {
    window.close();
  }
}

app.whenReady().then(async () => {
  try {
    await runPaymentModalTests();
    app.exit(0);
  } catch (err) {
    console.error("Test failed with error:", err);
    app.exit(1);
  }
});
