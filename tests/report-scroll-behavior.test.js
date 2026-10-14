const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-report-scroll-"));
app.setPath("userData", testRoot);

app.whenReady().then(async () => {
  let win;
  try {
    await database.initDatabase(testRoot);

    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));

    win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 800,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 600));

    // Open active company
    await win.webContents.executeJavaScript(`
      (async () => {
        const btn = document.querySelector(".open-company-button");
        const companyName = btn?.dataset?.company || "testt";
        await openCompany(companyName);
      })()
    `);
    await new Promise((r) => setTimeout(r, 1000));

    // Seed dummy data so reports have substantial scrollable content
    await win.webContents.executeJavaScript(`
      (() => {
        for (let i = 1; i <= 60; i++) {
          state.items.push({
            id: "scroll-item-" + i,
            name: "Audit Item " + i,
            itemType: "product",
            currentStock: 50 + i,
            salePrice: 200 + i * 2,
            purchasePrice: 150 + i,
            taxRate: 18,
            unit: "Pcs",
            category: "General",
            sku: "SKU-" + i,
            hsnSac: "8471"
          });
          state.invoices.push({
            id: "scroll-inv-" + i,
            invoiceNumber: "INV-SCROLL-" + i,
            partyName: "Customer " + i,
            invoiceDate: "2026-09-15",
            total: 1000 + i * 50,
            balance: 0,
            status: "Paid",
            type: "sale",
            items: [{ name: "Audit Item " + i, quantity: 5, price: 200, total: 1000 }]
          });
        }
      })()
    `);

    // Test 1: Navigate to reports and verify content loads at top (scrollTop: 0)
    console.log("Test 1: Navigate to Reports view and verify initial top scroll...");
    const test1 = await win.webContents.executeJavaScript(`
      (() => {
        showView("reports");
        const stack = document.querySelector(".report-content-stack");
        const menu = document.querySelector(".reports-menu");
        return {
          view: currentView,
          stackScrollTop: stack?.scrollTop || 0,
          menuScrollTop: menu?.scrollTop || 0,
        };
      })()
    `);
    console.log("  Initial reports view state:", test1);
    if (test1.view !== "reports" || test1.stackScrollTop !== 0) {
      throw new Error(`Test 1 Failed: Expected view=reports and stackScrollTop=0, got ${JSON.stringify(test1)}`);
    }
    console.log("  ✓ Test 1 Passed: Reports view starts at top.");

    // Test 2: Scroll report content down, click a side option, verify content automatically scrolls to top
    console.log("Test 2: Scroll report content down, click side option, verify auto-scroll to top...");
    const test2 = await win.webContents.executeJavaScript(`
      (async () => {
        const stack = document.querySelector(".report-content-stack");
        if (stack) stack.scrollTop = 500;
        const scrolledBefore = stack ? stack.scrollTop : 0;

        // Click a side option button, e.g. Stock Summary
        const stockBtn = document.querySelector('[data-report-view="stock"]');
        if (!stockBtn) throw new Error("Stock report button not found");
        stockBtn.click();

        await new Promise((r) => setTimeout(r, 100));

        const newStack = document.querySelector(".report-content-stack");
        const tableCard = document.querySelector(".report-main .data-table-card, .report-main .report-data-card");
        const main = document.querySelector(".report-main");

        return {
          scrolledBefore,
          stackScrollAfter: newStack ? newStack.scrollTop : null,
          tableCardScrollAfter: tableCard ? tableCard.scrollTop : null,
          mainScrollAfter: main ? main.scrollTop : null,
        };
      })()
    `);
    console.log("  Content scroll test result:", test2);
    if (test2.stackScrollAfter !== 0 || (test2.tableCardScrollAfter !== null && test2.tableCardScrollAfter !== 0)) {
      throw new Error(`Test 2 Failed: Report content did not scroll to top: ${JSON.stringify(test2)}`);
    }
    console.log("  ✓ Test 2 Passed: Report content automatically scrolled to top when side option clicked.");

    // Test 3: Scroll the table in Stock Summary, click another side option (Sale report), verify top scroll
    console.log("Test 3: Scroll data table inside report, click another side option, verify top scroll...");
    const test3 = await win.webContents.executeJavaScript(`
      (async () => {
        const tableCard = document.querySelector(".report-main .data-table-card, .report-main .report-data-card");
        if (tableCard) tableCard.scrollTop = 400;

        const saleBtn = document.querySelector('[data-report-view="sale"]');
        if (!saleBtn) throw new Error("Sale report button not found");
        saleBtn.click();

        await new Promise((r) => setTimeout(r, 100));

        const newStack = document.querySelector(".report-content-stack");
        const newTableCard = document.querySelector(".report-main .data-table-card, .report-main .report-data-card");

        return {
          stackScrollAfter: newStack ? newStack.scrollTop : null,
          tableCardScrollAfter: newTableCard ? newTableCard.scrollTop : null,
        };
      })()
    `);
    console.log("  Table card scroll test result:", test3);
    if (test3.stackScrollAfter !== 0 || (test3.tableCardScrollAfter !== null && test3.tableCardScrollAfter !== 0)) {
      throw new Error(`Test 3 Failed: Content did not scroll to top: ${JSON.stringify(test3)}`);
    }
    console.log("  ✓ Test 3 Passed: Content scrolled to top when navigating from table-scrolled report.");

    // Test 4: Scroll sidebar menu down to select an option, verify sidebar preserves scroll and content scrolls to top
    console.log("Test 4: Scroll sidebar menu down, click bottom side option, verify sidebar stays and content scrolls to top...");
    const test4 = await win.webContents.executeJavaScript(`
      (async () => {
        const menu = document.querySelector(".reports-menu");
        if (menu) menu.scrollTop = 600;
        const menuScrollBefore = menu ? menu.scrollTop : 0;

        const cashBankBtn = document.querySelector('[data-report-view="cashBank"]');
        if (!cashBankBtn) throw new Error("Cash & Bank button not found");
        cashBankBtn.click();

        await new Promise((r) => setTimeout(r, 100));

        const newMenu = document.querySelector(".reports-menu");
        const content = document.querySelector(".report-content-stack");

        return {
          menuScrollBefore,
          menuScrollAfter: newMenu ? newMenu.scrollTop : null,
          contentScrollAfter: content ? content.scrollTop : null,
        };
      })()
    `);
    console.log("  Sidebar preservation test result:", test4);
    if (test4.contentScrollAfter !== 0 || test4.menuScrollAfter !== test4.menuScrollBefore) {
      throw new Error(`Test 4 Failed: Expected content=0 and menu preserved, got ${JSON.stringify(test4)}`);
    }
    console.log("  ✓ Test 4 Passed: Sidebar scroll preserved while report content scrolled to top.");

    // Test 5: While scrolled down in a report, click the SAME side option to refresh/scroll to top
    console.log("Test 5: While scrolled down, click current active side option, verify auto-scroll to top...");
    const test5 = await win.webContents.executeJavaScript(`
      (async () => {
        // Go to Overview first
        document.querySelector('[data-report-view="overview"]').click();
        await new Promise((r) => setTimeout(r, 100));

        const stack = document.querySelector(".report-content-stack");
        if (stack) stack.scrollTop = 600;
        const scrollBefore = stack ? stack.scrollTop : 0;

        // Click overview button again
        document.querySelector('[data-report-view="overview"]').click();
        await new Promise((r) => setTimeout(r, 100));

        const stackAfter = document.querySelector(".report-content-stack");
        return {
          scrollBefore,
          scrollAfter: stackAfter ? stackAfter.scrollTop : null,
        };
      })()
    `);
    console.log("  Same option click test result:", test5);
    if (test5.scrollAfter !== 0) {
      throw new Error(`Test 5 Failed: Re-clicking current report did not scroll to top: ${JSON.stringify(test5)}`);
    }
    console.log("  ✓ Test 5 Passed: Re-clicking current report scrolls to top.");

    console.log("\nALL 5 REPORT SCROLL TESTS PASSED SUCCESSFULLY!\n");
  } catch (err) {
    console.error("Test Error:", err);
    process.exit(1);
  } finally {
    if (win) win.close();
    app.quit();
  }
});
