const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-sidebar-toggle-test-"));
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

    // Open first company
    await window.webContents.executeJavaScript(`document.querySelector(".open-company-button").click(); undefined`);
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Test 1: Verify absence of badge counts on Sales and Purchases
    console.log("Test 1: Verifying badge counts on Sales and Purchases are gone...");
    const badges = await window.webContents.executeJavaScript(`({
      hasReceivableBadge: !!document.getElementById("navBadgeReceivable"),
      hasPayableBadge: !!document.getElementById("navBadgePayable"),
      hasLowStockBadge: !!document.getElementById("navBadgeLowStock")
    })`);
    assert.strictEqual(badges.hasReceivableBadge, false, "navBadgeReceivable must not exist");
    assert.strictEqual(badges.hasPayableBadge, false, "navBadgePayable must not exist");
    assert.strictEqual(badges.hasLowStockBadge, true, "navBadgeLowStock must still exist for Items");

    // Test 2: Verify toggle button exists
    console.log("Test 2: Verifying sidebar toggle button exists...");
    const toggleInfo = await window.webContents.executeJavaScript(`(() => {
      const btn = document.getElementById("sidebarToggleBtn");
      return {
        exists: !!btn,
        title: btn?.getAttribute("title"),
        iconHref: btn?.querySelector("use")?.getAttribute("href"),
        isCollapsedInitially: document.body.classList.contains("sidebar-collapsed")
      };
    })()`);
    assert.strictEqual(toggleInfo.exists, true, "Toggle button must exist");
    assert.strictEqual(toggleInfo.isCollapsedInitially, false, "Sidebar should start expanded");
    assert.strictEqual(toggleInfo.iconHref, "#gi-sidebar-collapse", "Initial icon should be collapse");

    // Test 3: Click toggle button to collapse
    console.log("Test 3: Clicking toggle button to collapse sidebar...");
    const collapsedMetrics = await window.webContents.executeJavaScript(`(() => {
      document.getElementById("sidebarToggleBtn").click();
      const sidebar = document.querySelector(".sidebar");
      const toggle = document.getElementById("sidebarToggleBtn");
      const search = document.getElementById("searchInput");
      const searchWrap = document.querySelector(".quick-search-wrap");
      const searchComputed = window.getComputedStyle(search);

      return {
        bodyHasClass: document.body.classList.contains("sidebar-collapsed"),
        appShellHasClass: document.getElementById("appShell").classList.contains("sidebar-collapsed"),
        sidebarWidth: sidebar.getBoundingClientRect().width,
        searchDisplay: searchComputed.display,
        toggleTitle: toggle.getAttribute("title"),
        toggleIcon: toggle.querySelector("use")?.getAttribute("href"),
        savedStorage: localStorage.getItem("gi_sidebar_collapsed")
      };
    })()`);
    console.log("Collapsed metrics:", collapsedMetrics);
    assert.strictEqual(collapsedMetrics.bodyHasClass, true, "body must have sidebar-collapsed class");
    assert.strictEqual(collapsedMetrics.appShellHasClass, true, "appShell must have sidebar-collapsed class");
    assert.strictEqual(collapsedMetrics.sidebarWidth, 60, "sidebar width must be 60px when collapsed");
    assert.strictEqual(collapsedMetrics.searchDisplay, "none", "searchInput must be hidden when collapsed");
    assert.strictEqual(collapsedMetrics.toggleIcon, "#gi-sidebar-expand", "Icon must be expand when collapsed");
    assert.strictEqual(collapsedMetrics.savedStorage, "1", "localStorage must record collapsed state");

    // Test 4: Navigate while collapsed
    console.log("Test 4: Navigating while collapsed...");
    const navResult = await window.webContents.executeJavaScript(`(() => {
      const salesBtn = document.querySelector('.side-nav .nav-item[data-view="sales"]');
      salesBtn.click();
      return {
        currentView: currentView,
        featureViewVisible: !document.getElementById("featureView").classList.contains("hidden")
      };
    })()`);
    assert.strictEqual(navResult.currentView, "sales", "Should navigate to sales view");
    assert.strictEqual(navResult.featureViewVisible, true, "Feature view should be visible");

    // Test 5: Click toggle button again to expand
    console.log("Test 5: Clicking toggle button again to expand sidebar...");
    const expandedMetrics = await window.webContents.executeJavaScript(`(() => {
      document.getElementById("sidebarToggleBtn").click();
      const sidebar = document.querySelector(".sidebar");
      const toggle = document.getElementById("sidebarToggleBtn");
      const search = document.getElementById("searchInput");

      return {
        bodyHasClass: document.body.classList.contains("sidebar-collapsed"),
        sidebarWidth: sidebar.getBoundingClientRect().width,
        searchDisplay: window.getComputedStyle(search).display,
        toggleIcon: toggle.querySelector("use")?.getAttribute("href"),
        savedStorage: localStorage.getItem("gi_sidebar_collapsed")
      };
    })()`);
    console.log("Expanded metrics:", expandedMetrics);
    assert.strictEqual(expandedMetrics.bodyHasClass, false, "body should not have sidebar-collapsed class");
    assert.strictEqual(expandedMetrics.sidebarWidth, 248, "sidebar width must be 248px when expanded");
    assert.notStrictEqual(expandedMetrics.searchDisplay, "none", "searchInput must be visible when expanded");
    assert.strictEqual(expandedMetrics.toggleIcon, "#gi-sidebar-collapse", "Icon must be collapse when expanded");
    assert.strictEqual(expandedMetrics.savedStorage, "0", "localStorage must record expanded state");

    // Test 6: Verify keyboard shortcut Ctrl+B
    console.log("Test 6: Testing Ctrl+B keyboard shortcut...");
    const shortcutResult = await window.webContents.executeJavaScript(`(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true, bubbles: true }));
      const afterCtrlB = document.body.classList.contains("sidebar-collapsed");
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true, bubbles: true }));
      const afterSecondCtrlB = document.body.classList.contains("sidebar-collapsed");
      return { afterCtrlB, afterSecondCtrlB };
    })()`);
    assert.strictEqual(shortcutResult.afterCtrlB, true, "Ctrl+B should collapse sidebar");
    assert.strictEqual(shortcutResult.afterSecondCtrlB, false, "Second Ctrl+B should expand sidebar");

    // Test 7: Zero renderer console errors
    console.log("Test 7: Verifying renderer console errors...");
    assert.deepEqual(rendererErrors, [], "There should be zero console errors");

    console.log("\nALL SIDEBAR TOGGLE & BADGE TESTS PASSED SUCCESSFULLY!\n");
    window.close();
    app.quit();
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  } finally {
    try {
      fs.rmSync(testRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});
