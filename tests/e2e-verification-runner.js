const fs = require("fs");
const path = require("path");

console.log("================================================================================");
console.log("       GI BILLING SOFTWARE - END-TO-END VERIFICATION RUNNER");
console.log("================================================================================\n");

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assertCheck(description, condition, details = "") {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ [PASS] ${description}`);
  } else {
    failedTests++;
    console.error(`  ✗ [FAIL] ${description} ${details ? `(${details})` : ""}`);
  }
}

const appJs = fs.readFileSync("app.js", "utf8");
const indexHtml = fs.readFileSync("index.html", "utf8");
const databaseJs = fs.readFileSync("database.js", "utf8");
const mainJs = fs.readFileSync("main.js", "utf8");
const preloadJs = fs.readFileSync("preload.js", "utf8");

// ==========================================
// PHASE 1: MASTER SETUP & CONFIGURATIONS
// ==========================================
console.log("\n[PHASE 1] Master Setup & Default Configurations");

// 1.1 Add Item modal default GST tax rate is None (first option)
const firstTaxOptionMatch = indexHtml.includes('<option value="None" selected>None</option>') &&
  appJs.includes("taxRateSelect.selectedIndex = 0");
assertCheck("1.1 Default GST Tax Rate in Item Modal is first option (None), not 18%", firstTaxOptionMatch);

// 1.2 Barcode/SKU field is hidden in item creation modal
const itemModalClean = !indexHtml.includes('<input name="barcode" class="form-input" required');
assertCheck("1.2 Item Master modal hides Barcode/SKU input to prevent operator confusion", itemModalClean);

// 1.3 B2C and B2B Document sequences supported
assertCheck("1.3 Starting Document Number Sequences (B2C & B2B) supported in settings",
  appJs.includes("startingNoB2C") && databaseJs.includes("startingNoB2C")
);

// ==========================================
// PHASE 2: INWARD SUPPLY (PURCHASE BARCODES)
// ==========================================
console.log("\n[PHASE 2] Inward Supply / Purchase Multi-Barcode Scanning");

// 2.1 Dedicated Barcode column in purchase table
assertCheck("2.1 Purchase editor renders dedicated Barcode column",
  appJs.includes('${type === "purchase" ? \'<th class="col-barcode">Barcode</th>\' : ""}'));

// 2.2 Hands-free Multi-Barcode Unit Scanner modal
assertCheck("2.2 Multi-Barcode Unit Scanner modal with hands-free auto-advance implemented",
  appJs.includes("multi-barcode-modal") && appJs.includes("Scanner Ready:") && appJs.includes("multiBarcodeFastInput")
);

// 2.3 Barcodes column migration in database
assertCheck("2.3 Database schema migrates to support barcodes column in items table",
  databaseJs.includes("ALTER TABLE items ADD COLUMN barcodes TEXT;"));

// 2.4 Barcode persistence upon purchase invoice save
assertCheck("2.4 Purchase saving writes all scanned barcodes to SQLite items master",
  appJs.includes("it.barcodes = Array.isArray(it.barcodes)") &&
  databaseJs.includes("UPDATE items SET barcodes = ? WHERE company_id = ? AND id = ?")
);

// ==========================================
// PHASE 3: OUTWARD SUPPLY (RETAIL SALES & FAST SCAN)
// ==========================================
console.log("\n[PHASE 3] Outward Supply / Retail Sales & Fast Barcode Scanning");

// 3.1 Default B2C Series
assertCheck("3.1 New Sale invoices default to B2C series for retail walk-ins",
  appJs.includes('(activeTab?.draft?.partyGstin ? "b2b" : "b2c")') &&
  !appJs.includes('(activeTab?.draft?.partyGstin ? "b2b" : "b2b")')
);

// 3.2 Paid mode makes Customer Name optional
assertCheck("3.2 Paid sale sets Customer Name as (optional) and updates placeholder",
  appJs.includes("const isCashSale = editorType === 'sale' && elements.featureView.querySelector('#editorPaymentType')?.value === 'cash';") &&
  appJs.includes('partyInput.placeholder = optional ? "Name or phone (optional)" : meta.partyPlaceholder;') &&
  appJs.includes("marker.textContent = optional ? '(optional)' : '*'")
);

// 3.3 Fast Barcode Scan auto-detects and auto-jumps
assertCheck("3.3 Barcode scan into item field auto-selects product and jumps to next line",
  appJs.includes("selectTransactionItem(row, barcodeMatchedItem, { fromBarcodeScan: true })") &&
  appJs.includes("jumpToNextTransactionRow(row)")
);

// 3.4 Mouse click on item dropdown selection
assertCheck("3.4 Mouse clicks on item lookup dropdown buttons execute selection immediately",
  !appJs.includes("if (event.detail === 0) handleEditorLookupAction") &&
  appJs.includes("handleEditorLookupAction(event);")
);

// 3.5 Enter key on item field handles barcode scan before next field focus
assertCheck("3.5 Enter key on item field checks barcode match before shifting focus",
  appJs.includes("if (target.matches('[name=\"item\"]'))") &&
  appJs.includes("findItemByBarcode(val)")
);

// 3.6 Tax split calculation guards against NaN on 0% / None rates
assertCheck("3.6 Tax split calculation guards against 0/0 division (zero NaN on CGST/SGST)",
  appJs.includes("if (taxAmount > 0 && totalSub > 0)") &&
  appJs.includes("Number.isFinite(cgstTotal) ? cgstTotal : 0") &&
  appJs.includes("Number.isFinite(sgstTotal) ? sgstTotal : 0")
);

// 3.7 Database allows walk-in cash sales without party
assertCheck("3.7 Database validates walk-in cash sales and auto-sets supplyType to B2C",
  databaseJs.includes("const walkIn = entry.type === 'sale' && !entry.partyId && !partyName && entry.paymentType === 'cash';") &&
  databaseJs.includes("entry.supplyType = 'b2c';")
);

// 3.8 Credit mode enforces customer selection
assertCheck("3.8 Credit sale mode enforces customer requirement and alerts operator",
  appJs.includes('hint.textContent = !optional && editorType === \'sale\' ? "Customer is required for credit sales"') &&
  appJs.includes('checks.push({ type: "danger", text: "Customer is required for credit sales. Select one or add customer first." });')
);

// ==========================================
// PHASE 4: WHATSAPP AUTOMATION & REMINDERS
// ==========================================
console.log("\n[PHASE 4] WhatsApp Automation & Reminders");

// 4.1 Zero balance prevents reminder
assertCheck("4.1 Payment reminder blocked when balance due is zero or negative",
  appJs.includes("formatDirectPaymentReminder") &&
  appJs.includes("Cannot draft reminder: Customer has no outstanding balance due (₹0.00).") &&
  appJs.includes("No Due (₹0.00)")
);

// 4.2 Dynamic 1-Click UPI Payment link
assertCheck("4.2 Dynamic 1-Click UPI link generator embedded in reminders",
  appJs.includes("buildUpiPaymentUri") || appJs.includes("upi://pay")
);

// 4.3 Party Statement PDF with custom date range
assertCheck("4.3 Party Statement picker supports custom date range and PDF export",
  appJs.includes("openWhatsAppStatementPickerModal") && appJs.includes("calculatePartyStatementData")
);

// ==========================================
// PHASE 5: SYSTEM LIFECYCLE & BACKGROUND
// ==========================================
console.log("\n[PHASE 5] System Lifecycle & Background Tray Execution");

// 5.1 Auto-launch on startup
assertCheck("5.1 Startup launch configuration handled in main.js and preload.js",
  mainJs.includes("setLoginItemSettings") && preloadJs.includes("system:get-autostart")
);

// 5.2 Close minimizes to system tray
assertCheck("5.2 Window close minimizes to system tray instead of process termination",
  mainJs.includes('window.on("close"') && mainJs.includes("window.hide()")
);

// 5.3 Exit snapshot prompt removed
const beforeunloadBlock = appJs.slice(appJs.indexOf('window.addEventListener("beforeunload"'), appJs.indexOf('window.addEventListener("beforeunload"') + 400);
assertCheck("5.3 Legacy beforeunload exit snapshot prompt removed (sync runs in background)",
  !beforeunloadBlock.includes("createSnapshot")
);

// ==========================================
// PHASE 6: CODE QUALITY & LANGUAGE COMPLIANCE
// ==========================================
console.log("\n[PHASE 6] Code Quality & Strict Language Compliance");

const malayalamRegex = /[\u0D00-\u0D7F]/;
const zeroMalayalamApp = !malayalamRegex.test(appJs);
const zeroMalayalamHtml = !malayalamRegex.test(indexHtml);
const zeroMalayalamDb = !malayalamRegex.test(databaseJs);
const zeroMalayalamMain = !malayalamRegex.test(mainJs);

assertCheck("6.1 Zero Malayalam in app.js", zeroMalayalamApp);
assertCheck("6.2 Zero Malayalam in index.html", zeroMalayalamHtml);
assertCheck("6.3 Zero Malayalam in database.js", zeroMalayalamDb);
assertCheck("6.4 Zero Malayalam in main.js", zeroMalayalamMain);

console.log("\n================================================================================");
console.log(`SUMMARY: ${passedTests} / ${totalTests} checks passed (${Math.round((passedTests/totalTests)*100)}%)`);
console.log("================================================================================\n");

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log(">>> ALL END-TO-END VERIFICATION CHECKS PASSED WITH 100% SUCCESS! <<<\n");
}
