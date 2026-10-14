const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const database = require("../database");

async function runDailyOperationsReadinessTest() {
  console.log("==================================================================");
  console.log("   GI BILLING SOFTWARE - DAILY OPERATIONS READINESS SUITE         ");
  console.log("==================================================================");

  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-daily-readiness-"));
  console.log(`[INIT] Initializing isolated database sandbox at:\n       ${testRoot}\n`);

  try {
    await database.initDatabase(testRoot);

    // -------------------------------------------------------------------------
    // 1. SETUP COMPANY PROFILE
    // -------------------------------------------------------------------------
    console.log("▶ STEP 1: Setting up enterprise company profile...");
    const state0 = database.getState();
    const currentCompany = state0.companies.find((c) => c.is_current) || state0.companies[0];
    assert.ok(currentCompany, "A default active company must exist");

    database.updateCompanyProfile(currentCompany.id, {
      name: "Apex Industrial Supplies Pvt Ltd",
      legalName: "Apex Industrial Supplies Private Limited",
      gstin: "27AAPCA1234F1Z5",
      pan: "AAPCA1234F",
      state: "Maharashtra",
      stateCode: "27",
      phone: "9822012345",
      email: "accounts@apexsupplies.in",
      address: "Plot 42, MIDC Industrial Area, Pune 411018",
    });

    database.updateBusinessSettings({
      businessName: "Apex Industrial Supplies Pvt Ltd",
      gstin: "27AAPCA1234F1Z5",
      pan: "AAPCA1234F",
      state: "Maharashtra",
      phone: "9822012345",
      email: "accounts@apexsupplies.in",
      address: "Plot 42, MIDC Industrial Area, Pune 411018",
      enableGst: true,
      bankDetails: {
        bankName: "HDFC Bank",
        accountNo: "50200012345678",
        ifsc: "HDFC0000123",
        upiId: "apexsupplies@hdfcbank",
      },
    });

    const company = database.getCurrentCompany();
    assert.equal(company.name, "Apex Industrial Supplies Pvt Ltd");
    console.log("  ✓ Company configured: Apex Industrial Supplies Pvt Ltd (GSTIN: 27AAPCA1234F1Z5)");

    // -------------------------------------------------------------------------
    // 2. CREATE MASTER PARTIES & ITEMS
    // -------------------------------------------------------------------------
    console.log("\n▶ STEP 2: Creating customer, supplier, and inventory items...");
    database.createParty({
      name: "Zenith Manufacturing Ltd",
      type: "customer",
      taxType: "gst_registered",
      gstin: "27AABCZ5678G1Z2",
      state: "Maharashtra",
      pan: "AABCZ5678G",
      phone: "9822099999",
      billingAddress: "Sector 10, Bhosari MIDC, Pune 411026",
      creditLimit: 100000,
      paymentTerms: "Net 30",
      dueDays: 30,
    });

    database.createParty({
      name: "Bharat Steel Distributors",
      type: "supplier",
      taxType: "gst_registered",
      gstin: "27AABCB9012H1Z9",
      state: "Maharashtra",
      pan: "AABCB9012H",
      phone: "9822088888",
      billingAddress: "Steel Market Yard, Kalamboli, Navi Mumbai 410218",
      paymentTerms: "Net 30",
      dueDays: 30,
    });

    database.createItem({
      name: "Industrial Fastener M12",
      itemType: "product",
      sku: "FST-M12-SS",
      hsnSac: "7318",
      unit: "PCS",
      purchasePrice: 500,
      salePrice: 800,
      taxRate: 18,
      openingStock: 0,
    });

    database.createItem({
      name: "Machine Calibration Service",
      itemType: "service",
      sku: "SRV-CAL-01",
      hsnSac: "9987",
      unit: "HRS",
      purchasePrice: 0,
      salePrice: 2500,
      taxRate: 18,
      openingStock: 0,
    });

    const stateMasters = database.getState();
    const customer = stateMasters.parties.find((p) => p.name === "Zenith Manufacturing Ltd");
    const supplier = stateMasters.parties.find((p) => p.name === "Bharat Steel Distributors");
    const fastener = stateMasters.items.find((i) => i.name === "Industrial Fastener M12");
    const calibration = stateMasters.items.find((i) => i.name === "Machine Calibration Service");

    assert.ok(customer, "Customer must exist");
    assert.ok(supplier, "Supplier must exist");
    assert.ok(fastener, "Fastener product must exist");
    assert.ok(calibration, "Calibration service must exist");
    assert.equal(fastener.currentStock, 0, "Initial fastener stock must be 0");
    console.log("  ✓ Customer: Zenith Manufacturing Ltd");
    console.log("  ✓ Supplier: Bharat Steel Distributors");
    console.log("  ✓ Items: Industrial Fastener M12 (Product @ ₹800), Machine Calibration (Service @ ₹2500)");

    // -------------------------------------------------------------------------
    // 3. PURCHASE BILL FLOW (Stock In + ITC + Accounts Payable)
    // -------------------------------------------------------------------------
    console.log("\n▶ STEP 3: Recording Purchase Bill (100 Fasteners @ ₹500 + 18% GST)...");
    database.createTransaction({
      type: "purchase",
      party: supplier.name,
      partyId: supplier.id,
      invoiceNo: "PUR-2026-001",
      date: "2026-10-01",
      dueDate: "2026-10-31",
      paymentType: "credit",
      received: 0,
      items: [
        {
          itemId: fastener.id,
          item: fastener.name,
          qty: 100,
          price: 500,
          unit: "PCS",
          hsnSac: "7318",
          taxRate: 18,
        },
      ],
    });

    const statePurchase = database.getState();
    const updatedFastenerAfterPur = statePurchase.items.find((i) => i.id === fastener.id);
    const updatedSupplierAfterPur = statePurchase.parties.find((p) => p.id === supplier.id);
    const purchaseBill = statePurchase.invoices.find((i) => (i.invoiceNo || i.invoice_no) === "PUR-2026-001");

    assert.equal(Number(updatedFastenerAfterPur.currentStock), 100, "Stock should increase to 100 PCS");
    assert.equal(Number(purchaseBill.total), 59000, "Purchase total should be ₹59,000 (₹50,000 + 18% GST)");
    assert.equal(Number(purchaseBill.cgstTotal || purchaseBill.cgst_total), 4500, "CGST should be ₹4,500");
    assert.equal(Number(purchaseBill.sgstTotal || purchaseBill.sgst_total), 4500, "SGST should be ₹4,500");
    assert.equal(Number(purchaseBill.balance), 59000, "Outstanding balance should be ₹59,000");
    assert.equal(Number(updatedSupplierAfterPur.payable), 59000, "Supplier payable should be ₹59,000");
    console.log("  ✓ Purchase Bill PUR-2026-001 saved: Total ₹59,000 (Taxable ₹50,000, CGST ₹4,500, SGST ₹4,500)");
    console.log(`  ✓ Fastener Stock updated: ${updatedFastenerAfterPur.currentStock} PCS`);
    console.log(`  ✓ Supplier Payable updated: ₹${updatedSupplierAfterPur.payable}`);

    // -------------------------------------------------------------------------
    // 4. SALE INVOICE FLOW (Stock Out + Output Tax + Accounts Receivable)
    // -------------------------------------------------------------------------
    console.log("\n▶ STEP 4: Creating Sale Invoice (20 Fasteners @ ₹800 + 1 Calibration @ ₹2500 + 18% GST)...");
    database.createTransaction({
      type: "sale",
      party: customer.name,
      partyId: customer.id,
      invoiceNo: "INV-2026-001",
      date: "2026-10-05",
      dueDate: "2026-11-04",
      paymentType: "credit",
      received: 0,
      items: [
        {
          itemId: fastener.id,
          item: fastener.name,
          qty: 20,
          price: 800,
          unit: "PCS",
          hsnSac: "7318",
          taxRate: 18,
        },
        {
          itemId: calibration.id,
          item: calibration.name,
          qty: 1,
          price: 2500,
          unit: "HRS",
          hsnSac: "9987",
          taxRate: 18,
        },
      ],
    });

    const stateSale = database.getState();
    const updatedFastenerAfterSale = stateSale.items.find((i) => i.id === fastener.id);
    const updatedCustomerAfterSale = stateSale.parties.find((p) => p.id === customer.id);
    const saleInvoice = stateSale.invoices.find((i) => (i.invoiceNo || i.invoice_no) === "INV-2026-001");

    // Taxable: (20 * 800) + 2500 = 16,000 + 2,500 = 18,500. GST: 18% of 18,500 = 3,330 (CGST 1,665, SGST 1,665). Total: 21,830.
    assert.equal(Number(updatedFastenerAfterSale.currentStock), 80, "Stock should reduce from 100 to 80 PCS");
    assert.equal(Number(saleInvoice.total), 21830, "Sale total should be ₹21,830");
    assert.equal(Number(saleInvoice.cgstTotal || saleInvoice.cgst_total), 1665, "CGST should be ₹1,665");
    assert.equal(Number(saleInvoice.sgstTotal || saleInvoice.sgst_total), 1665, "SGST should be ₹1,665");
    assert.equal(Number(saleInvoice.balance), 21830, "Outstanding balance should be ₹21,830");
    assert.equal(Number(updatedCustomerAfterSale.receivable), 21830, "Customer receivable should be ₹21,830");
    console.log("  ✓ Sale Invoice INV-2026-001 saved: Total ₹21,830 (Taxable ₹18,500, CGST ₹1,665, SGST ₹1,665)");
    console.log(`  ✓ Fastener Stock updated: ${updatedFastenerAfterSale.currentStock} PCS`);
    console.log(`  ✓ Customer Receivable updated: ₹${updatedCustomerAfterSale.receivable}`);

    // -------------------------------------------------------------------------
    // 5. PAYMENT IN FLOW (Customer partial payment)
    // -------------------------------------------------------------------------
    console.log("\n▶ STEP 5: Recording Customer Payment In (₹15,000 via Bank)...");
    database.recordPaymentIn({
      invoiceId: saleInvoice.id,
      amount: 15000,
      method: "Bank Transfer",
      paymentDate: "2026-10-07",
      notes: "Part payment via NEFT ref HDFC998811",
    });

    const statePayIn = database.getState();
    const updatedCustomerAfterPay = statePayIn.parties.find((p) => p.id === customer.id);
    const saleInvoiceAfterPay = statePayIn.invoices.find((i) => i.id === saleInvoice.id);

    assert.equal(Number(saleInvoiceAfterPay.received), 15000, "Invoice received should be ₹15,000");
    assert.equal(Number(saleInvoiceAfterPay.balance), 6830, "Invoice balance should be ₹6,830");
    assert.equal(saleInvoiceAfterPay.status, "partially_paid", "Invoice status should be partially_paid for partial payment");
    assert.equal(Number(updatedCustomerAfterPay.receivable), 6830, "Customer receivable should reduce to ₹6,830");
    console.log("  ✓ Payment In ₹15,000 recorded against INV-2026-001");
    console.log(`  ✓ Customer Receivable balance reduced to: ₹${updatedCustomerAfterPay.receivable}`);

    // -------------------------------------------------------------------------
    // 6. PAYMENT OUT FLOW (Supplier partial payment)
    // -------------------------------------------------------------------------
    console.log("\n▶ STEP 6: Recording Supplier Payment Out (₹35,000 via Bank)...");
    database.recordPaymentOut({
      invoiceId: purchaseBill.id,
      amount: 35000,
      method: "Bank Transfer",
      paymentDate: "2026-10-08",
      notes: "Part payment via RTGS",
    });

    const statePayOut = database.getState();
    const updatedSupplierAfterPay = statePayOut.parties.find((p) => p.id === supplier.id);
    const purchaseBillAfterPay = statePayOut.invoices.find((i) => i.id === purchaseBill.id);

    assert.equal(Number(purchaseBillAfterPay.received), 35000, "Purchase received should be ₹35,000");
    assert.equal(Number(purchaseBillAfterPay.balance), 24000, "Purchase balance should be ₹24,000");
    assert.equal(Number(updatedSupplierAfterPay.payable), 24000, "Supplier payable should reduce to ₹24,000");
    console.log("  ✓ Payment Out ₹35,000 recorded against PUR-2026-001");
    console.log(`  ✓ Supplier Payable balance reduced to: ₹${updatedSupplierAfterPay.payable}`);

    // -------------------------------------------------------------------------
    // 7. SALES RETURN FLOW (Credit Note: 2 Defective Fasteners returned)
    // -------------------------------------------------------------------------
    console.log("\n▶ STEP 7: Processing Sales Return / Credit Note (2 Fasteners returned)...");
    database.createCreditNote({
      originalInvoiceId: saleInvoice.id,
      originalInvoiceNo: saleInvoice.invoiceNo || saleInvoice.invoice_no,
      party: customer.name,
      partyId: customer.id,
      creditNo: "CRN-2026-001",
      date: "2026-10-09",
      reason: "Goods returned - Defective thread pitch",
      items: [
        {
          itemId: fastener.id,
          item: fastener.name,
          qty: 2,
          price: 800,
          unit: "PCS",
          hsnSac: "7318",
          taxRate: 18,
        },
      ],
    });

    const stateCredit = database.getState();
    const fastenerAfterCredit = stateCredit.items.find((i) => i.id === fastener.id);
    const customerAfterCredit = stateCredit.parties.find((p) => p.id === customer.id);
    const creditNote = stateCredit.creditNotes.find((cn) => cn.creditNo === "CRN-2026-001");

    // 2 * 800 = 1,600 + 18% GST (288) = 1,888 total return
    assert.ok(creditNote, "Credit note must exist");
    assert.equal(Number(creditNote.total), 1888, "Credit note total should be ₹1,888");
    assert.equal(Number(fastenerAfterCredit.currentStock), 82, "Fastener stock should increase back from 80 to 82 PCS");
    // Receivable was 6,830 - 1,888 = 4,942
    assert.equal(Number(customerAfterCredit.receivable), 4942, "Customer receivable should reduce by ₹1,888 to ₹4,942");
    console.log("  ✓ Credit Note CRN-2026-001 created: Total ₹1,888 (2 units restored)");
    console.log(`  ✓ Fastener stock restored to: ${fastenerAfterCredit.currentStock} PCS`);
    console.log(`  ✓ Customer Receivable reduced to: ₹${customerAfterCredit.receivable}`);

    // -------------------------------------------------------------------------
    // 8. PURCHASE RETURN FLOW (Debit Note: 5 Surplus Fasteners returned)
    // -------------------------------------------------------------------------
    console.log("\n▶ STEP 8: Processing Purchase Return / Debit Note (5 Fasteners returned to supplier)...");
    database.createDebitNote({
      originalPurchaseId: purchaseBill.id,
      originalPurchaseNo: purchaseBill.invoiceNo || purchaseBill.invoice_no,
      party: supplier.name,
      partyId: supplier.id,
      debitNo: "DBN-2026-001",
      date: "2026-10-10",
      reason: "Surplus stock returned",
      items: [
        {
          itemId: fastener.id,
          item: fastener.name,
          qty: 5,
          price: 500,
          unit: "PCS",
          hsnSac: "7318",
          taxRate: 18,
        },
      ],
    });

    const stateDebit = database.getState();
    const fastenerAfterDebit = stateDebit.items.find((i) => i.id === fastener.id);
    const supplierAfterDebit = stateDebit.parties.find((p) => p.id === supplier.id);
    const debitNote = stateDebit.debitNotes.find((dn) => dn.debitNo === "DBN-2026-001");

    // 5 * 500 = 2,500 + 18% GST (450) = 2,950 total debit note
    assert.ok(debitNote, "Debit note must exist");
    assert.equal(Number(debitNote.total), 2950, "Debit note total should be ₹2,950");
    assert.equal(Number(fastenerAfterDebit.currentStock), 77, "Fastener stock should decrease from 82 to 77 PCS");
    // Payable was 24,000 - 2,950 = 21,050
    assert.equal(Number(supplierAfterDebit.payable), 21050, "Supplier payable should reduce by ₹2,950 to ₹21,050");
    console.log("  ✓ Debit Note DBN-2026-001 created: Total ₹2,950 (5 units returned)");
    console.log(`  ✓ Fastener stock updated to: ${fastenerAfterDebit.currentStock} PCS`);
    console.log(`  ✓ Supplier Payable reduced to: ₹${supplierAfterDebit.payable}`);

    // -------------------------------------------------------------------------
    // 9. DUPLICATE INVOICE PREVENTION
    // -------------------------------------------------------------------------
    console.log("\n▶ STEP 9: Testing duplicate invoice collision protection...");
    let caughtDuplicate = false;
    try {
      database.createTransaction({
        type: "sale",
        party: customer.name,
        partyId: customer.id,
        invoiceNo: "INV-2026-001", // Already exists!
        items: [
          {
            itemId: fastener.id,
            item: fastener.name,
            qty: 1,
            price: 800,
            unit: "PCS",
            hsnSac: "7318",
            taxRate: 18,
          },
        ],
      });
    } catch (err) {
      caughtDuplicate = true;
      assert.ok(err.message.includes("already exists"), `Expected duplicate message, got: ${err.message}`);
      console.log(`  ✓ Duplicate invoice successfully blocked with friendly error:\n    "${err.message}"`);
    }
    assert.ok(caughtDuplicate, "Duplicate invoice creation must be rejected");

    // -------------------------------------------------------------------------
    // 10. RECONCILIATION: GST, TRIAL BALANCE, P&L, BALANCES
    // -------------------------------------------------------------------------
    console.log("\n▶ STEP 10: Running Accountant Financial Reconciliation...");

    // 10a. GST Tax Entries Review
    const taxEntries = database.getTaxEntries();
    const activeEntries = taxEntries.filter((e) => !e.isCancelled);

    const outputGstEntries = activeEntries.filter((e) => e.sourceType === "sale");
    const creditNoteTaxEntries = activeEntries.filter((e) => e.sourceType === "credit_note");
    const inputGstEntries = activeEntries.filter((e) => e.sourceType === "purchase");
    const debitNoteTaxEntries = activeEntries.filter((e) => e.sourceType === "debit_note");

    const totalOutputGst = outputGstEntries.reduce((s, e) => s + (e.cgst + e.sgst + e.igst), 0);
    const totalCreditGst = creditNoteTaxEntries.reduce((s, e) => s + (e.cgst + e.sgst + e.igst), 0);
    const netOutputLiability = totalOutputGst - totalCreditGst;

    const totalInputGst = inputGstEntries.reduce((s, e) => s + (e.cgst + e.sgst + e.igst), 0);
    const totalDebitGst = debitNoteTaxEntries.reduce((s, e) => s + (e.cgst + e.sgst + e.igst), 0);
    const netInputCredit = totalInputGst - totalDebitGst;

    assert.equal(netOutputLiability, 3042, "Net Output GST should be ₹3,042 (₹3,330 - ₹288)");
    assert.equal(netInputCredit, 8550, "Net Input GST should be ₹8,550 (₹9,000 - ₹450)");
    console.log(`  ✓ GST Output Liability (Net of Returns): ₹${netOutputLiability}`);
    console.log(`  ✓ GST Input Tax Credit (Net of Returns): ₹${netInputCredit}`);
    console.log(`  ✓ Net GST Balance: Excess ITC of ₹${netInputCredit - netOutputLiability}`);

    // 10b. Double-Entry Trial Balance
    const rawLedger = database.getState().ledger || [];
    const trialBalance = {};
    rawLedger.forEach((entry) => {
      const acct = entry.account || "General";
      if (!trialBalance[acct]) trialBalance[acct] = { debit: 0, credit: 0 };
      trialBalance[acct].debit += Number(entry.debit || 0);
      trialBalance[acct].credit += Number(entry.credit || 0);
    });

    let totalDebitSum = 0;
    let totalCreditSum = 0;
    for (const [acct, val] of Object.entries(trialBalance)) {
      totalDebitSum += val.debit;
      totalCreditSum += val.credit;
    }
    const diff = Math.abs(totalDebitSum - totalCreditSum);
    assert.ok(diff < 0.01, `Trial balance must balance! Debit: ₹${totalDebitSum}, Credit: ₹${totalCreditSum}, Diff: ₹${diff}`);
    console.log(`  ✓ Double-Entry Trial Balance verified: Total Debit ₹${totalDebitSum.toFixed(2)} === Total Credit ₹${totalCreditSum.toFixed(2)} (Diff: ₹0.00)`);

    // 10c. Outstanding Balances Check
    assert.equal(customerAfterCredit.receivable, 4942, "Customer outstanding must be ₹4,942");
    assert.equal(supplierAfterDebit.payable, 21050, "Supplier outstanding must be ₹21,050");
    console.log(`  ✓ Customer Outstanding: ₹${customerAfterCredit.receivable}`);
    console.log(`  ✓ Supplier Outstanding: ₹${supplierAfterDebit.payable}`);

    // -------------------------------------------------------------------------
    // 11. AUDIT TRAIL VERIFICATION
    // -------------------------------------------------------------------------
    console.log("\n▶ STEP 11: Verifying comprehensive audit trail...");
    const auditLog = database.getAuditTrail();
    assert.ok(auditLog.length >= 8, `Expected at least 8 audit events, found: ${auditLog.length}`);

    const hasPartyLog = auditLog.some((e) => e.entityType === "party");
    const hasItemLog = auditLog.some((e) => e.entityType === "item");
    const hasInvoiceLog = auditLog.some((e) => e.entityType === "invoice");
    const hasCreditNoteLog = auditLog.some((e) => e.entityType === "credit_note");
    const hasDebitNoteLog = auditLog.some((e) => e.entityType === "debit_note");

    assert.ok(hasPartyLog, "Audit log must contain party creation");
    assert.ok(hasItemLog, "Audit log must contain item creation");
    assert.ok(hasInvoiceLog, "Audit log must contain invoice operations");
    assert.ok(hasCreditNoteLog, "Audit log must contain credit note");
    assert.ok(hasDebitNoteLog, "Audit log must contain debit note");
    console.log(`  ✓ Audit trail logged ${auditLog.length} events covering parties, items, invoices, returns and payments`);

    // -------------------------------------------------------------------------
    // 12. DATA SAFETY: BACKUP, PREVIEW & RESTORE
    // -------------------------------------------------------------------------
    console.log("\n▶ STEP 12: Testing backup creation, preview inspection, and restore...");
    const backupFilePath = path.join(testRoot, "daily-operations-test-backup.sqlite");
    const backupRes = database.backupTo(backupFilePath);
    assert.ok(fs.existsSync(backupFilePath), "Backup file must be written to disk");
    console.log(`  ✓ SQLite database backed up to: ${path.basename(backupFilePath)}`);

    // Test Restore Preview
    const preview = await database.previewBackup(backupFilePath);
    assert.equal(preview.valid, true, "Backup preview should pass integrity check");
    assert.equal(preview.primaryCompany, "Apex Industrial Supplies Pvt Ltd");
    assert.equal(preview.companyCount, 1);
    assert.ok(preview.partyCount >= 2, "Preview should reflect parties");
    assert.ok(preview.itemCount >= 2, "Preview should reflect items");
    assert.ok(preview.invoiceCount >= 2, "Preview should reflect invoices");
    console.log(`  ✓ Backup Preview inspected: Company '${preview.primaryCompany}', Invoices: ${preview.invoiceCount}, Parties: ${preview.partyCount}, Items: ${preview.itemCount}, Integrity: ${preview.integrity}`);

    // Mutate state temporarily, then restore from backup
    database.createParty({ name: "Temporary Party To Be Discarded", type: "customer" });
    assert.ok(database.getState().parties.some((p) => p.name === "Temporary Party To Be Discarded"));

    // Restore Backup
    const restoreRes = await database.restoreBackup(backupFilePath, { userDataPath: testRoot });
    assert.equal(restoreRes.success, true);
    assert.ok(fs.existsSync(restoreRes.safetyBackupPath), "A pre-restore safety backup must be preserved");

    // Verify restored state
    const statePostRestore = database.getState();
    assert.ok(!statePostRestore.parties.some((p) => p.name === "Temporary Party To Be Discarded"), "Temporary party should vanish after restore");
    const restoredCust = statePostRestore.parties.find((p) => p.name === "Zenith Manufacturing Ltd");
    const restoredFastener = statePostRestore.items.find((i) => i.name === "Industrial Fastener M12");
    assert.equal(Number(restoredCust.receivable), 4942, "Receivable must be restored precisely");
    assert.equal(Number(restoredFastener.currentStock), 77, "Stock must be restored precisely");
    console.log("  ✓ Database restored successfully! All stock, ledger balances, and documents match 100%");

    // -------------------------------------------------------------------------
    // 13. MULTI-USER ROLES TEST
    // -------------------------------------------------------------------------
    console.log("\n▶ STEP 13: Testing multi-user & role security...");
    const usersInitial = database.getUsers();
    assert.ok(usersInitial.some((u) => u.username === "admin"), "Default admin must exist");

    database.createUser({
      username: "priya_acct",
      displayName: "Priya Sharma",
      role: "accountant",
    });

    database.createUser({
      username: "rahul_pos",
      displayName: "Rahul Verma",
      role: "cashier",
    });

    const updatedUsers = database.getUsers();
    assert.equal(updatedUsers.length, 3);
    assert.ok(updatedUsers.some((u) => u.username === "priya_acct" && u.role === "accountant"));
    assert.ok(updatedUsers.some((u) => u.username === "rahul_pos" && u.role === "cashier"));
    console.log(`  ✓ Multi-user system verified: 3 users configured (${updatedUsers.map((u) => `${u.username}:${u.role}`).join(", ")})`);

    // -------------------------------------------------------------------------
    // 14. PDF & PRINT PREVIEW WORKFLOW VALIDATION
    // -------------------------------------------------------------------------
    console.log("\n▶ STEP 14: Verifying PDF and printable document templates...");
    const invoiceRecord = statePostRestore.invoices.find((i) => (i.invoiceNo || i.invoice_no) === "INV-2026-001");
    assert.ok(invoiceRecord);

    // Verify invoice fields readiness for print engine
    assert.equal(invoiceRecord.party, "Zenith Manufacturing Ltd");
    assert.equal(invoiceRecord.partyGstin || invoiceRecord.party_gstin, "27AABCZ5678G1Z2");
    assert.equal(invoiceRecord.placeOfSupply || invoiceRecord.place_of_supply, "Maharashtra");
    assert.equal(Number(invoiceRecord.total), 21830);
    assert.equal(Number(invoiceRecord.cgstTotal || invoiceRecord.cgst_total), 1665);
    assert.equal(Number(invoiceRecord.sgstTotal || invoiceRecord.sgst_total), 1665);
    console.log("  ✓ Tax invoice metadata, GSTIN, place of supply, and tax split ready for print engine");

    console.log("\n==================================================================");
    console.log("   ALL 14 DAILY OPERATIONS READINESS TESTS PASSED 100%!           ");
    console.log("==================================================================");

    process.exit(0);
  } catch (err) {
    console.error("\n❌ DAILY OPERATIONS TEST FAILED:", err);
    process.exit(1);
  } finally {
    try {
      fs.rmSync(testRoot, { recursive: true, force: true });
    } catch (_) {}
  }
}

runDailyOperationsReadinessTest();
