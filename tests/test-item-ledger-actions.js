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

    // Setup test state with an item and stock movements linked to invoices
    console.log("Setting up item with stock movements...");
    await window.webContents.executeJavaScript(`
      (() => {
        state.items = [
          { id: 501, name: "Premium Stainless Steel Flange", sku: "FLG-SS-01", currentStock: 45, purchasePrice: 450, salePrice: 750, unit: "PCS", itemType: "product" }
        ];

        state.invoices = [
          { id: "inv-sale-1", invoiceNo: "INV-2026-001", type: "sale", party: "Apex Engineering", date: "2026-10-18", total: 7500, balance: 7500 },
          { id: "inv-pur-1", invoiceNo: "PUR-2026-001", type: "purchase", party: "Steel Works Ltd", date: "2026-10-10", total: 45000, balance: 0 }
        ];

        state.stockMovements = [
          { id: 101, itemId: 501, movementType: "out", quantity: 10, rate: 750, movementDate: "2026-10-18", invoiceId: "inv-sale-1" },
          { id: 102, itemId: 501, movementType: "in", quantity: 55, rate: 450, movementDate: "2026-10-10", invoiceId: "inv-pur-1" }
        ];

        showView("items");
      })()
    `);
    await new Promise((r) => setTimeout(r, 500));

    console.log("TEST 1: Verifying Item Stock Ledger Table headers & columns...");
    const tableInfo = await window.webContents.executeJavaScript(`
      (() => {
        const table = document.querySelector(".item-stock-ledger-table table");
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
    assert.strictEqual(tableInfo.rowCount, 2, "Must render 2 movement rows");

    console.log("TEST 2: Verifying 3-dots action menu in stock ledger rows...");
    const menuActions = await window.webContents.executeJavaScript(`
      (() => {
        const firstRowDetails = document.querySelector(".item-stock-ledger-table tbody tr details");
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
    assert.strictEqual(menuActions[0].invoiceId, "inv-sale-1");

    // Scroll panel slightly so the full dropdown is beautifully visible in the viewport
    await window.webContents.executeJavaScript(`
      (() => {
        const panel = document.querySelector(".item-detail-panel");
        if (panel) panel.scrollTop = 120;
      })()
    `);
    await new Promise((r) => setTimeout(r, 300));
    const shot = await window.webContents.capturePage();
    const shotPath = path.join(artifactDir, "item_ledger_actions_verified.png");
    fs.writeFileSync(shotPath, shot.toPNG());
    console.log("  Saved screenshot to:", shotPath);

    console.log("TEST 3: Triggering 'Preview' action from item stock ledger menu...");
    const previewOpened = await window.webContents.executeJavaScript(`
      (() => {
        const previewBtn = document.querySelector(".item-stock-ledger-table tbody tr [data-invoice-action='preview']");
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

    console.log("TEST 4: Triggering 'View History' action from item stock ledger menu...");
    const historyOpened = await window.webContents.executeJavaScript(`
      (() => {
        // Reopen details
        const details = document.querySelector(".item-stock-ledger-table tbody tr details");
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

    console.log("\n=======================================================");
    console.log("  ALL ITEM LEDGER OPTIONS TESTS PASSED SUCCESSFULLY!   ");
    console.log("=======================================================\n");

  } catch (err) {
    console.error("Test error:", err);
    process.exitCode = 1;
  } finally {
    window.close();
    app.quit();
  }
}

app.whenReady().then(runTest);
