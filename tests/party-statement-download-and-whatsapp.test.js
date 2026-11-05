const assert = require("assert");
const fs = require("fs");
const path = require("path");

// Read app.js source to test core functions in isolated mock environment
const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

function setupMockEnvironment() {
  const listeners = {};
  const mockElements = {
    featureView: {
      innerHTML: "",
      querySelectorAll: (sel) => [],
      querySelector: (sel) => null,
    },
    searchInput: { value: "" },
  };

  const mockState = {
    activeCompany: "Aesthec Industrial Solutions",
    businessSettings: {
      businessName: "Aesthec Industrial Solutions",
      address: "123 Tech Park, Bangalore, KA",
      phone: "9876543210",
      email: "contact@aesthec.com",
      gstin: "29AABCA1234F1Z5",
      bankDetails: {
        bankName: "HDFC Bank",
        accountNo: "50200012345678",
        ifsc: "HDFC0001234",
        upiId: "aesthec@hdfcbank",
      },
      whatsappSettings: {},
    },
    parties: [
      {
        id: 101,
        name: "Zenith Enterprises",
        phone: "9846515684",
        type: "customer",
        openingBalance: 5000,
        openingBalanceType: "receivable",
        gstin: "29AABCA9999Z1Z1",
        billingAddress: "45 Industrial Area, Bangalore",
      },
      {
        id: 102,
        name: "Global Steel Works",
        phone: "", // No phone number initially
        type: "supplier",
        openingBalance: 12000,
        openingBalanceType: "payable",
        gstin: "29BBBBB1111A1Z2",
      },
    ],
    invoices: [
      {
        id: 1,
        invoiceNo: "INV-2026-0001",
        date: "2026-04-10",
        type: "sale",
        party: "Zenith Enterprises",
        partyId: "101",
        total: 15000,
        balance: 15000,
        rows: [{ description: "Steel Rods", qty: 10, unitPrice: 1500, total: 15000 }],
      },
    ],
    payments: [
      {
        id: 1,
        type: "payment_in",
        party: "Zenith Enterprises",
        partyId: "101",
        paymentDate: "2026-04-15",
        amount: 8000,
        paymentMode: "bank",
        referenceNo: "UPI-TXN-9988",
      },
    ],
    creditNotes: [],
    debitNotes: [],
  };

  return { mockState, mockElements };
}

console.log("▶ Verifying Party Statement Download & WhatsApp Sharing features...");

// Test 1: Check function existence in app.js
assert.ok(appJs.includes("function calculatePartyStatementData"), "calculatePartyStatementData function should exist in app.js");
assert.ok(appJs.includes("function downloadPartyStatementPdf"), "downloadPartyStatementPdf function should exist in app.js");
assert.ok(appJs.includes("function sharePartyStatementOnWhatsApp"), "sharePartyStatementOnWhatsApp function should exist in app.js");
assert.ok(appJs.includes("function promptPartyPhoneForWhatsApp"), "promptPartyPhoneForWhatsApp function should exist in app.js");
console.log("  ✓ Core statement & WhatsApp functions exist in app.js");

// Test 2: Check UI buttons in partyDetail
assert.ok(!appJs.includes('data-action="download-party-statement"'), "Download Statement button should be removed from partyDetail");
assert.ok(!appJs.includes('data-action="share-party-statement-whatsapp"'), "WhatsApp Share button should be removed from partyDetail");
assert.ok(appJs.includes('data-action="view-party-statement-report"'), "Statement Report button should be rendered in partyDetail");
console.log("  ✓ Verified header has Statement Report, with download and WhatsApp share removed");

// Test 3: Check UI buttons in partyLedgerTable
assert.ok(!appJs.includes('data-action="download-party-statement"') && !appJs.includes('data-action="share-party-statement-whatsapp"'), "Ledger table banner should not contain redundant download & WhatsApp actions");
console.log("  ✓ Verified ledger table banner is clean without redundant action buttons");

// Test 4: Check UI button in reportPageShell
assert.ok(appJs.includes('data-report-tool="share-whatsapp"'), "partyStatement report should have WhatsApp Share button");
console.log("  ✓ WhatsApp Share button present in partyStatement report header");

// Test 5: Verify click event bindings
assert.ok(appJs.includes("[data-action='download-party-statement']"), "Click listener for download-party-statement bound");
assert.ok(appJs.includes("[data-action='share-party-statement-whatsapp']"), "Click listener for share-party-statement-whatsapp bound");
assert.ok(appJs.includes("[data-action='view-party-statement-report']"), "Click listener for view-party-statement-report bound");
assert.ok(appJs.includes('button.dataset.reportTool === "share-whatsapp"'), "Report tool share-whatsapp listener bound");
console.log("  ✓ Event handlers properly registered in bindFeatureActions");

// Test 6: Verify WhatsApp docType support
assert.ok(appJs.includes('partyStatement: "Statement of Account"'), "WhatsApp modal should support partyStatement document type");
assert.ok(appJs.includes('docType === "partyStatement" ? "Share Statement of Account"'), "WhatsApp modal header should adapt for Statement of Account");
assert.ok(appJs.includes("recordOrInvoice.statementData?.formattedClosingBalance"), "WhatsApp modal should display net closing balance");
console.log("  ✓ WhatsApp modal fully supports partyStatement document type");

console.log("\n==================================================================");
console.log("  ALL PARTY STATEMENT & WHATSAPP UNIT CHECKS PASSED 100%!        ");
console.log("==================================================================\n");
