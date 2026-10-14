const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-print-test-"));
app.setPath("userData", testRoot);

app.whenReady().then(async () => {
  let win;
  try {
    console.log("=== STARTING PRINT & THERMAL POS TEMPLATES TEST SUITE ===");
    await database.initDatabase(testRoot);

    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
    ipcMain.handle("db:update-business-settings", (_event, settings) => database.updateBusinessSettings(settings));
    ipcMain.handle("db:get-info", () => ({ type: "SQLite", path: database.getDatabasePath() }));

    win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 900,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    win.webContents.on("console-message", (_event, level, message) => {
      if (level >= 2) console.log("[Console Error]", message);
    });

    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 800));

    // Open company
    await win.webContents.executeJavaScript(`
      (async () => {
        const btn = document.querySelector(".open-company-button");
        const companyName = btn?.dataset?.company || "testt";
        if (typeof openCompany === "function") {
          await openCompany(companyName);
        }
      })()
    `);
    await new Promise((r) => setTimeout(r, 1000));

    console.log("App ready. Running tests...");

    // Test 1: sampleInvoicePreviewData
    const test1 = await win.webContents.executeJavaScript(`
      (() => {
        const sample = sampleInvoicePreviewData();
        return {
          hasRows: Array.isArray(sample.rows) && sample.rows.length > 0,
          hasBusiness: Boolean(sample.business),
          hasParty: Boolean(sample.party),
          total: sample.total
        };
      })()
    `);
    assert(test1.hasRows, "sampleInvoicePreviewData must return rows");
    assert(test1.hasBusiness, "sampleInvoicePreviewData must include business");
    assert(test1.hasParty, "sampleInvoicePreviewData must include party");
    console.log("✓ Test 1: sampleInvoicePreviewData returns complete invoice dataset");

    // Test 2: Render all 4 A4 templates
    const a4Templates = ["modern", "classic", "minimal", "compact"];
    for (const tpl of a4Templates) {
      const res = await win.webContents.executeJavaScript(`
        (() => {
          const sample = sampleInvoicePreviewData();
          const html = invoicePreviewMarkup(sample, { printerType: "a4", a4Template: "${tpl}" });
          return {
            length: html.length,
            containsClass: html.includes("invoice-a4-${tpl}")
          };
        })()
      `);
      assert(res.containsClass, `invoicePreviewMarkup must render template class invoice-a4-${tpl}`);
      assert(res.length > 500, `Template ${tpl} markup length must be substantial (>500 chars)`);
      console.log(`✓ Test 2.${tpl}: A4 template '${tpl}' renders successfully (${res.length} chars)`);
    }

    // Test 3: Render all 3 Thermal templates
    const thermalTemplates = ["retail", "boutique", "detailed"];
    for (const tpl of thermalTemplates) {
      const res = await win.webContents.executeJavaScript(`
        (() => {
          const sample = sampleInvoicePreviewData();
          const html = invoicePreviewMarkup(sample, { printerType: "thermal", thermalTemplate: "${tpl}", thermalWidth: "80mm" });
          return {
            length: html.length,
            containsClass: html.includes("invoice-thermal-${tpl}")
          };
        })()
      `);
      assert(res.containsClass, `invoicePreviewMarkup must render thermal class invoice-thermal-${tpl}`);
      assert(res.length > 300, `Thermal template ${tpl} markup length must be substantial`);
      console.log(`✓ Test 3.${tpl}: Thermal template '${tpl}' renders successfully (${res.length} chars)`);
    }

    // Test 4: computeGstSummaryRows
    const test4 = await win.webContents.executeJavaScript(`
      (() => {
        const sample = sampleInvoicePreviewData();
        const gstRows = computeGstSummaryRows(sample.rows);
        return {
          count: gstRows.length,
          hasHsn: gstRows.every(r => Boolean(r.hsn)),
          hasTaxable: gstRows.every(r => r.taxable > 0),
          hasTax: gstRows.every(r => r.totalTax > 0)
        };
      })()
    `);
    assert(test4.count > 0, "computeGstSummaryRows must produce grouped GST entries");
    assert(test4.hasTaxable && test4.hasTax, "GST entries must have valid taxable and tax amounts");
    console.log("✓ Test 4: computeGstSummaryRows accurately calculates HSN-wise tax breakdown");

    // Test 5: Settings Print & Thermal page
    const test5 = await win.webContents.executeJavaScript(`
      (() => {
        renderFeatureView("appSettings", "PRINTING");
        bindFeatureActions();
        const html = elements.featureView.innerHTML;
        const hasA4Cards = html.includes('data-template-group="a4Template"');
        const hasThermalCards = html.includes('data-template-group="thermalTemplate"');
        const hasPreviewBtn = Boolean(elements.featureView.querySelector('[data-action="preview-selected-template"]'));
        const hasGstSummaryToggle = Boolean(elements.featureView.querySelector('[name="printGstSummary"]'));
        const hasNoBankInputs = !elements.featureView.querySelector('input[name="bankName"]');
        return {
          hasA4Cards,
          hasThermalCards,
          hasPreviewBtn,
          hasGstSummaryToggle,
          hasNoBankInputs
        };
      })()
    `);
    assert(test5.hasA4Cards, "Settings page must render A4 template gallery cards");
    assert(test5.hasThermalCards, "Settings page must render Thermal template gallery cards");
    assert(test5.hasPreviewBtn, "Settings page must have Live Preview button");
    assert(test5.hasGstSummaryToggle, "Settings page must have Document Elements toggles");
    assert(test5.hasNoBankInputs, "Redundant bank inputs must be removed from Printer settings");
    console.log("✓ Test 5: Settings Print & Thermal UI correctly displays template gallery and element toggles without duplicate bank inputs");

    // Test 6: Invoice Preview Modal
    const test6 = await win.webContents.executeJavaScript(`
      (() => {
        const sample = sampleInvoicePreviewData();
        openInvoicePreviewModal(sample, { printerType: "a4", a4Template: "modern" });
        const modal = document.querySelector("#invoicePreviewModal");
        const isVisible = Boolean(modal && !modal.classList.contains("hidden"));
        const formatSelect = modal.querySelector("#previewFormatSelect");
        const templateSelect = modal.querySelector("#previewTemplateSelect");
        const widthSelect = modal.querySelector("#previewWidthSelect");
        const paper = modal.querySelector(".invoice-preview-paper");

        return {
          isVisible,
          hasFormatSelect: Boolean(formatSelect),
          hasTemplateSelect: Boolean(templateSelect),
          hasWidthSelect: Boolean(widthSelect),
          paperHasModern: paper.innerHTML.includes("invoice-a4-modern")
        };
      })()
    `);
    assert(test6.isVisible, "Invoice preview modal must be open");
    assert(test6.hasFormatSelect, "Modal must have Printer Format select (#previewFormatSelect)");
    assert(test6.hasTemplateSelect, "Modal must have Template select (#previewTemplateSelect)");
    assert(test6.hasWidthSelect, "Modal must have Thermal Width select (#previewWidthSelect)");
    assert(test6.paperHasModern, "Paper must render Modern A4 template initially");
    console.log("✓ Test 6: Invoice Preview Modal renders with complete interactive controls bar");

    // Test 7: Interactive template switching
    const test7 = await win.webContents.executeJavaScript(`
      (() => {
        const modal = document.querySelector("#invoicePreviewModal");
        const formatSelect = modal.querySelector("#previewFormatSelect");
        formatSelect.value = "thermal";
        formatSelect.dispatchEvent(new Event("change"));

        const templateSelect = modal.querySelector("#previewTemplateSelect");
        templateSelect.value = "boutique";
        templateSelect.dispatchEvent(new Event("change"));

        const paper = modal.querySelector(".invoice-preview-paper");
        return {
          isThermalClass: modal.querySelector(".invoice-preview-modal").classList.contains("is-thermal"),
          paperHasThermalPaperClass: paper.classList.contains("paper-thermal"),
          paperHasBoutique: paper.innerHTML.includes("invoice-thermal-boutique")
        };
      })()
    `);
    assert(test7.isThermalClass, "Modal should receive is-thermal class when switching to thermal");
    assert(test7.paperHasThermalPaperClass, "Paper should receive paper-thermal class");
    assert(test7.paperHasBoutique, "Paper should re-render with Boutique thermal template");
    console.log("✓ Test 7: Interactive switching to Thermal Boutique template dynamically updates preview");

    console.log("=== ALL 7/7 TESTS PASSED SUCCESSFULLY (100%) ===");
    win.close();
    app.quit();
    process.exit(0);
  } catch (err) {
    console.error("Test failed with error:", err);
    if (win) win.close();
    app.quit();
    process.exit(1);
  }
});
