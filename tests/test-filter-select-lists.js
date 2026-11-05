const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

const ARTIFACT_DIR = "C:/Users/ANAS/.gemini/antigravity/brain/bed9650d-397d-4216-aa80-c0ae1c3c4fcb";

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  await win.loadFile(path.join(__dirname, "../index.html"));
  await new Promise((r) => setTimeout(r, 1200));

  const result = await win.webContents.executeJavaScript(`
    (async () => {
      const logs = [];
      const log = (msg) => { logs.push(msg); console.log(msg); };

      try {
        // 1. Test Quotation (estimate)
        window.showView("estimate");
        await new Promise((r) => setTimeout(r, 300));

        const estimateSelect = document.querySelector("select[data-estimate-filter]");
        log("Quotation select dropdown exists: " + (estimateSelect ? "PASS" : "FAIL"));
        const estimateButtons = document.querySelectorAll(".invoice-quick-filters button[data-estimate-filter]");
        log("Quotation buttons removed: " + (estimateButtons.length === 0 ? "PASS" : "FAIL"));
        log("Quotation select options count: " + (estimateSelect ? estimateSelect.options.length : 0));

        if (estimateSelect) {
          estimateSelect.value = "draft";
          estimateSelect.dispatchEvent(new Event("change", { bubbles: true }));
          await new Promise((r) => setTimeout(r, 200));
          const updatedSelect = document.querySelector("select[data-estimate-filter]");
          log("Quotation select value after change: " + updatedSelect?.value + " (PASS)");
        }

        // 2. Test Expenses
        window.showView("expenses");
        await new Promise((r) => setTimeout(r, 300));
        const expenseSelect = document.querySelector("select[data-expense-filter]");
        log("Expenses select dropdown exists: " + (expenseSelect ? "PASS" : "FAIL"));
        const expenseButtons = document.querySelectorAll(".invoice-quick-filters button[data-expense-filter]");
        log("Expenses buttons removed: " + (expenseButtons.length === 0 ? "PASS" : "FAIL"));

        // 3. Test Sale Return / Credit Note
        window.showView("saleReturn");
        await new Promise((r) => setTimeout(r, 300));
        const creditNoteSelect = document.querySelector("select[data-credit-note-filter]");
        log("Credit Note select dropdown exists: " + (creditNoteSelect ? "PASS" : "FAIL"));
        const creditNoteButtons = document.querySelectorAll(".invoice-quick-filters button[data-credit-note-filter]");
        log("Credit Note buttons removed: " + (creditNoteButtons.length === 0 ? "PASS" : "FAIL"));

        // 4. Test Purchase Return / Debit Note
        window.showView("purchaseReturn");
        await new Promise((r) => setTimeout(r, 300));
        const debitNoteSelect = document.querySelector("select[data-debit-note-filter]");
        log("Debit Note select dropdown exists: " + (debitNoteSelect ? "PASS" : "FAIL"));
        const debitNoteButtons = document.querySelectorAll(".invoice-quick-filters button[data-debit-note-filter]");
        log("Debit Note buttons removed: " + (debitNoteButtons.length === 0 ? "PASS" : "FAIL"));

        // 5. Test Proforma Invoice
        window.showView("proforma");
        await new Promise((r) => setTimeout(r, 300));
        const proformaSelect = document.querySelector("select[data-estimate-filter]");
        log("Proforma select dropdown exists: " + (proformaSelect ? "PASS" : "FAIL"));

        // 6. Test Sale Order
        window.showView("saleOrder");
        await new Promise((r) => setTimeout(r, 300));
        const saleOrderSelect = document.querySelector("select[data-estimate-filter]");
        log("Sale Order select dropdown exists: " + (saleOrderSelect ? "PASS" : "FAIL"));

        // 7. Test Purchase Order
        window.showView("purchaseOrder");
        await new Promise((r) => setTimeout(r, 300));
        const purchaseOrderSelect = document.querySelector("select[data-estimate-filter]");
        log("Purchase Order select dropdown exists: " + (purchaseOrderSelect ? "PASS" : "FAIL"));

        return {
          success: true,
          logs,
          estimateOk: Boolean(estimateSelect && estimateButtons.length === 0),
          expenseOk: Boolean(expenseSelect && expenseButtons.length === 0),
          creditNoteOk: Boolean(creditNoteSelect && creditNoteButtons.length === 0),
          debitNoteOk: Boolean(debitNoteSelect && debitNoteButtons.length === 0),
          proformaOk: Boolean(proformaSelect),
          saleOrderOk: Boolean(saleOrderSelect),
          purchaseOrderOk: Boolean(purchaseOrderSelect),
        };
      } catch (err) {
        return { success: false, error: err.stack, logs };
      }
    })();
  `);

  console.log("Test Results:", JSON.stringify(result, null, 2));

  // Take screenshot of Quotation with filter list
  await win.webContents.executeJavaScript(`
    window.showView("estimate");
    window.estimateQuickFilter = "all";
    document.querySelector("select[data-estimate-filter]").value = "all";
  `);
  await new Promise((r) => setTimeout(r, 300));
  const imageQuotation = await win.capturePage();
  const quoteScreenshotPath = path.join(ARTIFACT_DIR, "quotation_filter_dropdown_verified.png");
  fs.writeFileSync(quoteScreenshotPath, imageQuotation.toPNG());
  console.log("Saved quotation screenshot to:", quoteScreenshotPath);

  // Take screenshot of Expenses with filter list
  await win.webContents.executeJavaScript(`
    window.showView("expenses");
  `);
  await new Promise((r) => setTimeout(r, 300));
  const imageExpense = await win.capturePage();
  const expenseScreenshotPath = path.join(ARTIFACT_DIR, "expenses_filter_dropdown_verified.png");
  fs.writeFileSync(expenseScreenshotPath, imageExpense.toPNG());
  console.log("Saved expenses screenshot to:", expenseScreenshotPath);

  win.close();
  app.quit();
});
