const { app, BrowserWindow } = require("electron");
const path = require("path");
const assert = require("assert");
const fs = require("fs");

const testRoot = path.join(__dirname, "..", "tmp-test-sales-filters");
if (!fs.existsSync(testRoot)) fs.mkdirSync(testRoot, { recursive: true });
app.setPath("userData", testRoot);

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      width: 1366,
      height: 820,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 1200));

    console.log("Navigating to Sale Invoices workspace...");
    await win.webContents.executeJavaScript(`
      (() => {
        state.parties = [
          { id: 1, name: "anas", phone: "9048253862", balance: 10764, state: "Kerala" },
          { id: 2, name: "Beta Enterprises", phone: "9876543211", balance: 0, state: "Kerala" }
        ];
        state.invoices = [
          {
            id: "inv-1",
            invoiceNo: "INV-2627-0010",
            type: "sale",
            party: "anas",
            total: 5000,
            received: 5000,
            balance: 0,
            status: "paid",
            date: "2026-11-04"
          },
          {
            id: "inv-2",
            invoiceNo: "INV-2627-0009",
            type: "sale",
            party: "anas",
            total: 64584,
            received: 53820,
            balance: 10764,
            status: "partially_paid",
            date: "2026-11-04"
          },
          {
            id: "inv-3",
            invoiceNo: "INV-2627-0001",
            type: "sale",
            party: "Beta Enterprises",
            total: 12000,
            received: 12000,
            balance: 0,
            status: "paid",
            date: "2026-08-15"
          }
        ];
        showView("sales");
      })()
    `);

    await new Promise((r) => setTimeout(r, 800));

    const check1 = await win.webContents.executeJavaScript(`
      (() => {
        const topBar = document.querySelector('.top-filter-bar[data-top-filter-type="sale"]');
        const presetBtn = document.querySelector('[data-top-filter-preset-btn="sale"]');
        const partySelect = document.querySelector('[data-top-filter-party="sale"]');
        const partyOptions = Array.from(document.querySelectorAll('.sale-workspace select option')).map(o => o.textContent.trim());
        const dateRangeEl = document.querySelector('.top-filter-daterange');
        const displayedRows = Array.from(document.querySelectorAll('.invoice-data-card table tbody tr'));

        return {
          hasTopBar: Boolean(topBar),
          presetText: presetBtn?.textContent?.trim(),
          hasPartySelect: Boolean(partySelect),
          partySelectHtml: partySelect ? partySelect.outerHTML : null,
          hasAllPartiesOption: partyOptions.includes("All Parties"),
          dateRangeText: dateRangeEl?.textContent?.replace(/\\s+/g, " ")?.trim(),
          rowsCount: displayedRows.length,
          invoiceNumbers: displayedRows.map(r => r.querySelector('td:nth-child(2)')?.textContent?.trim()),
          filterPreset: transactionTopFilters.sale.preset
        };
      })()
    `);

    console.log("Initial Sale Invoices filter state:", check1);

    assert(check1.hasTopBar, "Top filter bar must exist");
    assert(check1.presetText.includes("This Month"), `Preset button text should include 'This Month', got: ${check1.presetText}`);
    assert.strictEqual(check1.filterPreset, "thisMonth", "transactionTopFilters.sale.preset must be 'thisMonth'");
    assert(!check1.hasPartySelect, "Sale Invoices must NOT have party select dropdown");
    assert(!check1.hasAllPartiesOption, "Sale Invoices must NOT contain 'All Parties' option");
    assert.strictEqual(check1.rowsCount, 2, "Only the 2 invoices from this month (November 2026) should be displayed initially");
    console.log("✓ TEST 1 PASSED: 'All Parties' dropdown is removed and default filter is 'This Month'!");

    // Capture screenshot of clean Sale Invoices workspace
    const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity\\brain\\bed9650d-397d-4216-aa80-c0ae1c3c4fcb";
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "sales_invoices_default_this_month_no_party.png"), img.toPNG());
    console.log("✓ Saved screenshot: sales_invoices_default_this_month_no_party.png");

    // Test 2: Switch to "All Dates"
    console.log("Testing preset switch to All Dates...");
    await win.webContents.executeJavaScript(`
      (() => {
        const opt = document.querySelector('[data-top-filter-preset="sale"][data-preset-value="all"]');
        if (opt) opt.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 600));

    const check2 = await win.webContents.executeJavaScript(`
      (() => {
        const presetBtn = document.querySelector('[data-top-filter-preset-btn="sale"]');
        const displayedRows = Array.from(document.querySelectorAll('.invoice-data-card table tbody tr'));
        const resetBtn = document.querySelector('[data-top-filter-clear="sale"]');
        return {
          presetText: presetBtn?.textContent?.trim(),
          rowsCount: displayedRows.length,
          hasResetBtn: Boolean(resetBtn),
          resetBtnText: resetBtn?.textContent?.trim()
        };
      })()
    `);
    console.log("After selecting All Dates:", check2);
    assert(check2.presetText.includes("All Dates"), "Preset button should now say All Dates");
    assert.strictEqual(check2.rowsCount, 3, "All 3 invoices should now be displayed");
    assert(check2.hasResetBtn, "Reset button should appear when filter is not at default");
    console.log("✓ TEST 2 PASSED: Switching to All Dates reveals all records and displays Reset button!");

    // Test 3: Click Reset -> returns to This Month
    console.log("Testing Reset button...");
    await win.webContents.executeJavaScript(`
      (() => {
        const resetBtn = document.querySelector('[data-top-filter-clear="sale"]');
        if (resetBtn) resetBtn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 600));

    const check3 = await win.webContents.executeJavaScript(`
      (() => {
        const presetBtn = document.querySelector('[data-top-filter-preset-btn="sale"]');
        const displayedRows = Array.from(document.querySelectorAll('.invoice-data-card table tbody tr'));
        return {
          presetText: presetBtn?.textContent?.trim(),
          rowsCount: displayedRows.length,
          filterPreset: transactionTopFilters.sale.preset
        };
      })()
    `);
    console.log("After clicking Reset:", check3);
    assert(check3.presetText.includes("This Month"), "Preset button should be restored to This Month");
    assert.strictEqual(check3.filterPreset, "thisMonth", "transactionTopFilters.sale.preset should be thisMonth");
    assert.strictEqual(check3.rowsCount, 2, "Rows count should return to 2 (This Month only)");
    console.log("✓ TEST 3 PASSED: Reset button restores default 'This Month'!");

    console.log("\nALL SALES INVOICE FILTER TESTS PASSED 100%!");
    win.destroy();
    app.quit();
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  }
});
