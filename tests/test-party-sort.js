const { app, BrowserWindow } = require("electron");
const path = require("path");
const assert = require("assert");
const fs = require("fs");

const screenshotDir = path.join(
  "C:",
  "Users",
  "ANAS",
  ".gemini",
  "antigravity",
  "brain",
  "bed9650d-397d-4216-aa80-c0ae1c3c4fcb"
);

async function runSortTests() {
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

    // Setup mock data for party and items
    await window.webContents.executeJavaScript(`
      (() => {
        state.parties = [
          { id: 101, name: "Techii Solutions", phone: "9876543210", balance: 12000, receivable: 12000, payable: 0, openingBalance: 5000, lastActivity: "2026-10-18" }
        ];

        state.invoices = [
          { id: "inv-1", invoiceNo: "INV-001", type: "sale", party: "Techii Solutions", date: "2026-08-10", total: 4000, balance: 4000 },
          { id: "inv-2", invoiceNo: "INV-002", type: "sale", party: "Techii Solutions", date: "2026-10-18", total: 10000, balance: 10000 },
          { id: "inv-3", invoiceNo: "INV-003", type: "sale", party: "Techii Solutions", date: "2026-09-15", total: 6000, balance: 6000 }
        ];

        state.payments = [
          { id: "pmt-1", paymentDate: "2026-08-20", type: "payment_in", method: "Cash", party: "Techii Solutions", amount: 2000, notes: "Early cash" },
          { id: "pmt-2", paymentDate: "2026-10-17", type: "payment_in", method: "UPI", party: "Techii Solutions", amount: 5000, notes: "Recent payment" },
          { id: "pmt-3", paymentDate: "2026-09-25", type: "payment_in", method: "Bank", party: "Techii Solutions", amount: 3000, notes: "Mid payment" }
        ];

        state.items = [
          { id: 201, name: "Wireless Keyboard", sku: "WK-01", stock: 50, purchasePrice: 400, salePrice: 650, minStock: 5 }
        ];

        state.stockMovements = [
          { id: 1, itemId: 201, movementType: "in", quantity: 100, rate: 400, movementDate: "2026-07-01", transactionId: "PO-100" },
          { id: 2, itemId: 201, movementType: "out", quantity: 30, rate: 650, movementDate: "2026-10-18", invoiceId: "inv-2" },
          { id: 3, itemId: 201, movementType: "out", quantity: 20, rate: 650, movementDate: "2026-09-15", invoiceId: "inv-3" }
        ];

        partyAdvancedFilter = { balanceType: "all", datePreset: "all", dateFrom: "", dateTo: "" };
        partySearchQuery = "";
        showView("parties");
      })()
    `);

    await new Promise((r) => setTimeout(r, 400));

    console.log("Test 1: Verify Transactions tab starts with last date on the first line (Date DESC)...");
    const transDates = await window.webContents.executeJavaScript(`
      (() => {
        const rows = Array.from(document.querySelectorAll(".party-transactions-table tbody tr"));
        return rows.map(r => r.cells[0]?.textContent.trim());
      })()
    `);
    console.log("  Transactions rendered dates:", transDates);
    // 2026-10-18 should be row 1, 2026-09-15 row 2, 2026-08-10 row 3
    assert(transDates[0].includes("18") || transDates[0].includes("Oct"), "First row must be most recent date (2026-10-18)");
    assert(transDates[2].includes("10") || transDates[2].includes("Aug"), "Last row must be oldest date (2026-08-10)");

    console.log("Test 2: Verify column headers have sortable-th class and active sort indicator...");
    const activeHeader = await window.webContents.executeJavaScript(`
      (() => {
        const th = document.querySelector(".party-transactions-table th.active-sort");
        return {
          col: th?.dataset.partySortCol,
          text: th?.textContent.trim()
        };
      })()
    `);
    console.log("  Active header:", activeHeader);
    assert.strictEqual(activeHeader.col, "date", "Default active column should be 'date'");
    assert(activeHeader.text.includes("▼"), "Default active icon should be ▼ (descending)");

    console.log("Test 3: Click 'Date' header to toggle from default DESC to ASC...");
    await window.webContents.executeJavaScript(`
      (() => {
        const dateTh = document.querySelector(".party-transactions-table th[data-party-sort-col='date']");
        dateTh.click(); // Date is already active (desc), so clicking it toggles to asc
      })()
    `);
    await new Promise((r) => setTimeout(r, 300));

    const datesAsc = await window.webContents.executeJavaScript(`
      (() => {
        const rows = Array.from(document.querySelectorAll(".party-transactions-table tbody tr"));
        return rows.map(r => r.cells[0]?.textContent.trim());
      })()
    `);
    console.log("  Sorted by Date ASC:", datesAsc);
    assert(datesAsc[0].includes("10") || datesAsc[0].includes("Aug"), "First row in ASC should be oldest date (2026-08-10)");

    console.log("Test 4: Click 'Date' header again to toggle back to DESC...");
    await window.webContents.executeJavaScript(`
      (() => {
        const dateTh = document.querySelector(".party-transactions-table th[data-party-sort-col='date']");
        dateTh.click(); // Should toggle back to desc
      })()
    `);
    await new Promise((r) => setTimeout(r, 300));

    const datesDesc = await window.webContents.executeJavaScript(`
      (() => {
        const rows = Array.from(document.querySelectorAll(".party-transactions-table tbody tr"));
        return rows.map(r => r.cells[0]?.textContent.trim());
      })()
    `);
    console.log("  Sorted by Date DESC again:", datesDesc);
    assert(datesDesc[0].includes("18") || datesDesc[0].includes("Oct"), "First row should be 2026-10-18");

    console.log("Test 4b: Click 'Total' header and verify sorting by Total DESC (default for amounts)...");
    await window.webContents.executeJavaScript(`
      (() => {
        const totalTh = document.querySelector(".party-transactions-table th[data-party-sort-col='total']");
        totalTh.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 300));

    const transTotals = await window.webContents.executeJavaScript(`
      (() => {
        const rows = Array.from(document.querySelectorAll(".party-transactions-table tbody tr"));
        return rows.map(r => r.cells[4]?.textContent.trim());
      })()
    `);
    console.log("  Sorted by Total DESC:", transTotals);
    assert(transTotals[0].includes("10,000") || transTotals[0].includes("10000"), "First row should have 10,000");

    console.log("Test 4c: Click 'Total' header again to toggle to Total ASC...");
    await window.webContents.executeJavaScript(`
      (() => {
        const totalTh = document.querySelector(".party-transactions-table th[data-party-sort-col='total']");
        totalTh.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 300));

    const transTotalsAsc = await window.webContents.executeJavaScript(`
      (() => {
        const rows = Array.from(document.querySelectorAll(".party-transactions-table tbody tr"));
        return rows.map(r => r.cells[4]?.textContent.trim());
      })()
    `);
    console.log("  Sorted by Total ASC:", transTotalsAsc);
    assert(transTotalsAsc[0].includes("4,000") || transTotalsAsc[0].includes("4000"), "First row in ASC should have lowest total (4,000)");

    // Reset back to Date DESC
    await window.webContents.executeJavaScript(`
      (() => {
        const dateTh = document.querySelector(".party-transactions-table th[data-party-sort-col='date']");
        dateTh.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 300));

    // Capture screenshot of Transactions tab
    const img1 = await window.webContents.capturePage();
    fs.writeFileSync(path.join(screenshotDir, "party_transactions_sort_verified.png"), img1.toPNG());
    console.log("  Captured party_transactions_sort_verified.png");

    console.log("Test 5: Switch to 'Ledger' tab and verify Date DESC and historical running balance...");
    await window.webContents.executeJavaScript(`
      (() => {
        const ledgerTabBtn = document.querySelector("[data-party-tab='ledger']");
        ledgerTabBtn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 400));

    const ledgerRows = await window.webContents.executeJavaScript(`
      (() => {
        const rows = Array.from(document.querySelectorAll(".party-ledger-table tbody tr"));
        return rows.map(r => ({
          date: r.cells[0]?.textContent.trim(),
          type: r.cells[1]?.textContent.trim(),
          ref: r.cells[2]?.textContent.trim(),
          debit: r.cells[3]?.textContent.trim(),
          credit: r.cells[4]?.textContent.trim(),
          balance: r.cells[5]?.textContent.trim()
        }));
      })()
    `);
    console.log("  Ledger rows count:", ledgerRows.length);
    console.log("  Ledger row 1:", ledgerRows[0]);
    console.log("  Ledger row last:", ledgerRows[ledgerRows.length - 1]);

    // Row 1 should be the latest date: 2026-10-18 (INV-002)
    assert(ledgerRows[0].date.includes("18") || ledgerRows[0].date.includes("Oct"), "Ledger row 1 must be newest date (2026-10-18)");
    // Row 1 should have running balance after all transactions
    // Initial opening: 5000
    // Chronology:
    // 2026-07/08-10: INV-001 (+4000) -> 9000
    // 2026-08-20: Cash (-2000) -> 7000
    // 2026-09-15: INV-003 (+6000) -> 13000
    // 2026-09-25: Bank (-3000) -> 10000
    // 2026-10-17: UPI (-5000) -> 5000
    // 2026-10-18: INV-002 (+10000) -> 15000
    // So the running balance on 2026-10-18 must be ₹15,000!
    console.log("  Ledger row 1 balance text:", ledgerRows[0].balance);
    assert(ledgerRows[0].balance.includes("15,000") || ledgerRows[0].balance.includes("15000"), "Running balance on newest row must be ₹15,000");

    // Capture screenshot of Ledger tab
    const img2 = await window.webContents.capturePage();
    fs.writeFileSync(path.join(screenshotDir, "party_ledger_sort_verified.png"), img2.toPNG());
    console.log("  Captured party_ledger_sort_verified.png");

    console.log("Test 6: Switch to 'Payments' tab and verify Date DESC default...");
    await window.webContents.executeJavaScript(`
      (() => {
        const paymentsTabBtn = document.querySelector("[data-party-tab='payments']");
        paymentsTabBtn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 400));

    const paymentDates = await window.webContents.executeJavaScript(`
      (() => {
        const rows = Array.from(document.querySelectorAll(".party-payments-table tbody tr"));
        return rows.map(r => r.cells[0]?.textContent.trim());
      })()
    `);
    console.log("  Payments rendered dates:", paymentDates);
    // Row 1 should be 2026-10-17
    assert(paymentDates[0].includes("17") || paymentDates[0].includes("Oct"), "Payments row 1 must be newest date (2026-10-17)");

    // Capture screenshot of Payments tab
    const img3 = await window.webContents.capturePage();
    fs.writeFileSync(path.join(screenshotDir, "party_payments_sort_verified.png"), img3.toPNG());
    console.log("  Captured party_payments_sort_verified.png");

    console.log("Test 7: Switch to 'Items' stock ledger and verify Date DESC default...");
    await window.webContents.executeJavaScript(`
      (() => {
        showView("items");
      })()
    `);
    await new Promise((r) => setTimeout(r, 400));

    const itemDates = await window.webContents.executeJavaScript(`
      (() => {
        const rows = Array.from(document.querySelectorAll(".item-stock-ledger-table tbody tr"));
        return rows.map(r => r.cells[0]?.textContent.trim());
      })()
    `);
    console.log("  Item Stock Ledger dates:", itemDates);
    // Row 1 should be 2026-10-18
    assert(itemDates[0].includes("18") || itemDates[0].includes("Oct"), "Item Stock Ledger row 1 must be newest date (2026-10-18)");

    const img4 = await window.webContents.capturePage();
    fs.writeFileSync(path.join(screenshotDir, "item_stock_ledger_sort_verified.png"), img4.toPNG());
    console.log("  Captured item_stock_ledger_sort_verified.png");

    console.log("\n=================================================");
    console.log("  ALL PARTY & ITEM SORT TESTS PASSED 100%!       ");
    console.log("=================================================\n");

  } catch (err) {
    console.error("Test failed:", err);
    process.exitCode = 1;
  } finally {
    window.close();
    app.quit();
  }
}

app.whenReady().then(runSortTests);
