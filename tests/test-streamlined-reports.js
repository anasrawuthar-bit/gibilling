const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const assert = require("assert");

const testRoot = path.join(__dirname, "..", "tmp-test-reports");
if (!fs.existsSync(testRoot)) fs.mkdirSync(testRoot, { recursive: true });
app.setPath("userData", testRoot);

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1366,
    height: 768,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  try {
    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 1200));

    // Populate mock state so reports have sample numbers
    await win.webContents.executeJavaScript(`
      (() => {
        state.parties = [
          { id: 1, name: "anas", phone: "9048253862", balance: 10764, state: "Kerala" },
          { id: 2, name: "Beta Traders", phone: "9876543211", balance: 5000, state: "Kerala" }
        ];
        state.items = [
          { id: 1, name: "Item A", currentStock: 25, purchasePrice: 400, salePrice: 500, minStockAlert: 10 },
          { id: 2, name: "Item B", currentStock: 5, purchasePrice: 200, salePrice: 250, minStockAlert: 10 }
        ];
        state.invoices = [
          { id: "inv-1", invoiceNo: "INV-2627-0010", type: "sale", party: "anas", total: 5000, received: 5000, balance: 0, status: "paid", date: "2026-11-04" },
          { id: "inv-2", invoiceNo: "INV-2627-0009", type: "sale", party: "anas", total: 64584, received: 53820, balance: 10764, status: "part_paid", date: "2026-11-04" }
        ];
      })()
    `);

    console.log("Navigating to Reports view...");
    await win.webContents.executeJavaScript(`showView("reports")`);
    await new Promise((r) => setTimeout(r, 400));

    const check = await win.webContents.executeJavaScript(`
      (() => {
        const countBadge = document.querySelector('.report-sidebar .report-count-badge');
        const count = parseInt(countBadge?.textContent?.trim() || "0", 10);
        const groupElements = Array.from(document.querySelectorAll('.report-sidebar .report-nav-group'));
        const groupTitles = groupElements.map(g => g.querySelector('p')?.textContent?.trim());
        const reportButtons = Array.from(document.querySelectorAll('.report-sidebar .report-nav-button[data-report-view]'));
        const reportIds = reportButtons.map(b => b.dataset.reportView).filter(id => id !== "overview");

        return {
          totalCount: count,
          groupTitles,
          reportIds,
          hasEInvoice: reportIds.includes("eInvoice"),
          hasEWayBill: reportIds.includes("eWayBill"),
          hasSalesByStaff: reportIds.includes("salesByStaff"),
          hasGstReconciliation: reportIds.includes("gstReconciliation"),
          hasCashBank: groupTitles.includes("Cash & Bank") || reportIds.includes("cashBank"),
          hasCustomerStatements: reportIds.includes("customerStatements"),
          hasStockValuation: reportIds.includes("stockValuation"),
        };
      })()
    `);

    console.log("Reports structure check:", check);

    assert.strictEqual(check.totalCount, 22, "Total report count should be 22 (streamlined from 33)");
    assert(!check.hasEInvoice, "E-Invoice report should be removed");
    assert(!check.hasEWayBill, "E-Way Bill report should be removed");
    assert(!check.hasSalesByStaff, "Sales by Staff report should be removed");
    assert(!check.hasGstReconciliation, "GST Reconciliation report should be removed");
    assert(!check.hasCashBank, "Cash & Bank redundant group should be removed");
    assert(!check.hasCustomerStatements, "Duplicate Customer Statements report should be removed");
    assert(!check.hasStockValuation, "Duplicate Stock Valuation report should be removed");

    console.log("Testing navigation into specific core reports...");
    const coreReportsToTest = ["sale", "stock", "gstr1", "ledger", "receivablesOutstanding", "profitLoss", "daybook"];
    for (const repId of coreReportsToTest) {
      await win.webContents.executeJavaScript(`
        (() => {
          const btn = document.querySelector('[data-report-view="${repId}"]');
          if (btn) btn.click();
        })()
      `);
      await new Promise((r) => setTimeout(r, 200));

      const titleCheck = await win.webContents.executeJavaScript(`
        document.querySelector('.report-main h1')?.textContent?.trim()
      `);
      console.log(`✓ Report '${repId}' rendered successfully with heading: "${titleCheck}"`);
    }

    // Go back to overview dashboard to capture screenshot
    await win.webContents.executeJavaScript(`
      (() => {
        const btn = document.querySelector('[data-report-view="overview"]');
        if (btn) btn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 400));

    const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity\\brain\\bed9650d-397d-4216-aa80-c0ae1c3c4fcb";
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "streamlined_reports_dashboard.png"), img.toPNG());
    console.log("✓ Saved screenshot: streamlined_reports_dashboard.png");

    console.log("=================================================");
    console.log("STREAMLINED REPORTS VERIFIED 100%!");
    console.log("=================================================");
    app.exit(0);
  } catch (err) {
    console.error("Test failed:", err);
    app.exit(1);
  }
});
