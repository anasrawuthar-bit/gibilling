const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const assert = require("assert");

async function runTest() {
  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity\\brain\\bed9650d-397d-4216-aa80-c0ae1c3c4fcb";

  try {
    console.log("==================================================================");
    console.log("   TESTING DASHBOARD GRAPH WITH SALES & PURCHASES INCLUSION       ");
    console.log("==================================================================");

    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Test 1: Verify DOM elements for Sale and Purchase in Dashboard Chart Panel
    console.log("\n▶ [TEST 1] Verifying DOM elements in chart panel...");
    const elementsCheck = await window.webContents.executeJavaScript(`
      (() => {
        const saleEl = document.getElementById("saleTotal");
        const purchEl = document.getElementById("purchaseTotal");
        const chartEl = document.getElementById("salesChart");
        const periodSelect = document.getElementById("periodSelect");
        const saleLegend = document.querySelector(".chart-legend-dot.legend-sale");
        const purchLegend = document.querySelector(".chart-legend-dot.legend-purchase");

        return {
          hasSaleTotal: Boolean(saleEl),
          hasPurchaseTotal: Boolean(purchEl),
          hasChartCanvas: Boolean(chartEl),
          hasPeriodSelect: Boolean(periodSelect),
          hasSaleLegend: Boolean(saleLegend),
          hasPurchLegend: Boolean(purchLegend),
        };
      })()
    `);

    assert.strictEqual(elementsCheck.hasSaleTotal, true, "saleTotal element must exist");
    assert.strictEqual(elementsCheck.hasPurchaseTotal, true, "purchaseTotal element must exist");
    assert.strictEqual(elementsCheck.hasChartCanvas, true, "salesChart canvas must exist");
    assert.strictEqual(elementsCheck.hasPeriodSelect, true, "periodSelect dropdown must exist");
    assert.strictEqual(elementsCheck.hasSaleLegend, true, "Sale legend dot must exist");
    assert.strictEqual(elementsCheck.hasPurchLegend, true, "Purchase legend dot must exist");
    console.log("  ✓ Chart panel DOM elements & legend indicators verified.");

    // Test 2: Verify dashboardSeries function returns dual data series
    console.log("\n▶ [TEST 2] Verifying dashboardSeries returns sales and purchases data...");
    const seriesCheck = await window.webContents.executeJavaScript(`
      (() => {
        const thisMonth = dashboardSeries("This Month");
        const today = dashboardSeries("Today");
        const thisYear = dashboardSeries("This Year");

        return {
          thisMonth: {
            title: thisMonth.title,
            labelsCount: thisMonth.labels.length,
            hasSales: Array.isArray(thisMonth.salesValues),
            hasPurchases: Array.isArray(thisMonth.purchaseValues),
            salesLen: thisMonth.salesValues.length,
            purchLen: thisMonth.purchaseValues.length,
          },
          today: {
            title: today.title,
            labelsCount: today.labels.length,
            hasSales: Array.isArray(today.salesValues),
            hasPurchases: Array.isArray(today.purchaseValues),
          },
          thisYear: {
            title: thisYear.title,
            labelsCount: thisYear.labels.length,
            hasSales: Array.isArray(thisYear.salesValues),
            hasPurchases: Array.isArray(thisYear.purchaseValues),
          }
        };
      })()
    `);

    assert.ok(seriesCheck.thisMonth.hasSales && seriesCheck.thisMonth.hasPurchases, "This Month must contain sales and purchases");
    assert.strictEqual(seriesCheck.thisMonth.salesLen, seriesCheck.thisMonth.purchLen, "Sales and Purchases array lengths must match");
    assert.ok(seriesCheck.today.hasSales && seriesCheck.today.hasPurchases, "Today must contain sales and purchases");
    assert.ok(seriesCheck.thisYear.hasSales && seriesCheck.thisYear.hasPurchases, "This Year must contain sales and purchases");
    console.log("  ✓ dashboardSeries generates balanced sales and purchases series across all periods.");

    // Test 3: Create sample sale and purchase documents and verify dashboard calculation
    console.log("\n▶ [TEST 3] Creating mock sale and purchase transactions and checking chart totals...");
    const dataCheck = await window.webContents.executeJavaScript(`
      (async () => {
        const todayStr = new Date().toISOString().slice(0, 10);

        // Mock state transactions for testing chart reflection
        state.invoices = [
          {
            id: "inv-mock-sale-1",
            type: "sale",
            invoiceNo: "INV-CHART-001",
            date: todayStr,
            total: 45000,
            status: "paid"
          },
          {
            id: "inv-mock-purch-1",
            type: "purchase",
            invoiceNo: "PUR-CHART-001",
            date: todayStr,
            total: 30000,
            status: "paid"
          }
        ];

        scheduleDashboardChartDraw();

        const saleText = elements.saleTotal.dataset.actualValue || elements.saleTotal.textContent;
        const purchText = elements.purchaseTotal.dataset.actualValue || elements.purchaseTotal.textContent;
        const series = dashboardSeries("This Month");
        const todayDay = new Date().getDate();
        const salesOnToday = series.salesValues[todayDay - 1];
        const purchOnToday = series.purchaseValues[todayDay - 1];

        return {
          saleText,
          purchText,
          salesOnToday,
          purchOnToday,
          maxValue: dashboardChartState.maxValue,
          niceMax: dashboardChartState.niceMax,
        };
      })()
    `);

    assert.strictEqual(dataCheck.salesOnToday, 45000, "Today's sales slot should be 45000");
    assert.strictEqual(dataCheck.purchOnToday, 30000, "Today's purchase slot should be 30000");
    assert.ok(dataCheck.saleText.includes("45,000"), `Sale total should display 45,000, got: ${dataCheck.saleText}`);
    assert.ok(dataCheck.purchText.includes("30,000"), `Purchase total should display 30,000, got: ${dataCheck.purchText}`);
    assert.strictEqual(dataCheck.maxValue, 45000, "Max value should be 45000");
    console.log(`  ✓ Chart state reflects Sale (₹45,000) and Purchase (₹30,000). Max scale: ${dataCheck.niceMax}.`);

    // Test 4: Verify privacy mode masks both Sale and Purchase in chart panel
    console.log("\n▶ [TEST 4] Verifying Privacy Mode masking & hover peek on both Total Sale and Total Purchase...");
    const privacyCheck = await window.webContents.executeJavaScript(`
      (() => {
        window.giSetPrivacyMode(true, false);
        const saleMasked = elements.saleTotal.textContent.trim();
        const purchMasked = elements.purchaseTotal.textContent.trim();

        // Hover peek chart panel
        const chartPanel = document.querySelector("#homeView .chart-panel");
        chartPanel.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
        const salePeek = elements.saleTotal.textContent.trim();
        const purchPeek = elements.purchaseTotal.textContent.trim();

        // Mouse leave
        chartPanel.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
        const saleRemasked = elements.saleTotal.textContent.trim();
        const purchRemasked = elements.purchaseTotal.textContent.trim();

        window.giSetPrivacyMode(false, false);

        return {
          saleMasked,
          purchMasked,
          salePeek,
          purchPeek,
          saleRemasked,
          purchRemasked
        };
      })()
    `);

    assert.strictEqual(privacyCheck.saleMasked, "₹ ••••••", "Sale total must be masked when privacy mode is ON");
    assert.strictEqual(privacyCheck.purchMasked, "₹ ••••••", "Purchase total must be masked when privacy mode is ON");
    assert.ok(privacyCheck.salePeek.includes("45,000"), "Sale total should reveal on hover");
    assert.ok(privacyCheck.purchPeek.includes("30,000"), "Purchase total should reveal on hover");
    assert.strictEqual(privacyCheck.saleRemasked, "₹ ••••••", "Sale total must re-mask on mouse leave");
    assert.strictEqual(privacyCheck.purchRemasked, "₹ ••••••", "Purchase total must re-mask on mouse leave");
    console.log("  ✓ Privacy Mode masking and hover peek verified for both Sale and Purchase!");

    // Test 5: Verify canvas rendering and hover tooltip simulation
    console.log("\n▶ [TEST 5] Testing canvas hover interaction and dual tooltip rendering...");
    const test5Details = await window.webContents.executeJavaScript(`
      (() => {
        const year = new Date().getFullYear();
        const month = String(new Date().getMonth() + 1).padStart(2, "0");

        // Rich trend across the month
        state.invoices = [
          { id: "s1", type: "sale", invoiceNo: "INV-1", date: year + "-" + month + "-04", total: 28000, status: "paid" },
          { id: "p1", type: "purchase", invoiceNo: "PUR-1", date: year + "-" + month + "-05", total: 18000, status: "paid" },
          { id: "s2", type: "sale", invoiceNo: "INV-2", date: year + "-" + month + "-10", total: 42000, status: "paid" },
          { id: "p2", type: "purchase", invoiceNo: "PUR-2", date: year + "-" + month + "-11", total: 35000, status: "paid" },
          { id: "s3", type: "sale", invoiceNo: "INV-3", date: year + "-" + month + "-15", total: 65000, status: "paid" },
          { id: "p3", type: "purchase", invoiceNo: "PUR-3", date: year + "-" + month + "-16", total: 22000, status: "paid" },
          { id: "s4", type: "sale", invoiceNo: "INV-4", date: year + "-" + month + "-18", total: 54000, status: "paid" },
          { id: "p4", type: "purchase", invoiceNo: "PUR-4", date: year + "-" + month + "-18", total: 38000, status: "paid" },
          { id: "s5", type: "sale", invoiceNo: "INV-5", date: year + "-" + month + "-24", total: 32000, status: "paid" },
          { id: "p5", type: "purchase", invoiceNo: "PUR-5", date: year + "-" + month + "-25", total: 45000, status: "paid" },
        ];
        state.transactions = [];

        showView("home");
        renderDashboard();
        scheduleDashboardChartDraw();

        // Complete animation immediately for clean static capture
        if (dashboardChartState.frameId) cancelAnimationFrame(dashboardChartState.frameId);
        dashboardChartState.frameId = 0;
        dashboardChartState.isAnimating = false;
        dashboardChartState.currentSalesValues = [...dashboardChartState.targetSalesValues];
        dashboardChartState.currentPurchaseValues = [...dashboardChartState.targetPurchaseValues];

        // Hover over the 18th
        const canvas = elements.salesChart;
        const rect = canvas.getBoundingClientRect();
        const padLeft = 56;
        const padRight = 28;
        const plotWidth = rect.width - padLeft - padRight;
        const numDays = dashboardChartState.labels.length;
        const day18X = padLeft + (plotWidth / (numDays - 1)) * 17;

        dashboardChartState.mouseX = day18X;
        dashboardChartState.mouseY = rect.height / 2;
        dashboardChartState.isHovered = true;
        dashboardChartState.hoverOpacity = 1;

        renderChartCanvas();
        return {
          maxVal: dashboardChartState.maxValue,
          niceMax: dashboardChartState.niceMax,
          saleTotal: elements.saleTotal.textContent,
          purchTotal: elements.purchaseTotal.textContent,
          targetSalesLen: dashboardChartState.targetSalesValues.length,
          targetSalesSum: dashboardChartState.targetSalesValues.reduce((a, b) => a + b, 0),
          targetPurchSum: dashboardChartState.targetPurchaseValues.reduce((a, b) => a + b, 0),
        };
      })()
    `);
    console.log("  [TEST 5 DETAILS]:", JSON.stringify(test5Details, null, 2));
    await new Promise((r) => setTimeout(r, 300));

    // Capture visual verification screenshot
    if (fs.existsSync(artifactDir)) {
      const img = await window.webContents.capturePage();
      const imgPath = path.join(artifactDir, "dashboard_graph_with_purchase.png");
      fs.writeFileSync(imgPath, img.toPNG());
      console.log(`  ✓ Visual screenshot captured at: ${imgPath}`);
    }

    console.log("\n==================================================================");
    console.log("   ALL DASHBOARD GRAPH WITH PURCHASE TESTS PASSED 100%!           ");
    console.log("==================================================================\n");

  } catch (err) {
    console.error("Test failed:", err);
    process.exitCode = 1;
  } finally {
    window.destroy();
    app.quit();
  }
}

app.whenReady().then(runTest);
