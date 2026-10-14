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

    console.log("Test 1: Verifying GST sidebar menu and 12 sub-items...");
    const sidebarGst = await window.webContents.executeJavaScript(`(() => {
      const btn = document.querySelector('.side-nav [data-view="gst"]');
      const submenu = document.getElementById('gstSubmenu');
      const items = Array.from(submenu ? submenu.querySelectorAll('[data-view]') : []).map(el => ({
        view: el.getAttribute('data-view'),
        text: el.textContent.trim(),
      }));
      return {
        hasButton: Boolean(btn),
        hasSubmenu: Boolean(submenu),
        itemCount: items.length,
        items,
      };
    })()`);

    assert.equal(sidebarGst.hasButton, true, "GST button must exist in sidebar");
    assert.equal(sidebarGst.hasSubmenu, true, "GST submenu must exist");
    assert.equal(sidebarGst.itemCount, 12, "GST submenu must contain exactly 12 items");

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
      "eInvoice",
      "eWayBill",
      "gstReconciliation",
    ];

    expectedViews.forEach(v => {
      const match = sidebarGst.items.find(i => i.view === v);
      assert.ok(match, `Expected submenu item with data-view="${v}"`);
    });
    console.log("GST submenu items verified:", sidebarGst.items.map(i => i.text));

    console.log("Test 2: Verifying navigation to all 12 GST views...");
    for (const view of GST_VIEWS) {
      const result = await window.webContents.executeJavaScript(`(() => {
        const navBtn = document.querySelector('.side-nav [data-view="${view}"]');
        if (navBtn) navBtn.click();
        const gstCenter = document.querySelector('.gst-center-shell');
        const reportMain = document.querySelector('.gst-center-shell .report-main');
        const activeNav = document.querySelector('.side-nav [data-view="${view}"]');
        return {
          view: "${view}",
          hasBtn: Boolean(navBtn),
          hasGstCenter: Boolean(gstCenter),
          hasContent: Boolean(reportMain && reportMain.innerHTML.length > 100),
          isSubmenuActive: activeNav ? activeNav.classList.contains("active") : false,
        };
      })()`);

      assert.equal(result.hasBtn, true, `Submenu button for ${view} must exist`);
      assert.equal(result.hasGstCenter, true, `View ${view} should render .gst-center-shell`);
      assert.equal(result.hasContent, true, `View ${view} should render full report content in .report-main`);
      assert.equal(result.isSubmenuActive, true, `View ${view} should be marked active in sidebar`);
      console.log(`  ✓ View ${view} rendered successfully`);
    }

    console.log("Test 3: Verifying GST Dashboard quick-launch hub cards...");
    const hubCards = await window.webContents.executeJavaScript(`(() => {
      const dashBtn = document.querySelector('.side-nav [data-view="gstDashboard"]');
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
      const currentActive = document.querySelector('.side-nav [data-view="gstr3b"].active');
      const isCardReport = Boolean(document.querySelector('.gstr3b-container') || document.querySelector('.report-main'));
      return Boolean(currentActive && isCardReport);
    })()`);
    assert.equal(clickedNav, true, "Clicking gstr3b quick card should activate gstr3b view");
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
