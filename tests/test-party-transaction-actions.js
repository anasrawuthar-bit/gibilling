const { app, BrowserWindow } = require("electron");
const path = require("path");
const assert = require("assert");
const fs = require("fs");

const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity-ide\\brain\\9dd39af8-a7ad-430b-8ee8-49729ceb732f";

async function runTest() {
  const window = new BrowserWindow({
    show: true,
    width: 1366,
    height: 920,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  try {
    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 1000));

    console.log("Setting up test party and transactions...");
    await window.webContents.executeJavaScript(`
      (() => {
        state.parties = [
          {
            id: 88,
            name: "Precision Tools Corporation",
            phone: "+91 98765 43210",
            email: "orders@precisiontools.com",
            gstin: "27AABCP1234D1Z5",
            balance: 24500,
            type: "customer",
            state: "Maharashtra"
          }
        ];

        state.invoices = [
          {
            id: "inv-pt-101",
            invoiceNo: "INV-2026-881",
            type: "sale",
            party: "Precision Tools Corporation",
            partyId: 88,
            date: "2026-10-18",
            total: 24500,
            balance: 24500,
            status: "unpaid"
          },
          {
            id: "inv-pt-102",
            invoiceNo: "INV-2026-882",
            type: "sale",
            party: "Precision Tools Corporation",
            partyId: 88,
            date: "2026-10-05",
            total: 12000,
            balance: 0,
            status: "paid"
          }
        ];

        partyAdvancedFilter = { balanceType: "all", datePreset: "all", dateFrom: "", dateTo: "" };
        partySearchQuery = "";
        showView("parties");
      })()
    `);
    await new Promise((r) => setTimeout(r, 500));

    console.log("TEST 1: Verifying Party Transactions Table headers...");
    const tableInfo = await window.webContents.executeJavaScript(`
      (() => {
        const table = document.querySelector(".party-transactions-table table");
        if (!table) return null;
        const ths = Array.from(table.querySelectorAll("thead th")).map(th => th.textContent.trim().replace(/[▲▼↕]/g, "").trim());
        const rows = Array.from(table.querySelectorAll("tbody tr"));
        return {
          headers: ths,
          rowCount: rows.length,
        };
      })()
    `);

    console.log("  Headers:", tableInfo.headers);
    assert(tableInfo.headers.includes("Actions"), "Header must include 'Actions' column");
    assert.strictEqual(tableInfo.rowCount, 2, "Must render 2 transaction rows");

    console.log("TEST 2: Verifying 3-dots action menu in party transaction rows...");
    const menuActions = await window.webContents.executeJavaScript(`
      (() => {
        const firstRowDetails = document.querySelector(".party-transactions-table tbody tr details");
        if (!firstRowDetails) return null;
        
        // Open the details dropdown
        firstRowDetails.setAttribute("open", "true");

        const buttons = Array.from(firstRowDetails.querySelectorAll(".invoice-action-menu button"));
        return buttons.map(b => ({
          action: b.dataset.invoiceAction,
          invoiceId: b.dataset.invoiceId,
          label: b.textContent.trim(),
          isDanger: b.classList.contains("danger-action")
        }));
      })()
    `);

    console.log("  Row actions count:", menuActions?.length);
    console.log("  Actions found:", menuActions?.map(a => a.label));

    const expectedLabels = [
      "View/Edit",
      "Delete",
      "Duplicate",
      "Open PDF",
      "Preview",
      "Print",
      "Convert To Return",
      "View History"
    ];

    assert.strictEqual(menuActions.length, 8, "Must contain exactly 8 actions");
    for (let i = 0; i < expectedLabels.length; i++) {
      assert.strictEqual(menuActions[i].label, expectedLabels[i], `Action ${i + 1} must be '${expectedLabels[i]}'`);
    }
    assert.strictEqual(menuActions[0].action, "viewEdit");
    assert.strictEqual(menuActions[1].action, "delete");
    assert.strictEqual(menuActions[1].isDanger, true, "Delete button must have danger-action class");
    assert.strictEqual(menuActions[2].action, "duplicate");
    assert.strictEqual(menuActions[3].action, "openPdf");
    assert.strictEqual(menuActions[4].action, "preview");
    assert.strictEqual(menuActions[5].action, "print");
    assert.strictEqual(menuActions[6].action, "return");
    assert.strictEqual(menuActions[7].action, "history");
    assert.strictEqual(menuActions[0].invoiceId, "inv-pt-101");

    // Scroll panel slightly and capture screenshot
    await window.webContents.executeJavaScript(`
      (() => {
        const panel = document.querySelector(".party-detail-panel");
        if (panel) panel.scrollTop = 120;
      })()
    `);
    await new Promise((r) => setTimeout(r, 300));
    const shot = await window.webContents.capturePage();
    const shotPath = path.join(artifactDir, "party_transaction_actions_verified.png");
    fs.writeFileSync(shotPath, shot.toPNG());
    console.log("  Saved screenshot to:", shotPath);

    console.log("TEST 3: Triggering 'Preview' action from party transaction menu...");
    const previewOpened = await window.webContents.executeJavaScript(`
      (() => {
        const previewBtn = document.querySelector(".party-transactions-table tbody tr [data-invoice-action='preview']");
        if (!previewBtn) return false;
        previewBtn.click();
        const modal = document.querySelector(".invoice-preview-backdrop");
        return Boolean(modal);
      })()
    `);
    await new Promise((r) => setTimeout(r, 400));
    console.log("  Preview modal opened:", previewOpened);
    assert(previewOpened, "Clicking 'Preview' must open invoice preview modal");

    // Close preview modal
    await window.webContents.executeJavaScript(`
      (() => {
        document.querySelector(".preview-modal-close, [data-action='close-preview']")?.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 300));

    console.log("TEST 4: Triggering 'View History' action from party transaction menu...");
    const historyOpened = await window.webContents.executeJavaScript(`
      (() => {
        const details = document.querySelector(".party-transactions-table tbody tr details");
        details?.setAttribute("open", "true");
        const historyBtn = details?.querySelector("[data-invoice-action='history']");
        if (!historyBtn) return false;
        historyBtn.click();
        const modal = document.getElementById("invoiceActionModal");
        return Boolean(modal);
      })()
    `);
    await new Promise((r) => setTimeout(r, 400));
    console.log("  History modal opened:", historyOpened);
    assert(historyOpened, "Clicking 'View History' must open invoice history modal");

    console.log("TEST 5: Verifying Ledger tab also features the action menu for invoice rows...");
    const ledgerActions = await window.webContents.executeJavaScript(`
      (() => {
        // Switch to ledger tab
        const ledgerTabBtn = document.querySelector(".party-tabs button[data-party-tab='ledger']");
        ledgerTabBtn?.click();
        
        const details = document.querySelector(".party-ledger-table tbody tr details");
        return Boolean(details);
      })()
    `);
    await new Promise((r) => setTimeout(r, 400));
    console.log("  Ledger tab actions menu exists:", ledgerActions);
    assert(ledgerActions, "Ledger tab rows linked to invoices must also have action menu");

    console.log("\n===========================================================");
    console.log("  ALL PARTY TRANSACTION OPTIONS TESTS PASSED SUCCESSFULLY! ");
    console.log("===========================================================\n");

  } catch (err) {
    console.error("Test error:", err);
    process.exitCode = 1;
  } finally {
    window.close();
    app.quit();
  }
}

app.whenReady().then(runTest);
