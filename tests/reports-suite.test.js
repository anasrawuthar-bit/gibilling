const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-billing-reports-test-"));
app.setPath("userData", testRoot);

const EXPECTED_GROUPS = [
  {
    category: "Sales",
    reports: [
      { id: "sale", title: "Sales Register" },
      { id: "salesByProduct", title: "Sales by Product" },
      { id: "salesByCustomer", title: "Sales by Customer" },
      { id: "salesByStaff", title: "Sales by Staff" },
    ],
  },
  {
    category: "Purchase",
    reports: [
      { id: "purchase", title: "Purchase Register" },
      { id: "purchaseBySupplier", title: "Purchase by Supplier" },
      { id: "purchaseByProduct", title: "Purchase by Product" },
    ],
  },
  {
    category: "Inventory",
    reports: [
      { id: "stock", title: "Stock Summary" },
      { id: "itemLedger", title: "Stock Ledger" },
      { id: "stockValuation", title: "Stock Valuation" },
      { id: "lowStock", title: "Low Stock" },
      { id: "stockMovement", title: "Stock Movement" },
    ],
  },
  {
    category: "Accounting",
    reports: [
      { id: "ledger", title: "Ledger" },
      { id: "trialBalance", title: "Trial Balance" },
      { id: "profitLoss", title: "P&L" },
      { id: "balanceSheet", title: "Balance Sheet" },
    ],
  },
  {
    category: "GST",
    reports: [
      { id: "gstr1", title: "GSTR-1" },
      { id: "gstr3b", title: "GSTR-3B" },
      { id: "hsnSummary", title: "HSN Summary" },
      { id: "gstLiability", title: "Tax Liability" },
    ],
  },
  {
    category: "Receivables",
    reports: [
      { id: "receivablesOutstanding", title: "Outstanding" },
      { id: "receivableAging", title: "Ageing" },
      { id: "customerStatements", title: "Customer Statements" },
    ],
  },
];

app.whenReady().then(async () => {
  const rendererErrors = [];

  try {
    await database.initDatabase(testRoot);
    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));

    const window = new BrowserWindow({
      width: 1400,
      height: 900,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    window.webContents.on("console-message", (_event, level, message) => {
      if (level >= 2) {
        rendererErrors.push(message);
        console.error("Renderer error:", message);
      }
    });

    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((resolve) => setTimeout(resolve, 350));

    console.log("Test 1: Navigate to Reports Center...");
    const opened = await window.webContents.executeJavaScript(`(() => {
      const reportsBtn = document.querySelector('.side-nav [data-view="reports"]');
      if (reportsBtn) reportsBtn.click();
      const sidebarGroups = Array.from(document.querySelectorAll('.reports-menu .report-nav-group')).map(g => ({
        title: g.querySelector('p')?.textContent.trim() || "",
        buttons: Array.from(g.querySelectorAll('button[data-report-view]')).map(b => ({
          id: b.getAttribute('data-report-view'),
          title: b.querySelector('span')?.textContent.trim() || "",
        })),
      }));
      return {
        view: currentView,
        sidebarGroups,
      };
    })()`);

    assert.equal(opened.view, "reports", "currentView should be 'reports'");

    console.log("Test 2: Verifying all 6 sections and all 23 reports exist in menu...");
    let totalVerified = 0;
    for (const expGroup of EXPECTED_GROUPS) {
      const foundGroup = opened.sidebarGroups.find(g => g.title.toLowerCase() === expGroup.category.toLowerCase());
      assert.ok(foundGroup, `Expected report category "${expGroup.category}" in Reports sidebar`);
      console.log(`  ✓ Found category "${expGroup.category}" with ${foundGroup.buttons.length} reports`);

      for (const expReport of expGroup.reports) {
        const foundReport = foundGroup.buttons.find(b => b.id === expReport.id);
        assert.ok(foundReport, `Expected report id "${expReport.id}" under ${expGroup.category}`);
        assert.equal(foundReport.title, expReport.title, `Expected title "${expReport.title}" for id ${expReport.id}`);
        totalVerified++;
      }
    }
    assert.equal(totalVerified, 23, "All 23 reports must be present");
    console.log(`  ✓ Verified all 23 reports across the 6 categories`);

    console.log("Test 3: Testing live rendering of every one of the 23 reports...");
    for (const expGroup of EXPECTED_GROUPS) {
      console.log(`\n--- Testing ${expGroup.category} Category ---`);
      for (const expReport of expGroup.reports) {
        const res = await window.webContents.executeJavaScript(`(() => {
          const btn = document.querySelector('.reports-menu [data-report-view="${expReport.id}"]');
          if (!btn) return { error: "Button not found for ${expReport.id}" };
          btn.click();
          const activeBtn = document.querySelector('.reports-menu [data-report-view="${expReport.id}"].active');
          const header = document.querySelector('.report-page-header h1');
          const kpis = document.querySelectorAll('.report-kpis .kpi-card');
          const content = document.querySelector('.report-content-stack');
          return {
            clicked: Boolean(btn),
            isActive: Boolean(activeBtn),
            title: header ? header.textContent.trim() : "",
            kpiCount: kpis ? kpis.length : 0,
            hasContent: Boolean(content && content.innerHTML.length > 50),
          };
        })()`);

        assert.equal(res.clicked, true, `Button for ${expReport.id} should be clickable`);
        assert.equal(res.isActive, true, `Button for ${expReport.id} should have .active class`);
        assert.equal(res.hasContent, true, `Report ${expReport.id} should render content`);
        console.log(`  ✓ [${expReport.id}] ${res.title} rendered (${res.kpiCount} KPIs)`);
      }
    }

    console.log("\nTest 4: Verifying Report Center Overview Dashboard cards...");
    const overview = await window.webContents.executeJavaScript(`(() => {
      const overviewBtn = document.querySelector('.reports-menu [data-report-view="overview"]');
      if (overviewBtn) overviewBtn.click();
      const groupCards = Array.from(document.querySelectorAll('.report-group-card')).map(card => ({
        title: card.querySelector('h2')?.textContent.trim() || "",
        reportCount: card.querySelectorAll('button[data-report-view]').length,
      }));
      return groupCards;
    })()`);
    assert.ok(overview.length >= 6, `Overview should contain at least 6 category cards (found ${overview.length})`);
    console.log("  ✓ Overview dashboard groups verified:", overview.map(g => `${g.title} (${g.reportCount})`).join(", "));

    console.log("\nTest 5: Verifying zero renderer errors...");
    assert.equal(rendererErrors.length, 0, `Renderer errors found: ${rendererErrors.join("; ")}`);

    console.log("\nALL 23 REPORTS AND 6 CATEGORIES PASSED 100%!");
    window.destroy();
    app.quit();
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  }
});
