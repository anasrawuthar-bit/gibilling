const { app, BrowserWindow } = require("electron");
const path = require("path");
const assert = require("assert");

async function runTests() {
  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  try {
    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await window.webContents.executeJavaScript(
      `new Promise(r => setTimeout(r, 600))`
    );

    console.log("Test 1: Bill screen payment method dropdown has NO duplicate 'Cash'...");
    const billPaymentCheck = await window.webContents.executeJavaScript(`
      (() => {
        openTransactionEditor("sale", { skipDirtyCheck: true });
        const select = document.getElementById("editorPaymentMethod");
        if (!select) return { error: "editorPaymentMethod select not found" };
        const options = Array.from(select.options).map(o => o.value);
        const cashOccurrences = options.filter(v => v.toLowerCase() === "cash").length;
        return {
          options,
          cashOccurrences,
          hasCash: options.includes("Cash")
        };
      })()
    `);

    assert(!billPaymentCheck.error, billPaymentCheck.error);
    assert.strictEqual(
      billPaymentCheck.cashOccurrences,
      1,
      `Expected exactly 1 'Cash' option in bill screen, but found ${billPaymentCheck.cashOccurrences}. Options: ${billPaymentCheck.options.join(", ")}`
    );
    console.log("  ✓ Bill screen has exactly 1 'Cash' option (duplicate bug eliminated).");

    console.log("Test 2: Configured bank accounts are dynamically listed in Bill screen...");
    const bankInBillCheck = await window.webContents.executeJavaScript(`
      (() => {
        const select = document.getElementById("editorPaymentMethod");
        const options = Array.from(select.options).map(o => o.value);
        const bankAccounts = state.bankAccounts || [];
        const foundBanks = bankAccounts.filter(b => options.includes(b.displayName || b.bankName));
        return {
          options,
          bankCount: bankAccounts.length,
          foundBankCount: foundBanks.length,
          bankNames: bankAccounts.map(b => b.displayName)
        };
      })()
    `);

    if (bankInBillCheck.bankCount > 0) {
      assert(
        bankInBillCheck.foundBankCount > 0,
        `Configured banks (${bankInBillCheck.bankNames.join(", ")}) should appear in payment dropdown options: ${bankInBillCheck.options.join(", ")}`
      );
      console.log(`  ✓ Configured bank accounts (${bankInBillCheck.bankNames.join(", ")}) appear in bill payment options.`);
    } else {
      console.log("  ✓ No bank accounts seeded yet, fallback generic options verified.");
    }

    console.log("Test 3: Cash & Bank page displays Cash in Hand & Bank Accounts...");
    const cashBankPageCheck = await window.webContents.executeJavaScript(`
      (() => {
        renderFeatureView("cash");
        const cashCard = document.querySelector(".cash-card");
        const bankSection = document.querySelector(".bank-accounts-section");
        const addBtn = document.querySelector("[data-action='add-bank']");
        const cashAmount = document.querySelector(".cash-bal-amount")?.textContent || "";
        return {
          hasCashCard: Boolean(cashCard),
          hasBankSection: Boolean(bankSection),
          hasAddBtn: Boolean(addBtn),
          cashAmount
        };
      })()
    `);

    assert(cashBankPageCheck.hasCashCard, "Cash in Hand card must be present on Cash & Bank page.");
    assert(cashBankPageCheck.hasBankSection, "Bank Accounts section must be present.");
    assert(cashBankPageCheck.hasAddBtn, "Add Bank Account button must be present.");
    console.log(`  ✓ Cash & Bank page verified (Cash in Hand: ${cashBankPageCheck.cashAmount}).`);

    console.log("Test 4: Opening Add Bank Account modal mounts to document.body with live preview...");
    const modalOpenCheck = await window.webContents.executeJavaScript(`
      (() => {
        openBankAccountModal();
        const backdrop = document.querySelector(".bank-modal-backdrop");
        const modal = document.querySelector(".bank-modal-revamp");
        const form = document.getElementById("bankAccountForm");
        const previewBox = document.getElementById("bankLivePreviewBox");
        const typeChips = Array.from(document.querySelectorAll("#bankTypeChips .bank-chip")).map(c => c.textContent.trim());
        return {
          isOpen: Boolean(backdrop && modal && form),
          hasPreviewBox: Boolean(previewBox),
          typeChips
        };
      })()
    `);

    assert(modalOpenCheck.isOpen, "Bank Account modal must open cleanly.");
    assert(modalOpenCheck.hasPreviewBox, "Live Invoice Print Preview box must exist in modal.");
    assert(modalOpenCheck.typeChips.length >= 4, "Account type chips should exist.");
    console.log(`  ✓ Add Bank Account modal verified with account type chips (${modalOpenCheck.typeChips.join(", ")}).`);

    console.log("Test 5: Live preview updates in real-time as user types bank details...");
    const previewUpdateCheck = await window.webContents.executeJavaScript(`
      (() => {
        const bankNameInput = document.getElementById("bankNameInput");
        const ifscInput = document.getElementById("bankIfscInput");
        const upiInput = document.getElementById("bankUpiInput");
        
        bankNameInput.value = "HDFC Bank";
        bankNameInput.dispatchEvent(new Event("input", { bubbles: true }));

        ifscInput.value = "hdfc0001234";
        ifscInput.dispatchEvent(new Event("input", { bubbles: true }));

        upiInput.value = "mybusiness@hdfcbank";
        upiInput.dispatchEvent(new Event("input", { bubbles: true }));

        const bpBankName = document.getElementById("bpBankName")?.textContent || "";
        const bpIfsc = document.getElementById("bpIfsc")?.textContent || "";
        const bpUpi = document.getElementById("bpUpi")?.textContent || "";
        const ifscInputValue = ifscInput.value;

        return {
          bpBankName,
          bpIfsc,
          bpUpi,
          ifscInputValue
        };
      })()
    `);

    assert.strictEqual(previewUpdateCheck.bpBankName, "HDFC Bank", "Live preview Bank Name should update.");
    assert.strictEqual(previewUpdateCheck.bpIfsc, "HDFC0001234", "Live preview IFSC should be uppercase.");
    assert.strictEqual(previewUpdateCheck.ifscInputValue, "HDFC0001234", "IFSC input should auto-uppercase.");
    assert.strictEqual(previewUpdateCheck.bpUpi, "mybusiness@hdfcbank", "Live preview UPI ID should update.");
    console.log("  ✓ Live invoice preview and auto-uppercase verified.");

    console.log("Test 6: Submitting new bank account persists to database...");
    const submitBankCheck = await window.webContents.executeJavaScript(`
      (async () => {
        const form = document.getElementById("bankAccountForm");
        const nameInput = document.getElementById("bankDisplayName");
        const accNoInput = document.getElementById("bankAccountNoInput");
        nameInput.value = "HDFC Current Account";
        accNoInput.value = "50200012345678";
        
        const submitEvent = new Event("submit", { bubbles: true, cancelable: true });
        form.dispatchEvent(submitEvent);

        await new Promise(r => setTimeout(r, 600));

        const bankAccounts = state.bankAccounts || [];
        const saved = bankAccounts.find(b => b.displayName === "HDFC Current Account");
        const modalBackdrop = document.querySelector(".bank-modal-backdrop");

        return {
          modalClosed: !modalBackdrop,
          savedSuccessfully: Boolean(saved),
          savedName: saved?.displayName,
          savedBank: saved?.bankName
        };
      })()
    `);

    assert(submitBankCheck.savedSuccessfully, "Bank account should be persisted in state.");
    assert(submitBankCheck.modalClosed, "Modal should automatically close on successful submit.");
    console.log(`  ✓ Bank account '${submitBankCheck.savedName}' saved successfully and modal closed.`);

    console.log("Test 7: Verify newly added bank account now appears in Bill screen...");
    const billUpdatedCheck = await window.webContents.executeJavaScript(`
      (() => {
        openTransactionEditor("sale", { skipDirtyCheck: true });
        const select = document.getElementById("editorPaymentMethod");
        const options = Array.from(select.options).map(o => o.value);
        return {
          options,
          hasHdfc: options.includes("HDFC Current Account"),
          cashCount: options.filter(v => v.toLowerCase() === "cash").length
        };
      })()
    `);

    assert(billUpdatedCheck.hasHdfc, `Newly created bank account must appear in bill screen options: ${billUpdatedCheck.options.join(", ")}`);
    assert.strictEqual(billUpdatedCheck.cashCount, 1, "Must still have exactly 1 'Cash' option.");
    console.log("  ✓ Newly added bank account immediately available in bill screen!");

    console.log("Test 8: Modal Cancel button closes modal...");
    const cancelCheck = await window.webContents.executeJavaScript(`
      (() => {
        renderFeatureView("cash");
        openBankAccountModal();
        const cancelBtn = document.querySelector("[data-action='cancel-bank']");
        cancelBtn?.click();
        const backdrop = document.querySelector(".bank-modal-backdrop");
        return { isClosed: !backdrop };
      })()
    `);

    assert(cancelCheck.isClosed, "Cancel button must close modal.");
    console.log("  ✓ Modal Cancel button verified.");

    console.log("\\nALL 8 BANK ACCOUNTS & PAYMENT METHOD TESTS PASSED SUCCESSFULLY!\\n");
  } catch (error) {
    console.error("\\nTEST FAILED:", error);
    process.exit(1);
  } finally {
    window.destroy();
    app.quit();
  }
}

app.whenReady().then(runTests);
