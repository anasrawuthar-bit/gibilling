const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

async function capture() {
  const window = new BrowserWindow({
    show: true,
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity-ide\\brain\\59e13e0d-d816-4f77-9329-31e8ac922a2b";

  try {
    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 800));

    // Seed state with clean bank account
    await window.webContents.executeJavaScript(`
      (() => {
        state.bankAccounts = [
          {
            id: "bank-demo-1",
            displayName: "anas",
            bankName: "Federal Bank",
            accountNo: "99980865585655",
            ifsc: "FDRL0001412",
            upiId: "ansupi@okaxis",
            openingBalance: 25000,
            currentBalance: 84500,
            asOfDate: "2026-09-24",
            printBankDetails: 1,
            printUpiQr: 1,
            isDefault: 1,
            notes: "Main operational current account"
          }
        ];
        syncDefaultBankSettingsFromState();
        showView("cash");
      })()
    `);
    await new Promise((r) => setTimeout(r, 600));

    // 1. Capture Cash & Bank Page
    const cashImg = await window.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "cash_and_bank_page.png"), cashImg.toPNG());
    console.log("Captured cash_and_bank_page.png");

    // 2. Open Add Bank Account Modal
    const modalRes = await window.webContents.executeJavaScript(`
      (() => {
        try {
          openBankAccountModal();
          const nameInput = document.getElementById("bankDisplayName");
          const bankNameInput = document.getElementById("bankNameInput");
          const accNoInput = document.getElementById("bankAccountNoInput");
          const ifscInput = document.getElementById("bankIfscInput");
          const upiInput = document.getElementById("bankUpiInput");

          if (nameInput) nameInput.value = "HDFC Business Current";
          if (bankNameInput) bankNameInput.value = "HDFC Bank";
          if (accNoInput) accNoInput.value = "50200088991122";
          if (ifscInput) ifscInput.value = "HDFC0001234";
          if (upiInput) upiInput.value = "gibilling@hdfcbank";

          bankNameInput?.dispatchEvent(new Event("input", { bubbles: true }));
          accNoInput?.dispatchEvent(new Event("input", { bubbles: true }));
          ifscInput?.dispatchEvent(new Event("input", { bubbles: true }));
          upiInput?.dispatchEvent(new Event("input", { bubbles: true }));
          return { ok: true, hasModal: Boolean(document.querySelector(".bank-modal-backdrop")) };
        } catch (e) {
          return { ok: false, error: e.stack };
        }
      })()
    `);
    console.log("Modal open result:", modalRes);
    await new Promise((r) => setTimeout(r, 600));

    const modalImg = await window.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "add_bank_account_modal.png"), modalImg.toPNG());
    console.log("Captured add_bank_account_modal.png");

    // 3. Capture Bill Screen Payment Method Dropdown
    await window.webContents.executeJavaScript(`
      (() => {
        closeBankAccountModal();
        openTransactionEditor("sale", { skipDirtyCheck: true });
        const select = document.getElementById("editorPaymentMethod");
        if (select) {
          select.focus();
        }
      })()
    `);
    await new Promise((r) => setTimeout(r, 600));
    const billImg = await window.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "bill_screen_payment_method.png"), billImg.toPNG());
    console.log("Captured bill_screen_payment_method.png");

  } catch (err) {
    console.error("Capture error:", err);
  } finally {
    window.destroy();
    app.quit();
  }
}

app.whenReady().then(capture);
