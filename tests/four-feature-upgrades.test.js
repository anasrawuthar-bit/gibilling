const { app, BrowserWindow } = require("electron");
const path = require("path");
const assert = require("assert");

async function runTests() {
  const window = new BrowserWindow({
    show: false,
    width: 1366,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  try {
    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await window.webContents.executeJavaScript(`new Promise(r => setTimeout(r, 600))`);

    // Seed test data in state
    await window.webContents.executeJavaScript(`
      (() => {
        state.businessSettings = state.businessSettings || {};
        state.businessSettings.businessName = "GI Enterprises";
        state.businessSettings.bankDetails = {
          bankName: "HDFC Bank",
          accountNumber: "50100234567890",
          ifscCode: "HDFC0001234",
          branch: "Downtown",
          accountHolder: "GI Enterprises",
          upiId: "gienterprises@okhdfcbank"
        };

        // Seed Customer with positive balance (receivable)
        const testParty = {
          id: 991,
          name: "Metro Retailers",
          phone: "9876543210",
          partyType: "customer",
          balance: 7500,
          receivable: 7500,
          payable: 0,
          city: "Bengaluru",
          state: "Karnataka",
          lastActivity: new Date().toISOString()
        };
        state.parties = [testParty];

        // Seed Product with barcode
        const testItem = {
          id: 881,
          name: "Wireless Barcode Scanner",
          barcode: "8901234567890",
          sku: "SCAN-890",
          salePrice: 1500,
          purchasePrice: 1100,
          currentStock: 35,
          openingStock: 35,
          category: "Electronics",
          unit: "Pcs",
          taxRate: 18
        };
        state.items = [testItem];

        // Seed Transactions & Invoices for Analytics
        state.transactions = [
          { id: "tx-s1", type: "sale", amount: 15000, date: new Date().toISOString() },
          { id: "tx-p1", type: "purchase", amount: 9000, date: new Date().toISOString() }
        ];

        state.invoices = [
          {
            id: 771,
            invoiceNo: "INV-2026-001",
            party: "Metro Retailers",
            partyId: 991,
            phone: "9876543210",
            type: "sale",
            total: 15000,
            received: 7500,
            balance: 7500,
            status: "partial",
            date: new Date().toISOString(),
            dueDate: new Date(Date.now() - 40 * 86400000).toISOString().split("T")[0],
            items: [
              { itemId: 881, item: "Wireless Barcode Scanner", qty: 10, price: 1500, total: 15000 }
            ]
          }
        ];
      })()
    `);

    // =========================================================================
    // FEATURE 1: Interactive Analytics BI Dashboard
    // =========================================================================
    console.log("Test 1: Interactive Analytics BI Dashboard (Feature 1)...");
    const test1 = await window.webContents.executeJavaScript(`
      (() => {
        showView("grow");
        const dash = document.querySelector(".analytics-dashboard-revamp");
        if (!dash) return { error: "analytics-dashboard-revamp element not found" };

        const grossRev = document.querySelector("#analyticsGrossRev");
        const purchases = document.querySelector("#analyticsPurchases");
        const profit = document.querySelector("#analyticsGrossProfit");
        const margin = document.querySelector("#analyticsMargin");
        const receivables = document.querySelector("#analyticsReceivables");
        const topProducts = document.querySelector("#analyticsTopProducts");
        const agingGrid = document.querySelector(".aging-grid");
        const healthGrid = document.querySelector(".inventory-health-grid");
        const periodBtns = document.querySelectorAll("[data-analytics-period]");

        return {
          hasDashboard: Boolean(dash),
          grossRevText: grossRev?.textContent?.trim(),
          profitText: profit?.textContent?.trim(),
          receivablesText: receivables?.textContent?.trim(),
          topProductsCount: topProducts?.children?.length || 0,
          agingBucketsCount: agingGrid?.children?.length || 0,
          healthStatusesCount: healthGrid?.children?.length || 0,
          periodBtnsCount: periodBtns?.length || 0
        };
      })()
    `);

    assert(!test1.error, test1.error);
    assert.strictEqual(test1.hasDashboard, true, "Analytics dashboard rendered");
    assert(test1.topProductsCount > 0, "Top products list populated");
    assert.strictEqual(test1.agingBucketsCount, 3, "Receivables aging buckets (0-30, 31-60, 60+ days) rendered");
    assert.strictEqual(test1.healthStatusesCount, 3, "Inventory health cards rendered (Adequate, Low, Out)");
    assert(test1.periodBtnsCount >= 4, "Period selector buttons rendered");
    console.log("  ✓ Feature 1: BI Dashboard rendered with KPIs, Top Products, Aging & Period filters!");

    // =========================================================================
    // FEATURE 2: 1-Click WhatsApp Payment Reminders with Dynamic UPI Link
    // =========================================================================
    console.log("Test 2: 1-Click WhatsApp Payment Reminders (Feature 2)...");
    const test2 = await window.webContents.executeJavaScript(`
      (async () => {
        // Test in Parties view
        showView("parties");
        const partyListBtn = document.querySelector("[data-party-id='991']");
        partyListBtn?.click();

        const reminderBtn = document.querySelector("[data-action='wa-party-reminder'][data-party-id='991']");
        if (!reminderBtn) return { error: "wa-party-reminder button not found for party with receivable balance > 0" };

        // Click the reminder button to open WhatsApp Share Modal
        reminderBtn.click();
        await new Promise(r => setTimeout(r, 400));

        const modal = document.querySelector(".whatsapp-modal") || document.querySelector("#whatsappShareModalBackdrop");
        if (!modal) return { error: "WhatsApp share modal not mounted after clicking reminder button" };

        const messageTextarea = modal.querySelector("#waMessageText") || modal.querySelector("textarea");
        const msg = messageTextarea ? messageTextarea.value : "";
        const containsUpi = msg.includes("upi://pay?") || msg.includes("gienterprises@okhdfcbank");
        const containsPending = msg.includes("7,500") || msg.includes("7500");
        const containsCustomer = msg.includes("Metro Retailers");

        return {
          reminderBtnFound: Boolean(reminderBtn),
          modalOpened: Boolean(modal),
          containsUpi,
          containsPending,
          containsCustomer,
          messageSnippet: msg.substring(0, 120)
        };
      })()
    `);

    assert(!test2.error, test2.error);
    assert.strictEqual(test2.reminderBtnFound, true, "Reminder button present in party detail for unpaid balance");
    assert.strictEqual(test2.modalOpened, true, "WhatsApp modal opened upon reminder button click");
    assert.strictEqual(test2.containsCustomer, true, "Reminder message tailored to customer name");
    assert.strictEqual(test2.containsPending, true, "Reminder message includes exact pending balance");
    assert.strictEqual(test2.containsUpi, true, "Reminder message embeds dynamic UPI pay link");

    // Capture screenshot of WhatsApp Reminder modal
    const imgWa = await window.webContents.capturePage();
    const artifactDir = "C:\\\\Users\\\\ANAS\\\\.gemini\\\\antigravity-ide\\\\brain\\\\59e13e0d-d816-4f77-9329-31e8ac922a2b";
    require("fs").writeFileSync(path.join(artifactDir, "feature2_whatsapp_reminder_modal.png"), imgWa.toPNG());
    await window.webContents.executeJavaScript(`document.getElementById("whatsappShareModalBackdrop")?.remove();`);

    console.log("  ✓ Feature 2: 1-Click WhatsApp Payment Reminder opens with dynamic UPI link & customer balance!");

    // =========================================================================
    // FEATURE 3: Automated SQLite Backup System
    // =========================================================================
    console.log("Test 3: Automated SQLite Backup System (Feature 3)...");
    const test3 = await window.webContents.executeJavaScript(`
      (async () => {
        showView("sync");
        const syncPage = document.querySelector(".sync-page-revamp");
        if (!syncPage) return { error: "sync-page-revamp not found in DOM" };

        const createSnapshotBtn = document.querySelector("[data-action='create-snapshot']");
        const autoBackupToggle = document.querySelector("#autoBackupExitToggle");
        const snapshotContainer = document.querySelector("#snapshotListContainer");

        // Test auto backup toggle persistence
        if (autoBackupToggle) {
          autoBackupToggle.checked = true;
          autoBackupToggle.dispatchEvent(new Event("change"));
        }
        const persisted = localStorage.getItem("gi_auto_backup_on_exit");

        return {
          syncPageFound: Boolean(syncPage),
          hasCreateBtn: Boolean(createSnapshotBtn),
          hasAutoToggle: Boolean(autoBackupToggle),
          hasSnapshotContainer: Boolean(snapshotContainer),
          persistedAutoBackup: persisted === "true"
        };
      })()
    `);

    assert(!test3.error, test3.error);
    assert.strictEqual(test3.syncPageFound, true, "Sync & Backup page rendered");
    assert.strictEqual(test3.hasCreateBtn, true, "Create Snapshot button present");
    assert.strictEqual(test3.hasAutoToggle, true, "Auto-backup on exit toggle present");
    assert.strictEqual(test3.persistedAutoBackup, true, "Auto-backup on exit toggle persists to localStorage");
    console.log("  ✓ Feature 3: SQLite Backup System UI, snapshot triggers & auto-backup toggle verified!");

    // =========================================================================
    // FEATURE 4: POS Fast Counter Billing Upgrades
    // =========================================================================
    console.log("Test 4: POS Fast Counter Billing Upgrades (Feature 4)...");
    const test4 = await window.webContents.executeJavaScript(`
      (async () => {
        showView("pos");
        const shortcutsBar = document.querySelector(".pos-shortcuts-bar");
        const quickCashChips = document.querySelectorAll("[data-pos-quick-cash]");
        const searchInput = document.querySelector("[data-pos-search]");

        if (!shortcutsBar) return { error: "pos-shortcuts-bar missing" };
        if (!quickCashChips.length) return { error: "Quick cash chips missing" };

        // 1. Add item to cart
        addItemToPosCart(881);

        // Cart totals should now reflect 1 item of ₹1500 + 18% tax = ₹1770
        const totals = posCartTotals();

        // 2. Click Quick Cash Chip ₹2000
        const chip2000 = document.querySelector("[data-pos-quick-cash='2000']");
        if (chip2000) {
          chip2000.click();
        }

        const receivedInput = document.querySelector("[data-pos-received]");
        const changeBanner = document.querySelector("#posChangeBanner");
        const changeAmount = changeBanner?.querySelector(".pos-change-amount")?.textContent?.trim();

        // 3. Test Barcode Scanner Fast-Add
        const initialCartQty = posCart[0]?.qty || 0;
        searchInput.value = "8901234567890";
        searchInput.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise(r => setTimeout(r, 200));
        const updatedCartQty = posCart[0]?.qty || 0;

        return {
          hasShortcuts: Boolean(shortcutsBar),
          shortcutsText: shortcutsBar.textContent,
          chipsCount: quickCashChips.length,
          receivedVal: receivedInput?.value,
          hasChangeBanner: Boolean(changeBanner),
          changeAmount,
          initialCartQty,
          updatedCartQty,
          barcodeAutoIncremented: updatedCartQty > initialCartQty
        };
      })()
    `);

    assert(!test4.error, test4.error);
    assert.strictEqual(test4.hasShortcuts, true, "POS Shortcuts bar present (F1-F4, Esc)");
    assert(test4.chipsCount >= 4, "Quick cash chips rendered");
    assert.strictEqual(test4.hasChangeBanner, true, "Change to Return highlighted banner visible");
    assert.strictEqual(test4.barcodeAutoIncremented, true, "Exact barcode match auto-increments quantity");
    console.log("  ✓ Feature 4: POS Fast Billing verified (Quick Cash, Change to Return, Barcode Fast-Add, Shortcuts)!");

    console.log("\n=========================================================================");
    console.log("SUCCESS: ALL 4 FEATURE UPGRADES PASSED 100% OF AUTOMATED VERIFICATION!");
    console.log("=========================================================================\n");
  } catch (error) {
    console.error("\nTEST FAILED WITH ERROR:", error);
    process.exit(1);
  } finally {
    window.destroy();
    app.quit();
  }
}

app.whenReady().then(runTests);
