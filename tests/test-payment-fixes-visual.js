const { app, BrowserWindow } = require("electron");
const path = require("path");
const assert = require("assert");
const fs = require("fs");

const brainDir = path.join(
  "C:",
  "Users",
  "ANAS",
  ".gemini",
  "antigravity",
  "brain",
  "bed9650d-397d-4216-aa80-c0ae1c3c4fcb"
);

async function runVisualVerification() {
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

  window.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer]`, message);
  });

  try {
    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 1200));

    // Seed realistic user data
    await window.webContents.executeJavaScript(`
      (() => {
        state.parties = [
          { id: 9, name: "FVs", type: "party", balance: -5310 },
          { id: 7, name: "rafi", type: "party", balance: -680, phone: "9876543210" },
          { id: 6, name: "cust", type: "party", balance: 0 },
          { id: 5, name: "roshan", type: "party", balance: -1180 },
          { id: 3, name: "techii", type: "party", balance: 0 },
          { id: 2, name: "asda", type: "party", balance: 0 }
        ];
        state.invoices = [
          { id: "inv-21", invoiceNo: "INV-2627-0021", type: "sale", party: "Cash (Walk-in)", total: 5310, balance: 5310 },
          { id: "inv-19", invoiceNo: "INV-2627-0019", type: "sale", party: "Cash (Walk-in)", total: 1180, balance: 1180 },
          { id: "inv-13", invoiceNo: "INV-2627-0013", type: "sale", party: "rafi", total: 680, balance: 680 }
        ];
        state.payments = [
          { id: 101, type: "payment_in", party: "Cash (Walk-in)", invoiceNo: "INV-2627-0021", amount: 5310, method: "Cash", notes: "Initial receipt for INV-2627-0021", paymentDate: "2026-11-03" },
          { id: 102, type: "payment_in", party: "Cash (Walk-in)", invoiceNo: "INV-2627-0019", amount: 1180, method: "Cash", notes: "Initial receipt for INV-2627-0019", paymentDate: "2026-11-03" },
          { id: 103, type: "payment_in", party: "rafi", invoiceNo: "INV-2627-0013", amount: 680, method: "Cash", notes: "Receive Payment for INV-2627-0013", paymentDate: "2026-11-02" }
        ];
        showView("paymentIn");
      })()
    `);
    await new Promise((r) => setTimeout(r, 600));

    // Open first row's 3-dots action menu to verify styling
    await window.webContents.executeJavaScript(`
      (() => {
        const details = document.querySelector(".data-table tbody tr .invoice-row-actions details");
        if (details) details.setAttribute("open", "true");
      })()
    `);
    await new Promise((r) => setTimeout(r, 300));

    // Capture screenshot of Payment-In table with uncolored invoice ref and opened 3-dots menu
    const tableImg = await window.webContents.capturePage();
    fs.writeFileSync(path.join(brainDir, "payment_in_table_fixed.png"), tableImg.toPNG());
    console.log("Saved payment_in_table_fixed.png");

    // Open Payment-In modal and inspect step by step
    const modalDebug = await window.webContents.executeJavaScript(`
      (() => {
        openPaymentInModal();
        const toggleBtn = document.getElementById("paymentInPartyToggle");
        const partyInput = document.getElementById("paymentInPartyInput");
        const dd = document.getElementById("paymentInPartyDropdown");
        const step0 = {
          toggleExists: !!toggleBtn,
          inputExists: !!partyInput,
          ddExists: !!dd,
          hiddenInitially: dd.classList.contains("hidden")
        };

        // Click toggle
        let clickErr = null;
        try {
          toggleBtn.click();
        } catch (e) {
          clickErr = e.message;
        }
        const step1 = {
          hiddenAfterClick: dd.classList.contains("hidden"),
          innerHTML: dd.innerHTML,
          clickErr
        };

        // Now test calling renderPartyDropdown directly if possible, or trigger input focus
        let focusErr = null;
        try {
          partyInput.dispatchEvent(new Event("focus"));
        } catch (e) {
          focusErr = e.message;
        }

        const step2 = {
          hiddenAfterFocus: dd.classList.contains("hidden"),
          innerHTMLAfterFocus: dd.innerHTML,
          focusErr
        };

        return { step0, step1, step2 };
      })()
    `);
    console.log("Modal debug results:", modalDebug);

    // Capture screenshot of modal with customer dropdown open
    const modalImg = await window.webContents.capturePage();
    fs.writeFileSync(path.join(brainDir, "payment_in_modal_fixed.png"), modalImg.toPNG());
    console.log("Saved payment_in_modal_fixed.png");

  } finally {
    window.close();
  }
}

app.whenReady().then(async () => {
  try {
    await runVisualVerification();
    app.exit(0);
  } catch (err) {
    console.error("Test failed:", err);
    app.exit(1);
  }
});
