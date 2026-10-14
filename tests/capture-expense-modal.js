const fs = require("fs");
const path = require("path");
const os = require("os");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-expense-capture-"));
app.setPath("userData", testRoot);

const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity-ide\\brain\\59e13e0d-d816-4f77-9329-31e8ac922a2b";

app.whenReady().then(async () => {
  try {
    await database.initDatabase(testRoot);
    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
    ipcMain.handle("db:create-transaction", (_event, txn) => database.createTransaction(txn));
    ipcMain.handle("db:update-transaction", (_event, txn) => database.updateTransaction(txn));

    const window = new BrowserWindow({
      width: 1280,
      height: 800,
      show: true,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Open first company
    await window.webContents.executeJavaScript(`(async () => {
      const btn = document.querySelector('.open-company-button');
      const company = btn?.dataset.company || 'testt';
      if (typeof openCompany === 'function') {
        await openCompany(company);
      } else {
        btn?.click();
      }
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 1200));

    // 1. Open modal in Non-GST mode, select Office Rent, enter 4,500, UPI
    await window.webContents.executeJavaScript(`(() => {
      openExpenseModal();
      const rentChip = document.querySelector('.expense-cat-chip[data-cat="Office Rent"]');
      if (rentChip) rentChip.click();
      const amountInput = document.getElementById("expenseTaxableValue");
      if (amountInput) {
        amountInput.value = "4500";
        amountInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
      const upiChip = document.querySelector('#expensePaymentMethodChips .expense-chip[data-method="UPI"]');
      if (upiChip) upiChip.click();
      const vendorInput = document.querySelector('input[name="vendor"]');
      if (vendorInput) vendorInput.value = "City Property Managers";
      const notesInput = document.querySelector('textarea[name="notes"]');
      if (notesInput) notesInput.value = "Monthly office rent for May 2026. Paid via UPI.";
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Capture Non-GST screenshot
    const imageNonGst = await window.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "expense_nongst_mode.png"), imageNonGst.toPNG());
    console.log("Captured expense_nongst_mode.png");

    // 2. Switch to GST mode, enter Tata Comms, 12,000 at 18%, Interstate (Maharashtra)
    await window.webContents.executeJavaScript(`(() => {
      const gstBtn = document.getElementById("expenseModeGst");
      if (gstBtn) gstBtn.click();
      const catChip = document.querySelector('.expense-cat-chip[data-cat="Internet & Telephone"]');
      if (catChip) catChip.click();
      const amountInput = document.getElementById("expenseTaxableValue");
      if (amountInput) {
        amountInput.value = "12000";
        amountInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
      const gstinInput = document.getElementById("expensePartyGstin");
      if (gstinInput) gstinInput.value = "27AAPFU0939F1ZV";
      const posSelect = document.getElementById("expensePlaceOfSupply");
      if (posSelect) {
        posSelect.value = "Maharashtra";
        posSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const vendorInput = document.querySelector('input[name="vendor"]');
      if (vendorInput) vendorInput.value = "Tata Communications Ltd";
      const bankChip = document.querySelector('#expensePaymentMethodChips .expense-chip[data-method="Bank"]');
      if (bankChip) bankChip.click();
      const notesInput = document.querySelector('textarea[name="notes"]');
      if (notesInput) notesInput.value = "High-speed leased line internet bill. GST input tax credit claimed under GSTR-2B.";
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Capture GST screenshot
    const imageGst = await window.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "expense_gst_mode.png"), imageGst.toPNG());
    console.log("Captured expense_gst_mode.png");

    app.exit(0);
  } catch (err) {
    console.error("Capture failed:", err);
    app.exit(1);
  }
});
