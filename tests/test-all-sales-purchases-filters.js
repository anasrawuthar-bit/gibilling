const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const assert = require("assert");

const testRoot = path.join(__dirname, "..", "tmp-test-all-filters");
if (!fs.existsSync(testRoot)) fs.mkdirSync(testRoot, { recursive: true });
app.setPath("userData", testRoot);

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1366,
    height: 768,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  try {
    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 1200));

    // Populate mock state so tables and dropdowns have data to render
    await win.webContents.executeJavaScript(`
      (() => {
        state.parties = [
          { id: 1, name: "anas", phone: "9048253862", balance: 10764, state: "Kerala" },
          { id: 2, name: "Beta Enterprises", phone: "9876543211", balance: 0, state: "Kerala" }
        ];
        state.invoices = [
          { id: "inv-1", invoiceNo: "INV-2627-0010", type: "sale", party: "anas", total: 5000, received: 5000, balance: 0, status: "paid", date: "2026-11-04" },
          { id: "inv-2", invoiceNo: "INV-2627-0009", type: "sale", party: "anas", total: 64584, received: 53820, balance: 10764, status: "part_paid", date: "2026-11-04" },
          { id: "pur-1", invoiceNo: "PUR-2627-0001", type: "purchase", party: "Beta Enterprises", total: 12000, received: 12000, balance: 0, status: "paid", date: "2026-11-02" }
        ];
      })()
    `);

    const viewsToTest = [
      // Sales views
      { view: "sales", filterType: "sale", name: "Sale Invoices" },
      { view: "estimate", filterType: "estimate", name: "Estimate / Quotation" },
      { view: "proforma", filterType: "proforma", name: "Proforma Invoice" },
      { view: "paymentIn", filterType: "paymentIn", name: "Payment-In" },
      { view: "saleOrder", filterType: "saleOrder", name: "Sale Order" },
      { view: "deliveryChallan", filterType: "deliveryChallan", name: "Delivery Challan" },
      { view: "saleReturn", filterType: "saleReturn", name: "Sale Return / Credit Note" },
      // Purchases views
      { view: "purchases", filterType: "purchase", name: "Purchase Bills" },
      { view: "paymentOut", filterType: "paymentOut", name: "Payment-Out" },
      { view: "expenses", filterType: "expenses", name: "Expenses" },
      { view: "purchaseOrder", filterType: "purchaseOrder", name: "Purchase Order" },
      { view: "purchaseReturn", filterType: "purchaseReturn", name: "Purchase Return / Debit Note" },
    ];

    const results = [];
    const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity\\brain\\bed9650d-397d-4216-aa80-c0ae1c3c4fcb";

    for (const item of viewsToTest) {
      await win.webContents.executeJavaScript(`showView("${item.view}")`);
      await new Promise((r) => setTimeout(r, 250));

      const check = await win.webContents.executeJavaScript(`
        (() => {
          const filterType = "${item.filterType}";
          const partySelect = document.querySelector('[data-top-filter-party]');
          const allPartyOptions = Array.from(document.querySelectorAll('select option'))
            .map(o => o.textContent.trim())
            .filter(t => t.toLowerCase() === 'all parties');
          const presetBtn = document.querySelector('[data-top-filter-preset-btn]');
          const presetText = presetBtn?.textContent?.trim() || "";
          const targetFilter = getTransactionTopFilter(filterType);

          return {
            hasPartySelect: Boolean(partySelect),
            partyOptionsFound: allPartyOptions,
            presetText,
            activePreset: targetFilter ? targetFilter.preset : null,
          };
        })()
      `);

      console.log("Checking " + item.name + " (" + item.view + "):", JSON.stringify(check));
      assert(!check.hasPartySelect, item.name + " should NOT have a party select filter");
      assert.strictEqual(check.partyOptionsFound.length, 0, item.name + " should NOT have 'All Parties' option");
      assert(check.presetText.includes("This Month"), item.name + " date preset button should say 'This Month', got: " + check.presetText);
      assert.strictEqual(check.activePreset, "thisMonth", item.name + " active preset must be 'thisMonth'");

      results.push({ ...item, ...check, passed: true });

      // Save screenshots
      if (["sales", "purchases", "estimate", "paymentIn", "paymentOut", "expenses"].includes(item.view)) {
        const screenshot = await win.webContents.capturePage();
        const filename = "filter_verified_" + item.view + ".png";
        fs.writeFileSync(path.join(artifactDir, filename), screenshot.toPNG());
        console.log("✓ Saved screenshot: " + filename);
      }
    }

    console.log("=================================================");
    console.log("ALL 12 SALES & PURCHASES VIEWS VERIFIED 100%!");
    console.log("=================================================");
    app.exit(0);
  } catch (err) {
    console.error("Test failed with error:", err);
    app.exit(1);
  }
});
