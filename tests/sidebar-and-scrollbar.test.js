const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-billing-sidebar-test-"));
app.setPath("userData", testRoot);

app.whenReady().then(async () => {
  const rendererErrors = [];

  try {
    await database.initDatabase(testRoot);
    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));

    const window = new BrowserWindow({
      width: 1366,
      height: 768,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    window.webContents.on("console-message", (_event, level, message) => {
      if (level >= 2) rendererErrors.push(message);
    });

    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Test 1: Verify Utilities Submenu items
    console.log("Test 1: Verifying Utilities submenu items...");
    const utilitiesItems = await window.webContents.executeJavaScript(`
      Array.from(document.querySelectorAll("#utilitiesSubmenu .submenu-item")).map(el => ({
        view: el.dataset.view,
        text: el.textContent.trim()
      }))
    `);

    console.log("Utilities items found:", utilitiesItems);
    assert.equal(utilitiesItems.length, 6, "Utilities submenu must have exactly 6 items");

    const expectedItems = [
      { view: "importItems", text: "Import Items" },
      { view: "setupBusiness", text: "Set Up My Business" },
      { view: "barcodeGenerator", text: "Barcode Generator" },
      { view: "importParties", text: "Import Parties" },
      { view: "exportItems", text: "Export Items" },
      { view: "verifyData", text: "Verify My Data" },
    ];
    assert.deepEqual(utilitiesItems, expectedItems, "Utilities submenu must match expected 6 items exactly");

    // Test 2: Verify "Accountant Reports" is NOT in Utilities or submenu
    console.log("Test 2: Verifying Accountant Reports is completely removed from Utilities...");
    const hasAccountantReports = await window.webContents.executeJavaScript(`
      Array.from(document.querySelectorAll("#utilitiesSubmenu *")).some(el =>
        (el.textContent && el.textContent.includes("Accountant Reports")) ||
        el.dataset.view === "accountantAccess" ||
        (el.dataset.view === "reports" && el.closest("#utilitiesSubmenu"))
      )
    `);
    assert.equal(hasAccountantReports, false, "Accountant Reports must NOT exist in utilities submenu");

    // Test 3: Verify main "Reports" menu exists and functions
    console.log("Test 3: Verifying main Reports menu functions...");
    const mainReports = await window.webContents.executeJavaScript(`(() => {
      const btn = document.querySelector('.side-nav .nav-item[data-view="reports"]');
      if (!btn) return { exists: false };
      btn.click();
      return {
        exists: true,
        text: btn.textContent.trim(),
        currentView: currentView,
        featureViewVisible: !document.getElementById("featureView").classList.contains("hidden"),
        activeButtonView: document.querySelector('.side-nav .nav-item.active')?.dataset.view
      };
    })()`);
    assert.ok(mainReports.exists, "Main Reports nav button must exist");
    assert.equal(mainReports.currentView, "reports", "currentView must be 'reports' after clicking Reports");
    assert.equal(mainReports.activeButtonView, "reports", "Reports nav item must have active class");
    assert.equal(mainReports.featureViewVisible, true, "FeatureView must be visible for Reports");

    // Test 4: Expand and collapse Utilities
    console.log("Test 4: Verifying Utilities expand/collapse behavior...");
    const utilitiesExpand = await window.webContents.executeJavaScript(`(() => {
      const utilsBtn = document.querySelector('.side-nav .nav-item[data-view="settings"]');
      utilsBtn.click();
      const submenu = document.getElementById("utilitiesSubmenu");
      const openAfterClick = !submenu.classList.contains("hidden");
      utilsBtn.click();
      const closedAfterSecondClick = submenu.classList.contains("hidden");
      utilsBtn.click(); // re-open for layout check
      return { openAfterClick, closedAfterSecondClick, currentlyOpen: !submenu.classList.contains("hidden") };
    })()`);
    assert.equal(utilitiesExpand.openAfterClick, true, "Utilities submenu should open when clicked");
    assert.equal(utilitiesExpand.closedAfterSecondClick, true, "Utilities submenu should collapse on second click");
    assert.equal(utilitiesExpand.currentlyOpen, true, "Utilities submenu should be open after re-clicking");

    // Test 5: Verify sidebar structure and layout constraints
    console.log("Test 5: Verifying sidebar structure and layout...");
    const sidebarMetrics = await window.webContents.executeJavaScript(`(() => {
      const sidebar = document.querySelector(".sidebar");
      const search = document.querySelector(".quick-search-wrap");
      const sideNav = document.querySelector(".side-nav");
      const companySwitch = document.querySelector(".company-switch");
      const sidebarStyle = window.getComputedStyle(sidebar);
      const sideNavStyle = window.getComputedStyle(sideNav);

      return {
        sidebarOverflow: sidebarStyle.overflow,
        sideNavOverflowY: sideNavStyle.overflowY,
        sideNavOverflowX: sideNavStyle.overflowX,
        sideNavScrollbarGutter: sideNavStyle.scrollbarGutter,
        hasHorizontalScroll: sideNav.scrollWidth > sideNav.clientWidth,
        searchFlexShrink: window.getComputedStyle(search).flexShrink,
        companySwitchFlexShrink: window.getComputedStyle(companySwitch).flexShrink,
        companySwitchVisible: companySwitch.offsetHeight > 0,
      };
    })()`);
    assert.equal(sidebarMetrics.sidebarOverflow, "hidden", "Sidebar must have overflow: hidden");
    assert.equal(sidebarMetrics.sideNavOverflowY, "auto", "SideNav must have overflow-y: auto");
    assert.equal(sidebarMetrics.sideNavOverflowX, "hidden", "SideNav must have overflow-x: hidden");
    assert.equal(sidebarMetrics.hasHorizontalScroll, false, "SideNav must not have horizontal scroll");
    assert.equal(sidebarMetrics.companySwitchVisible, true, "Company switch must be visible");

    // Test 6: Test responsive window resolutions
    console.log("Test 6: Testing responsive resolutions...");
    const resolutions = [
      { width: 1280, height: 720 },
      { width: 1366, height: 768 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
      { width: 1040, height: 680 },
    ];

    for (const res of resolutions) {
      window.setSize(res.width, res.height);
      await new Promise((resolve) => setTimeout(resolve, 150));

      const resMetrics = await window.webContents.executeJavaScript(`(() => {
        const sidebar = document.querySelector(".sidebar");
        const sideNav = document.querySelector(".side-nav");
        const companySwitch = document.querySelector(".company-switch");
        const search = document.querySelector(".quick-search-wrap");

        // Test scrolling down in sideNav
        sideNav.scrollTop = 50;
        const scrolled = sideNav.scrollTop;
        sideNav.scrollTop = 0;

        return {
          windowHeight: window.innerHeight,
          sidebarHeight: sidebar.clientHeight,
          sideNavScrollWidth: sideNav.scrollWidth,
          sideNavClientWidth: sideNav.clientWidth,
          hasHorizontalScroll: sideNav.scrollWidth > sideNav.clientWidth,
          doubleVerticalScroll: sidebar.scrollHeight > sidebar.clientHeight,
          companySwitchBottom: companySwitch.getBoundingClientRect().bottom <= window.innerHeight,
          searchTop: search.getBoundingClientRect().top >= 0,
        };
      })()`);

      console.log(`Resolution ${res.width}x${res.height}:`, resMetrics);
      assert.equal(resMetrics.hasHorizontalScroll, false, `No horizontal scroll at ${res.width}x${res.height}`);
      assert.equal(resMetrics.doubleVerticalScroll, false, `No double vertical scroll at ${res.width}x${res.height}`);
      assert.equal(resMetrics.companySwitchBottom, true, `Footer must be within viewport at ${res.width}x${res.height}`);
      assert.equal(resMetrics.searchTop, true, `Search must be at or below top at ${res.width}x${res.height}`);
    }

    // Test 7: Verify zero console errors
    console.log("Test 7: Verifying renderer console errors...");
    assert.deepEqual(rendererErrors, [], "There should be zero console errors during operations");

    console.log("\nALL SIDEBAR AND SCROLLBAR TESTS PASSED SUCCESSFULLY!\n");
    window.close();
    app.quit();
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  } finally {
    try {
      fs.rmSync(testRoot, { recursive: true, force: true });
    } catch {
      // ignore temp dir locks on windows
    }
  }
});
