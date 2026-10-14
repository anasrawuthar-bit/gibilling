const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-expense-modal-test-"));
app.setPath("userData", testRoot);

app.whenReady().then(async () => {
  const rendererErrors = [];

  try {
    await database.initDatabase(testRoot);
    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
    ipcMain.handle("db:create-transaction", (_event, txn) => database.createTransaction(txn));
    ipcMain.handle("db:update-transaction", (_event, txn) => database.updateTransaction(txn));

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

    console.log("Test 1: Opening Add Expense modal and verifying header, mode bar, and pinned footer...");
    const modalInitialState = await window.webContents.executeJavaScript(`(() => {
      showView("expenses");
      openExpenseModal();
      const modal = document.querySelector(".expense-modal-backdrop");
      const form = document.getElementById("expenseForm");
      const title = document.getElementById("expenseModalTitle");
      const nonGstChip = document.getElementById("expenseModeNonGst");
      const gstChip = document.getElementById("expenseModeGst");
      const modeInput = document.getElementById("expenseModeInput");
      const amountLabel = document.getElementById("expenseAmountLabel");
      const catChips = Array.from(document.querySelectorAll(".expense-cat-chip")).map(c => c.dataset.cat);
      const payChips = Array.from(document.querySelectorAll("#expensePaymentMethodChips .expense-chip")).map(c => c.dataset.method);
      const statusChips = Array.from(document.querySelectorAll("#expenseStatusChips .status-chip")).map(c => c.dataset.status);
      const footer = form.querySelector(".expense-modal-footer");
      const saveBtn = document.getElementById("saveExpenseBtn");
      const footerTotal = document.getElementById("expenseFooterTotal");

      const formRect = form.getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();

      return {
        isBackdropOpen: Boolean(modal),
        titleText: title.innerText.trim(),
        isNonGstActive: nonGstChip.classList.contains("active"),
        isGstActive: gstChip.classList.contains("active"),
        modeInputValue: modeInput.value,
        amountLabelText: amountLabel.innerText.trim(),
        hasNonGstClass: form.classList.contains("is-nongst-mode"),
        catChipsCount: catChips.length,
        payChipsCount: payChips.length,
        statusChipsCount: statusChips.length,
        saveBtnText: saveBtn.innerText.trim(),
        footerTotalText: footerTotal.innerText.trim(),
        footerVisibleWithinModal: footerRect.bottom <= formRect.bottom + 2,
        modalHeight: formRect.height,
        windowHeight: window.innerHeight
      };
    })()`);

    assert.strictEqual(modalInitialState.isBackdropOpen, true, "Expense backdrop must be open");
    assert.strictEqual(modalInitialState.titleText, "Add Expense", "Title must be Add Expense");
    assert.strictEqual(modalInitialState.isNonGstActive, true, "Non-GST mode should be active by default");
    assert.strictEqual(modalInitialState.isGstActive, false, "GST mode should NOT be active by default");
    assert.strictEqual(modalInitialState.modeInputValue, "nongst", "Mode hidden input should be 'nongst'");
    assert.strictEqual(modalInitialState.amountLabelText.includes("Expense Amount"), true, "Label should say Expense Amount in Non-GST mode");
    assert.strictEqual(modalInitialState.hasNonGstClass, true, "Form must have .is-nongst-mode class");
    assert.ok(modalInitialState.catChipsCount >= 8, "Must have quick category chips");
    assert.ok(modalInitialState.payChipsCount >= 4, "Must have payment method chips");
    assert.strictEqual(modalInitialState.statusChipsCount, 3, "Must have 3 payment status chips");
    assert.strictEqual(modalInitialState.saveBtnText, "Save Expense", "Save button must say Save Expense");
    assert.strictEqual(modalInitialState.footerVisibleWithinModal, true, "Footer must be pinned inside modal bounds");
    console.log("  ✓ Add Expense modal header, mode bar, and pinned footer verified.");

    console.log("Test 2: Category preset chips selection...");
    const catChipResult = await window.webContents.executeJavaScript(`(() => {
      const rentChip = document.querySelector('.expense-cat-chip[data-cat="Office Rent"]');
      rentChip.click();
      const catInput = document.getElementById("expenseCategoryInput");
      return {
        inputValue: catInput.value,
        isRentActive: rentChip.classList.contains("active")
      };
    })()`);

    assert.strictEqual(catChipResult.inputValue, "Office Rent", "Category input should be updated to 'Office Rent'");
    assert.strictEqual(catChipResult.isRentActive, true, "Rent chip should be marked active");
    console.log("  ✓ Category preset chip interaction verified.");

    console.log("Test 3: Payment method and payment status chips...");
    const payChipsResult = await window.webContents.executeJavaScript(`(() => {
      const upiChip = document.querySelector('#expensePaymentMethodChips .expense-chip[data-method="UPI"]');
      upiChip.click();
      const paySelect = document.getElementById("expensePaymentMethodSelect");

      const partialChip = document.querySelector('#expenseStatusChips .status-chip[data-status="partial"]');
      partialChip.click();
      const statusSelect = document.getElementById("expenseStatusSelect");
      const paidContainer = document.getElementById("expensePaidAmountContainer");

      return {
        selectedPaymentMethod: paySelect.value,
        isUpiActive: upiChip.classList.contains("active"),
        selectedStatus: statusSelect.value,
        isPartialActive: partialChip.classList.contains("active"),
        isPaidContainerVisible: !paidContainer.classList.contains("hidden")
      };
    })()`);

    assert.strictEqual(payChipsResult.selectedPaymentMethod, "UPI", "Payment method should be UPI");
    assert.strictEqual(payChipsResult.isUpiActive, true, "UPI chip should be active");
    assert.strictEqual(payChipsResult.selectedStatus, "partial", "Status should be partial");
    assert.strictEqual(payChipsResult.isPartialActive, true, "Partial chip should be active");
    assert.strictEqual(payChipsResult.isPaidContainerVisible, true, "Paid amount container should be visible for partial");
    console.log("  ✓ Payment method and status chips verified.");

    console.log("Test 4: Non-GST amount calculation & live footer...");
    const nonGstCalcResult = await window.webContents.executeJavaScript(`(() => {
      const amountInput = document.getElementById("expenseTaxableValue");
      amountInput.value = "1500";
      amountInput.dispatchEvent(new Event("input", { bubbles: true }));

      const paidInput = document.getElementById("expensePaidInput");
      paidInput.value = "500";
      paidInput.dispatchEvent(new Event("input", { bubbles: true }));

      const footerTotal = document.getElementById("expenseFooterTotal");
      const summaryText = document.getElementById("expenseTaxSummary").innerText;

      return {
        footerTotal: footerTotal.innerText.trim(),
        summaryText
      };
    })()`);

    assert.ok(nonGstCalcResult.footerTotal.includes("1,500"), `Footer total should reflect 1500, got: ${nonGstCalcResult.footerTotal}`);
    assert.ok(nonGstCalcResult.summaryText.includes("1,500"), "Tax summary should display 1500 expense amount");
    assert.ok(nonGstCalcResult.summaryText.includes("1,000"), "Tax summary should display 1000 balance due");
    console.log("  ✓ Non-GST calculation and live footer verified.");

    console.log("Test 5: Toggling to GST mode and validating statutory tax breakdown...");
    const gstModeResult = await window.webContents.executeJavaScript(`(() => {
      const gstChip = document.getElementById("expenseModeGst");
      gstChip.click();

      const form = document.getElementById("expenseForm");
      const amountLabel = document.getElementById("expenseAmountLabel");
      const taxRateSelect = document.getElementById("expenseTaxRate");
      const gstinInput = document.getElementById("expensePartyGstin");
      const placeOfSupply = document.getElementById("expensePlaceOfSupply");
      const amountInput = document.getElementById("expenseTaxableValue");

      amountInput.value = "10000";
      taxRateSelect.value = "18";
      amountInput.dispatchEvent(new Event("input", { bubbles: true }));

      const footerTotal = document.getElementById("expenseFooterTotal");
      const summaryText = document.getElementById("expenseTaxSummary").innerText;

      return {
        isGstMode: form.classList.contains("is-gst-mode"),
        amountLabel: amountLabel.innerText.trim(),
        taxRate: taxRateSelect.value,
        footerTotal: footerTotal.innerText.trim(),
        summaryText
      };
    })()`);

    assert.strictEqual(gstModeResult.isGstMode, true, "Form should have .is-gst-mode");
    assert.ok(gstModeResult.amountLabel.includes("Taxable Amount"), "Label should say Taxable Amount in GST mode");
    assert.ok(gstModeResult.footerTotal.includes("11,800"), `Footer total should be 11800 (10000 + 18% GST), got: ${gstModeResult.footerTotal}`);
    assert.ok(gstModeResult.summaryText.includes("CGST"), "Summary should include CGST");
    assert.ok(gstModeResult.summaryText.includes("SGST"), "Summary should include SGST");
    assert.ok(gstModeResult.summaryText.includes("900"), "CGST and SGST should each be 900");
    console.log("  ✓ GST mode toggle & statutory tax calculation verified.");

    console.log("Test 6: Interstate GST calculation (IGST)...");
    const interstateResult = await window.webContents.executeJavaScript(`(() => {
      const posSelect = document.getElementById("expensePlaceOfSupply");
      // Choose Delhi or Maharashtra which is interstate to Karnataka
      posSelect.value = "Maharashtra";
      posSelect.dispatchEvent(new Event("change", { bubbles: true }));

      const summaryText = document.getElementById("expenseTaxSummary").innerText;
      return {
        summaryText,
        hasIgst: summaryText.includes("IGST"),
        hasCgst: summaryText.includes("CGST")
      };
    })()`);

    assert.strictEqual(interstateResult.hasIgst, true, "Should display IGST for interstate expense");
    assert.strictEqual(interstateResult.hasCgst, false, "Should NOT display CGST for interstate expense");
    assert.ok(interstateResult.summaryText.includes("1,800"), "IGST should be 1800 on 10000 at 18%");
    console.log("  ✓ Interstate IGST calculation verified.");

    console.log("Test 7: Submitting GST Expense through modal and verifying in database...");
    const submitResult = await window.webContents.executeJavaScript(`(async () => {
      const form = document.getElementById("expenseForm");
      // Fill vendor GSTIN
      const gstinInput = document.getElementById("expensePartyGstin");
      gstinInput.value = "27AAPFU0939F1ZV";

      // Fill vendor name
      form.elements.vendor.value = "Tata Communications";

      // Set status to full paid
      document.querySelector('#expenseStatusChips .status-chip[data-status="paid"]').click();

      // Submit form
      form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));

      await new Promise(r => setTimeout(r, 400));
      const modalStillOpen = Boolean(document.querySelector(".expense-modal-backdrop"));
      return { modalStillOpen };
    })()`);

    assert.strictEqual(submitResult.modalStillOpen, false, "Modal should close on successful submission");

    const dbState = database.getState();
    const savedExpense = (dbState.transactions || []).find(t => t.type === "expense" && t.party === "Tata Communications");
    assert.ok(savedExpense, "Expense transaction must be saved in database");
    assert.strictEqual(savedExpense.amount, 11800, "Saved amount must be 11,800");
    assert.strictEqual(savedExpense.status, "paid", "Saved status must be paid");
    assert.strictEqual(savedExpense.paymentType, "UPI", "Saved payment method must be UPI");
    const meta = JSON.parse(savedExpense.metaJson || "{}");
    assert.strictEqual(meta.partyGstin, "27AAPFU0939F1ZV", "GSTIN must be preserved in meta");
    assert.strictEqual(meta.taxRate, 18, "Tax rate 18% must be saved in meta");
    console.log("  ✓ Submitting GST expense verified with database persistence.");

    console.log("Test 8: Editing existing expense pre-populates GST mode and fields...");
    const editResult = await window.webContents.executeJavaScript(`(() => {
      const dbExpense = state.transactions.find(t => t.party === "Tata Communications");
      openExpenseModal(dbExpense);

      const form = document.getElementById("expenseForm");
      const title = document.getElementById("expenseModalTitle");
      const saveBtn = document.getElementById("saveExpenseBtn");
      const isGstActive = document.getElementById("expenseModeGst").classList.contains("active");
      const categoryValue = document.getElementById("expenseCategoryInput").value;
      const gstinValue = document.getElementById("expensePartyGstin").value;
      const amountValue = document.getElementById("expenseTaxableValue").value;

      return {
        title: title.innerText.trim(),
        saveBtn: saveBtn.innerText.trim(),
        isGstActive,
        categoryValue,
        gstinValue,
        amountValue
      };
    })()`);

    assert.strictEqual(editResult.title, "Edit Expense", "Title must be Edit Expense");
    assert.strictEqual(editResult.saveBtn, "Update Expense", "Save button must be Update Expense");
    assert.strictEqual(editResult.isGstActive, true, "Should automatically open in GST mode since taxRate > 0");
    assert.strictEqual(editResult.categoryValue, "Office Rent", "Category value must be pre-populated");
    assert.strictEqual(editResult.gstinValue, "27AAPFU0939F1ZV", "GSTIN must be pre-populated");
    assert.strictEqual(Number(editResult.amountValue), 10000, "Taxable amount must be 10000");
    console.log("  ✓ Edit existing expense mode verified.");

    console.log("Test 9: Closing modal via Cancel button...");
    const closeResult = await window.webContents.executeJavaScript(`(() => {
      const cancelBtn = document.querySelector('.expense-modal-footer [data-action="close-expense-modal"]');
      cancelBtn.click();
      return Boolean(document.querySelector(".expense-modal-backdrop"));
    })()`);
    assert.strictEqual(closeResult, false, "Modal backdrop must be removed on cancel");
    console.log("  ✓ Modal close verified.");

    console.log("\nALL 9 EXPENSE MODAL TESTS PASSED SUCCESSFULLY!");
    app.exit(0);
  } catch (err) {
    console.error("Test failed with error:", err);
    if (rendererErrors.length) console.error("Renderer errors:", rendererErrors);
    app.exit(1);
  }
});
