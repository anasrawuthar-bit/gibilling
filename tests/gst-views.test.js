const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-billing-gst-views-test-"));
app.setPath("userData", testRoot);

const GST_VIEWS = [
  "gstDashboard",
  "gstr1",
  "gstr3b",
  "hsnSummary",
  "salesTaxSummary",
  "purchaseTaxSummary",
  "itcRegister",
  "outputGst",
  "gstLiability",
  "eInvoice",
  "eWayBill",
  "gstReconciliation",
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

    console.log("Test 1: Verifying GST sidebar is removed and 12 reports are inside Reports...");
    const reportsGst = await window.webContents.executeJavaScript(`(() => {
      const reportsBtn = document.querySelector('.side-nav [data-view="reports"]');
      if (reportsBtn) reportsBtn.click();
      const sidebarGstBtn = document.querySelector('.side-nav [data-view="gst"]');
      const gstGroup = Array.from(document.querySelectorAll('.reports-menu .report-nav-group')).find(g =>
        g.querySelector('p')?.textContent.trim().toLowerCase() === "gst"
      );
      const items = Array.from(gstGroup ? gstGroup.querySelectorAll('button[data-report-view]') : []).map(el => ({
        view: el.getAttribute('data-report-view'),
        text: el.textContent.trim(),
      }));
      return {
        hasSidebarGstBtn: Boolean(sidebarGstBtn),
        hasGstGroup: Boolean(gstGroup),
        itemCount: items.length,
        items,
      };
    })()`);

    assert.equal(reportsGst.hasSidebarGstBtn, false, "Separate GST button must NOT exist in main sidebar");
    assert.equal(reportsGst.hasGstGroup, true, "GST group must exist in Reports Center");
    assert.equal(reportsGst.itemCount, 12, "GST group in Reports must contain exactly 12 items");

    const expectedViews = [
      "gstDashboard",
      "gstr1",
      "gstr3b",
      "hsnSummary",
      "salesTaxSummary",
      "purchaseTaxSummary",
      "itcRegister",
      "outputGst",
      "gstLiability",
      "gstReconciliation",
      "eInvoice",
      "eWayBill",
    ];

    expectedViews.forEach(v => {
      const match = reportsGst.items.find(i => i.view === v);
      assert.ok(match, `Expected Reports Center GST item with data-report-view="${v}"`);
    });
    console.log("Reports Center GST items verified:", reportsGst.items.map(i => i.text.split("\n")[0]));

    console.log("Test 2: Verifying navigation to all 12 GST views in Reports Center...");
    for (const view of GST_VIEWS) {
      const result = await window.webContents.executeJavaScript(`(() => {
        const navBtn = document.querySelector('.reports-menu [data-report-view="${view}"]');
        if (navBtn) navBtn.click();
        const reportMain = document.querySelector('.reports-layout .report-main');
        const activeNav = document.querySelector('.reports-menu [data-report-view="${view}"]');
        return {
          view: "${view}",
          hasBtn: Boolean(navBtn),
          hasContent: Boolean(reportMain && reportMain.innerHTML.length > 100),
          isSubmenuActive: activeNav ? activeNav.classList.contains("active") : false,
        };
      })()`);

      assert.equal(result.hasBtn, true, `Reports button for ${view} must exist`);
      assert.equal(result.hasContent, true, `View ${view} should render full report content in .report-main`);
      assert.equal(result.isSubmenuActive, true, `View ${view} should be marked active in reports menu`);
      console.log(`  ✓ View ${view} rendered successfully`);
    }

    console.log("Test 3: Verifying GST Dashboard quick-launch hub cards...");
    const hubCards = await window.webContents.executeJavaScript(`(() => {
      const dashBtn = document.querySelector('.reports-menu [data-report-view="gstDashboard"]');
      if (dashBtn) dashBtn.click();
      const cards = Array.from(document.querySelectorAll('.gst-hub-card[data-gst-view]')).map(el => el.getAttribute('data-gst-view'));
      return cards;
    })()`);
    assert.ok(hubCards.length >= 10, `GST Dashboard should contain quick-launch hub cards (found ${hubCards.length})`);
    console.log(`  ✓ Found ${hubCards.length} quick launch cards on GST Dashboard`);

    console.log("Test 4: Verifying click on GST quick-launch card...");
    const clickedNav = await window.webContents.executeJavaScript(`(() => {
      const card = document.querySelector('.gst-hub-card[data-gst-view="gstr3b"]');
      if (card) card.click();
      const currentActive = document.querySelector('.reports-menu [data-report-view="gstr3b"].active');
      const isCardReport = Boolean(document.querySelector('.gstr3b-container') || document.querySelector('.report-main'));
      return Boolean(currentActive && isCardReport);
    })()`);
    assert.equal(clickedNav, true, "Clicking gstr3b quick card should activate gstr3b view in Reports Center");
    console.log("  ✓ Quick-launch navigation works cleanly");

    console.log("Test 5: Verifying zero renderer errors...");
    assert.equal(rendererErrors.length, 0, `Renderer errors found: ${rendererErrors.join("; ")}`);

    console.log("\nALL 12 GST VIEWS AND COMPLIANCE TESTS PASSED 100%!");
    window.destroy();
    app.quit();
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  }
});
