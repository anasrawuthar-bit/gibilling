const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const screenshotDir = path.join(
  "C:",
  "Users",
  "ANAS",
  ".gemini",
  "antigravity",
  "brain",
  "bed9650d-397d-4216-aa80-c0ae1c3c4fcb"
);

app.whenReady().then(async () => {
  let win = null;
  try {
    win = new BrowserWindow({
      show: false,
      width: 1366,
      height: 768,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: false,
        nodeIntegration: true,
      },
    });

    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 1000));

    // Populate mock data across types
    await win.webContents.executeJavaScript(`
      (() => {
        state.parties = [
          { id: 1, name: "Alpha Traders", phone: "9876543210", balance: 0, state: "Kerala" },
          { id: 2, name: "Beta Suppliers", phone: "9123456789", balance: 0, state: "Kerala" }
        ];

        state.invoices = [
          { id: "inv-1", invoiceNo: "INV-001", type: "sale", party: "Alpha Traders", total: 1000, received: 1000, date: new Date().toISOString() }
        ];

        state.estimates = [
          { id: "est-1", quoteNo: "EST-001", documentType: "estimate", party: "Alpha Traders", total: 2000, date: new Date().toISOString() },
          { id: "prof-1", quoteNo: "PRO-001", documentType: "proforma", party: "Alpha Traders", total: 3000, date: new Date().toISOString() },
          { id: "so-1", quoteNo: "SO-001", documentType: "sale_order", party: "Alpha Traders", total: 4000, date: new Date().toISOString() }
        ];

        state.creditNotes = [
          { id: "cn-1", creditNo: "CRN-001", party: "Alpha Traders", total: 500, balance: 500, date: new Date().toISOString() }
        ];

        state.debitNotes = [
          { id: "dn-1", debitNo: "DBN-001", party: "Beta Suppliers", total: 600, balance: 600, date: new Date().toISOString() }
        ];

        state.payments = [
          { id: "pay-1", type: "payment_in", party: "Alpha Traders", amount: 1000, paymentDate: new Date().toISOString() },
          { id: "pay-2", type: "payment_out", party: "Beta Suppliers", amount: 2000, paymentDate: new Date().toISOString() }
        ];

        state.transactions = [
          { id: "exp-1", type: "expense", vendor: "Office Depot", category: "Supplies", amount: 350, date: new Date().toISOString() }
        ];
      })()
    `);

    const viewsToTest = [
      { view: "sales", name: "Sale Invoices", btnType: "sale" },
      { view: "purchases", name: "Purchase Bills", btnType: "purchase" },
      { view: "estimate", name: "Estimate / Quotation", btnType: "estimate" },
      { view: "proforma", name: "Proforma Invoice", btnType: "proforma" },
      { view: "paymentIn", name: "Payment-In", btnType: "paymentIn" },
      { view: "paymentOut", name: "Payment-Out", btnType: "paymentOut" },
      { view: "saleReturn", name: "Sale Return", btnType: "saleReturn" },
      { view: "purchaseReturn", name: "Purchase Return", btnType: "purchaseReturn" },
      { view: "expenses", name: "Expenses", btnType: "expenses" }
    ];

    console.log("Verifying Date Filter across all views...");

    for (const item of viewsToTest) {
      await win.webContents.executeJavaScript(`showView("${item.view}");`);
      await new Promise((r) => setTimeout(r, 300));

      const filterCheck = await win.webContents.executeJavaScript(`
        (() => {
          const btn = document.querySelector('[data-top-filter-preset-btn="${item.btnType}"]');
          const dropdown = document.querySelector('#presetDropdown_${item.btnType}');
          const options = dropdown ? Array.from(dropdown.querySelectorAll('[data-preset-value]')).map(o => o.dataset.presetValue) : [];
          return {
            hasBtn: Boolean(btn),
            btnText: btn?.textContent?.trim(),
            hasDropdown: Boolean(dropdown),
            optionsCount: options.length,
            hasThisMonth: options.includes("thisMonth"),
            hasCustom: options.includes("custom"),
            hasToday: options.includes("today"),
          };
        })()
      `);

      console.log(`- ${item.name} (${item.view}):`, filterCheck);
      assert(filterCheck.hasBtn, `${item.name} must have date filter preset button`);
      assert(filterCheck.hasDropdown, `${item.name} must have date preset dropdown`);
      assert(filterCheck.hasThisMonth, `${item.name} dropdown must include 'This Month'`);
      assert(filterCheck.hasCustom, `${item.name} dropdown must include 'Custom'`);
      assert(filterCheck.hasToday, `${item.name} dropdown must include 'Today'`);
      console.log(`  ✓ ${item.name} has unified Date Filter with all presets!`);
    }

    // Capture screenshot of Quotation with Date Filter
    await win.webContents.executeJavaScript(`showView("estimate");`);
    await new Promise((r) => setTimeout(r, 400));
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(screenshotDir, "clean_quotation_date_filter.png"), img.toPNG());
    console.log("✓ Saved clean_quotation_date_filter.png");

    // Capture screenshot of Payment-In with Date Filter
    await win.webContents.executeJavaScript(`showView("paymentIn");`);
    await new Promise((r) => setTimeout(r, 400));
    const imgPayIn = await win.webContents.capturePage();
    fs.writeFileSync(path.join(screenshotDir, "clean_payment_in_date_filter.png"), imgPayIn.toPNG());
    console.log("✓ Saved clean_payment_in_date_filter.png");

    // Capture screenshot of Sale Return with Date Filter
    await win.webContents.executeJavaScript(`showView("saleReturn");`);
    await new Promise((r) => setTimeout(r, 400));
    const imgSR = await win.webContents.capturePage();
    fs.writeFileSync(path.join(screenshotDir, "clean_sale_return_date_filter.png"), imgSR.toPNG());
    console.log("✓ Saved clean_sale_return_date_filter.png");

    console.log("\nALL 9 VIEWS SUCCESSFULLY VERIFIED WITH DATE FILTER!");
    win.destroy();
    app.quit();
    process.exit(0);
  } catch (err) {
    console.error("Test failed:", err);
    if (win) win.destroy();
    app.quit();
    process.exit(1);
  }
});
