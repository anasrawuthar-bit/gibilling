const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const database = require("../database");

const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity\\brain\\bed9650d-397d-4216-aa80-c0ae1c3c4fcb";
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-audit-ui-"));
app.setPath("userData", testRoot);

async function runAudit() {
  await database.initDatabase(testRoot);

  ipcMain.handle("db:get-state", () => database.getState());
  ipcMain.handle("db:get-info", () => ({ version: "1.0.0", dbType: "sqlite" }));
  ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
  ipcMain.handle("db:create-party", (_event, party) => database.createParty(party));
  ipcMain.handle("db:create-item", (_event, item) => database.createItem(item));
  ipcMain.handle("db:create-transaction", (_event, txn) => database.createTransaction(txn));
  ipcMain.handle("db:preview-next-invoice-number", (_event, type, date) => database.previewNextInvoiceNumber(type, date));
  ipcMain.handle("db:create-snapshot", async () => ({ success: true, filename: "audit-snapshot.zyn", formattedSize: "128 KB", createdAt: new Date().toISOString() }));
  ipcMain.handle("db:list-snapshots", async () => [
    { filename: "gi_billing-snapshot-2026-11-02.zyn", path: "C:\\backups\\gi_billing-snapshot-2026-11-02.zyn", formattedSize: "256 KB", isAuto: false, createdAt: new Date().toISOString() }
  ]);
  ipcMain.handle("db:get-users", () => []);
  ipcMain.handle("db:get-audit-trail", () => []);
  ipcMain.handle("db:list-companies", () => database.listCompanies ? database.listCompanies() : []);
  ipcMain.handle("db:create-company", (_event, data) => database.createCompany ? database.createCompany(data) : null);

  database.updateBusinessSettings({
    companyName: "Kerala Tech & Industrial Supplies",
    gstin: "32AAAAA0000A1Z5",
    state: "Kerala",
    address: "Door 42/100, M.G. Road, Ernakulam, Kerala 682016",
    phone: "9847012345",
    email: "accounts@keralatech.in",
    currency: "INR",
    currencySymbol: "₹",
    taxEnabled: true
  });

  database.createParty({
    name: "Rafi Electronics & Retail",
    phone: "9876543210",
    type: "customer",
    openingBalance: 12450,
    openingBalanceType: "receivable",
    taxType: "gst_registered",
    gstin: "32ABCDE1234F1Z5",
    state: "Kerala",
    billingAddress: "Shop 14, Commercial Complex, Calicut, Kerala"
  });

  database.createParty({
    name: "Bharat Industrial Spares",
    phone: "9845123456",
    type: "supplier",
    openingBalance: 45000,
    openingBalanceType: "payable",
    taxType: "gst_registered",
    gstin: "27ABCDE5678G1Z9",
    state: "Maharashtra",
    billingAddress: "Plot 88, MIDC Industrial Area, Pune, Maharashtra"
  });

  database.createParty({
    name: "Apex Modern Traders",
    phone: "9447112233",
    type: "customer",
    openingBalance: 0,
    openingBalanceType: "receivable",
    taxType: "unregistered",
    state: "Kerala",
    billingAddress: "Main Market, Thrissur, Kerala"
  });

  database.createItem({
    name: "Industrial Inverter 5kVA",
    sku: "INV-5KVA",
    hsn: "85044090",
    itemType: "product",
    salePrice: 38500,
    purchasePrice: 29000,
    gstRate: 18,
    taxType: "taxable",
    openingStock: 12,
    unit: "PCS"
  });

  database.createItem({
    name: "Copper Wiring Coil 90m",
    sku: "COP-90M",
    hsn: "85444990",
    itemType: "product",
    salePrice: 4200,
    purchasePrice: 3100,
    gstRate: 18,
    taxType: "taxable",
    openingStock: 45,
    unit: "COIL"
  });

  database.createItem({
    name: "Solar Panel Maintenance & Testing",
    sku: "SRV-TEST",
    hsn: "998719",
    itemType: "service",
    salePrice: 5000,
    purchasePrice: 0,
    gstRate: 18,
    taxType: "taxable",
    openingStock: 0,
    unit: "HRS"
  });

  // Record a Sale Transaction
  database.createTransaction({
    type: "sale",
    invoiceNumber: "INV-2026-0001",
    date: "2026-11-01",
    party: "Rafi Electronics & Retail",
    partyName: "Rafi Electronics & Retail",
    customerName: "Rafi Electronics & Retail",
    customerGstin: "32ABCDE1234F1Z5",
    billingAddress: "Shop 14, Commercial Complex, Calicut, Kerala",
    placeOfSupply: "32-Kerala",
    item: "Industrial Inverter 5kVA",
    amount: 90860,
    items: [
      {
        item: "Industrial Inverter 5kVA",
        name: "Industrial Inverter 5kVA",
        hsn: "85044090",
        qty: 2,
        rate: 38500,
        unit: "PCS",
        discount: 0,
        taxPercent: 18,
        taxType: "taxable",
        cgstPercent: 9,
        sgstPercent: 9,
        igstPercent: 0,
        cgstAmount: 6930,
        sgstAmount: 6930,
        igstAmount: 0,
        taxAmount: 13860,
        total: 90860
      }
    ],
    subtotal: 77000,
    totalTax: 13860,
    totalAmount: 90860,
    paidAmount: 50000,
    balanceAmount: 40860,
    status: "partial"
  });

  // Record a Purchase Transaction
  database.createTransaction({
    type: "purchase",
    invoiceNumber: "PUR-2026-0042",
    date: "2026-10-28",
    party: "Bharat Industrial Spares",
    partyName: "Bharat Industrial Spares",
    supplierName: "Bharat Industrial Spares",
    supplierGstin: "27ABCDE5678G1Z9",
    billingAddress: "Plot 88, MIDC Industrial Area, Pune, Maharashtra",
    placeOfSupply: "27-Maharashtra",
    item: "Copper Wiring Coil 90m",
    amount: 73160,
    items: [
      {
        item: "Copper Wiring Coil 90m",
        name: "Copper Wiring Coil 90m",
        hsn: "85444990",
        qty: 20,
        rate: 3100,
        unit: "COIL",
        discount: 0,
        taxPercent: 18,
        taxType: "taxable",
        cgstPercent: 0,
        sgstPercent: 0,
        igstPercent: 18,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 11160,
        taxAmount: 11160,
        total: 73160
      }
    ],
    subtotal: 62000,
    totalTax: 11160,
    totalAmount: 73160,
    paidAmount: 73160,
    balanceAmount: 0,
    status: "paid"
  });

  const win = new BrowserWindow({
    show: false,
    width: 1366,
    height: 768,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 800));

    // Open first company
    await win.webContents.executeJavaScript(`document.querySelector(".open-company-button")?.click(); undefined`);
    await new Promise((r) => setTimeout(r, 600));

    async function captureView(viewName, filename, context) {
      const code = context
        ? `showView("${viewName}", "${context}")`
        : `showView("${viewName}")`;
      await win.webContents.executeJavaScript(`
        ${code};
        new Promise((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setTimeout(resolve, 400);
            });
          });
        });
      `);
      await new Promise((r) => setTimeout(r, 500));
      const img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(artifactDir, filename), img.toPNG());
      console.log("Captured:", filename);
    }

    // 1. Dashboard
    await captureView("home", "audit_view_dashboard.png");

    // 2. Items
    await captureView("items", "audit_view_items.png");

    // 3. Parties
    await captureView("parties", "audit_view_parties.png");

    // 4. Sales Invoices List
    await captureView("sales", "audit_view_sales.png");

    // 4a. Estimate / Quotation
    await captureView("estimate", "audit_view_estimate.png");

    // 4b. Payment-In
    await captureView("paymentIn", "audit_view_payment_in.png");

    // 4c. Sale Return / Credit Note
    await captureView("saleReturn", "audit_view_sale_return.png");

    // 5. Purchases Bills List
    await captureView("purchases", "audit_view_purchases.png");

    // 5a. Payment-Out
    await captureView("paymentOut", "audit_view_payment_out.png");

    // 5b. Expenses
    await captureView("expenses", "audit_view_expenses.png");

    // 5c. Purchase Return / Debit Note
    await captureView("purchaseReturn", "audit_view_purchase_return.png");

    // 6. GST Workspace (No top horizontal tabs)
    await captureView("gst", "audit_view_gst.png");

    // 7. GSTR-1
    await captureView("gstr1", "audit_view_gstr1.png");

    // 8. Reports Overview
    await captureView("reports", "audit_view_reports.png");

    // 9. Sales Register Report
    await captureView("reports", "audit_view_sales_register.png", "salesRegister");

    // 10. Analytics / Business Intelligence ("grow")
    await captureView("grow", "audit_view_grow.png");

    // 11. Cash & Bank (Revamped & Decluttered)
    await captureView("cash", "audit_view_cash_and_bank.png");

    // 12. Utilities: Set Up My Business
    await captureView("setupBusiness", "audit_view_setup_business.png");

    // 13. Utilities: Import Items
    await captureView("importItems", "audit_view_import_items.png");

    // 14. Utilities: Export Items (Real CSV export table)
    await captureView("exportItems", "audit_view_export_items.png");

    // 15. Utilities: Verify Data (Real diagnostic checklist)
    await captureView("verifyData", "audit_view_verify_data.png");

    // 16. Utilities: Barcode Generator
    await captureView("barcodeGenerator", "audit_view_barcode_generator.png");

    // 17. Settings (WhatsApp Integration removed)
    await captureView("appSettings", "audit_view_settings.png");

    // 18. Sync & Backup
    await captureView("sync", "audit_view_sync.png");

    // 19. Transaction Editor
    await win.webContents.executeJavaScript(`openTransactionEditor("sale", { skipDirtyCheck: true })`);
    await new Promise((r) => setTimeout(r, 700));
    const editorImg = await win.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "audit_view_invoice_editor.png"), editorImg.toPNG());

    console.log("ACCURATE AUDIT CAPTURE COMPLETE!");
  } catch (err) {
    console.error("Audit error:", err);
  } finally {
    try { fs.rmSync(testRoot, { recursive: true, force: true }); } catch (_) {}
    app.quit();
  }
}

app.whenReady().then(runAudit);
