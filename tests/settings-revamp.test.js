const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-settings-revamp-"));
app.setPath("userData", testRoot);

app.whenReady().then(async () => {
  let win;
  try {
    await database.initDatabase(testRoot);

    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
    ipcMain.handle("db:update-business-settings", (_event, s) => database.updateBusinessSettings(s));

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
        await openCompany(btn?.dataset?.company || "testt");
      })()
    `);
    await new Promise((r) => setTimeout(r, 800));

    // Navigate to Settings
    console.log("Test 1: Navigate to Settings and verify all 5 tabs render...");
    const test1 = await win.webContents.executeJavaScript(`
      (() => {
        showView("appSettings");
        const tabBtns = Array.from(document.querySelectorAll(".settings-nav-button")).map(b => ({
          tab: b.dataset.settingsTab,
          text: b.querySelector(".settings-nav-text span")?.textContent?.trim()
        }));
        return {
          currentView,
          tabCount: tabBtns.length,
          tabs: tabBtns
        };
      })()
    `);
    console.log("  Settings tabs found:", test1);
    if (test1.tabCount < 5 || !test1.tabs.some(t => t.tab === "COMPANY") || !test1.tabs.some(t => t.tab === "CUSTOM_FIELDS")) {
      throw new Error(`Test 1 Failed: Expected at least 5 tabs including COMPANY and CUSTOM_FIELDS, got ${JSON.stringify(test1)}`);
    }
    console.log("  ✓ Test 1 Passed: Settings tabs rendered with modern sidebar.");

    // Test 2: Verify backward compatibility with legacy tab names "GENERAL" and "CUSTOM FIELDS"
    console.log("Test 2: Verify backward compatibility for 'GENERAL' and 'CUSTOM FIELDS'...");
    const test2 = await win.webContents.executeJavaScript(`
      (() => {
        const htmlGeneral = settingsTemplate("GENERAL");
        const htmlCustom = settingsTemplate("CUSTOM FIELDS");
        return {
          generalHasCompany: htmlGeneral.includes("Company Profile") && htmlGeneral.includes("Business Details"),
          customHasFields: htmlCustom.includes("Custom Fields") && htmlCustom.includes("custom-fields-panel"),
        };
      })()
    `);
    console.log("  Legacy mapping result:", test2);
    if (!test2.generalHasCompany || !test2.customHasFields) {
      throw new Error(`Test 2 Failed: Legacy tab mapping error: ${JSON.stringify(test2)}`);
    }
    console.log("  ✓ Test 2 Passed: Legacy tab parameters map seamlessly.");

    // Test 3: Save Company Profile and verify fields persist
    console.log("Test 3: Update and save Company Profile...");
    const test3 = await win.webContents.executeJavaScript(`
      (async () => {
        document.querySelector('[data-settings-tab="COMPANY"]').click();
        await new Promise(r => setTimeout(r, 200));

        const form = document.querySelector("#businessSettingsForm");
        form.querySelector('[name="businessName"]').value = "Acme Enterprises Ltd";
        form.querySelector('[name="address"]').value = "42 MG Road, Bengaluru";
        form.querySelector('[name="state"]').value = "Karnataka";
        form.querySelector('[name="gstin"]').value = "29ABCDE1234F1Z5";
        form.querySelector('[name="pan"]').value = "ABCDE1234F";

        form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
        await new Promise(r => setTimeout(r, 400));

        return {
          businessName: state.businessSettings.businessName,
          gstin: state.businessSettings.gstin,
          pan: state.businessSettings.pan,
          address: state.businessSettings.address,
        };
      })()
    `);
    console.log("  Saved Company Profile:", test3);
    if (test3.businessName !== "Acme Enterprises Ltd" || test3.gstin !== "29ABCDE1234F1Z5") {
      throw new Error(`Test 3 Failed: Company profile not saved properly: ${JSON.stringify(test3)}`);
    }
    console.log("  ✓ Test 3 Passed: Company Profile saved and state updated.");

    // Test 4: Save Invoicing tab without losing Company Profile
    console.log("Test 4: Update Invoicing settings and verify other fields remain intact...");
    const test4 = await win.webContents.executeJavaScript(`
      (async () => {
        document.querySelector('[data-settings-tab="INVOICING"]').click();
        await new Promise(r => setTimeout(r, 200));

        const form = document.querySelector("#businessSettingsForm");
        form.querySelector('[name="invoicePrefix"]').value = "ACM";
        form.querySelector('[name="startingNo"]').value = "105";
        form.querySelector('[name="terms"]').value = "Payment due within 15 days.";

        form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
        await new Promise(r => setTimeout(r, 400));

        return {
          businessName: state.businessSettings.businessName,
          invoicePrefix: state.businessSettings.invoicePrefix,
          startingNo: state.businessSettings.startingNo,
          terms: state.businessSettings.terms,
        };
      })()
    `);
    console.log("  Saved Invoicing settings:", test4);
    if (test4.invoicePrefix !== "ACM" || test4.startingNo !== 105 || test4.businessName !== "Acme Enterprises Ltd") {
      throw new Error(`Test 4 Failed: Invoicing settings merge issue: ${JSON.stringify(test4)}`);
    }
    console.log("  ✓ Test 4 Passed: Invoicing settings updated without overwriting Company Profile.");

    // Test 5: Save Printing settings
    console.log("Test 5: Update Printing settings...");
    const test5 = await win.webContents.executeJavaScript(`
      (async () => {
        document.querySelector('[data-settings-tab="PRINTING"]').click();
        await new Promise(r => setTimeout(r, 200));

        const form = document.querySelector("#businessSettingsForm");
        form.querySelector('[name="printerType"]').value = "thermal";
        form.querySelector('[name="thermalWidth"]').value = "58mm";

        form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
        await new Promise(r => setTimeout(r, 400));

        return {
          printerType: state.businessSettings.printerType,
          thermalWidth: state.businessSettings.thermalWidth,
          businessName: state.businessSettings.businessName,
        };
      })()
    `);
    console.log("  Saved Printing settings:", test5);
    if (test5.printerType !== "thermal" || test5.thermalWidth !== "58mm") {
      throw new Error(`Test 5 Failed: Printing settings failed to save: ${JSON.stringify(test5)}`);
    }
    console.log("  ✓ Test 5 Passed: Printing & POS settings saved.");

    // Test 6: Save Tax & Inventory preferences
    console.log("Test 6: Update Inventory & Tax preferences...");
    const test6 = await win.webContents.executeJavaScript(`
      (async () => {
        document.querySelector('[data-settings-tab="TAX_INVENTORY"]').click();
        await new Promise(r => setTimeout(r, 200));

        const form = document.querySelector("#businessSettingsForm");
        const negStock = form.querySelector('[name="stopSaleOnNegativeStock"]');
        negStock.checked = true;
        const mrp = form.querySelector('[name="defaultTaxInclusive"]');
        mrp.checked = true;

        form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
        await new Promise(r => setTimeout(r, 400));

        return {
          stopSaleOnNegativeStock: state.businessSettings.stopSaleOnNegativeStock,
          defaultTaxInclusive: state.businessSettings.defaultTaxInclusive,
          businessName: state.businessSettings.businessName,
        };
      })()
    `);
    console.log("  Saved Inventory & Tax settings:", test6);
    if (!test6.stopSaleOnNegativeStock || !test6.defaultTaxInclusive) {
      throw new Error(`Test 6 Failed: Tax & Inventory preferences failed: ${JSON.stringify(test6)}`);
    }
    console.log("  ✓ Test 6 Passed: Inventory & Tax preferences saved.");

    // Test 7: Custom fields add, toggle, and verify zero horizontal overflow
    console.log("Test 7: Add custom field and verify no horizontal scroll...");
    const test7 = await win.webContents.executeJavaScript(`
      (async () => {
        document.querySelector('[data-settings-tab="CUSTOM_FIELDS"]').click();
        await new Promise(r => setTimeout(r, 200));

        const form = document.querySelector("#customFieldCreateForm");
        form.querySelector('[name="module"]').value = "sale";
        form.querySelector('[name="label"]').value = "Delivery Vehicle";
        form.querySelector('[name="fieldType"]').value = "text";

        form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
        await new Promise(r => setTimeout(r, 400));

        const content = document.querySelector(".settings-content");
        const hasField = state.businessSettings.customFields.some(f => f.label === "Delivery Vehicle");

        return {
          hasField,
          contentScrollWidth: content.scrollWidth,
          contentClientWidth: content.clientWidth,
          hasHorizontalScroll: content.scrollWidth > content.clientWidth,
        };
      })()
    `);
    console.log("  Custom field creation result:", test7);
    if (!test7.hasField || test7.hasHorizontalScroll) {
      throw new Error(`Test 7 Failed: Custom field creation or overflow issue: ${JSON.stringify(test7)}`);
    }
    console.log("  ✓ Test 7 Passed: Custom field added cleanly with zero horizontal overflow.");

    console.log("\nALL 7 SETTINGS REVAMP TESTS PASSED SUCCESSFULLY!\n");
  } catch (err) {
    console.error("Test Error:", err);
    process.exit(1);
  } finally {
    if (win) win.close();
    app.quit();
  }
});
