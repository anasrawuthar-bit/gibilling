const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const userDataPath = app.getPath("userData");

app.whenReady().then(async () => {
  let win = null;
  try {
    await database.initDatabase(userDataPath);

    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:get-info", () => ({ type: "SQLite", path: database.getDatabasePath() }));
    ipcMain.handle("db:set-current-company", (_e, name) => database.setCurrentCompany(name));
    ipcMain.handle("db:update-business-settings", (_e, settings) => database.updateBusinessSettings(settings));
    ipcMain.handle("db:preview-next-invoice-number", (_e, type, date) => database.previewNextInvoiceNumber(type, date));
    ipcMain.handle("db:get-units-list", () => database.getUnitsList ? database.getUnitsList() : []);
    ipcMain.handle("db:get-categories-with-hierarchy", () => database.getCategoriesWithHierarchy ? database.getCategoriesWithHierarchy() : []);

    win = new BrowserWindow({
      width: 1400,
      height: 900,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
      console.log(`[Renderer ${level}] ${message} (${sourceId}:${line})`);
    });

    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 600));

    // TEST 1: Open Settings -> Invoicing and verify Additional Fields toggle option exists
    console.log("TEST 1: Verifying Additional Fields toggle in Settings -> Invoicing...");
    const settingsCheck = await win.webContents.executeJavaScript(`(async () => {
      showView("appSettings");
      await new Promise(r => setTimeout(r, 200));
      const invTab = document.querySelector('[data-settings-tab="INVOICING"]');
      if (invTab) invTab.click();
      await new Promise(r => setTimeout(r, 200));
      const toggle = document.querySelector('[name="enableAdditionalFields"]');
      return {
        hasToggle: Boolean(toggle),
        isChecked: toggle ? toggle.checked : null,
      };
    })()`);

    assert.strictEqual(settingsCheck.hasToggle, true, "Settings -> Invoicing must have enableAdditionalFields toggle");
    assert.strictEqual(settingsCheck.isChecked, true, "enableAdditionalFields toggle should be checked by default");
    console.log("✓ Settings -> Invoicing has 'Enable Additional Fields in Invoices' toggle (checked by default)");
    const imgSettings = await win.webContents.capturePage();
    fs.writeFileSync("C:\\Users\\ANAS\\.gemini\\antigravity-ide\\brain\\9dd39af8-a7ad-430b-8ee8-49729ceb732f\\settings_invoicing_toggle_verified.png", imgSettings.toPNG());

    // TEST 2: Open Invoice editor and verify Additional Fields and Bottom-Left Notes
    console.log("TEST 2: Verifying Invoice editor layout with Additional Fields and Bottom-Left Notes...");
    const editorCheck = await win.webContents.executeJavaScript(`(async () => {
      openTransactionEditor("sale", { skipDirtyCheck: true });
      await new Promise(r => setTimeout(r, 300));

      const details = document.querySelector(".editor-more-details");
      if (details) details.open = true;

      const additionalPanel = document.getElementById("editorAdditionalFieldsPanel");
      const additionalGrid = document.getElementById("editorAdditionalFieldsGrid");
      const toggleBtn = document.getElementById("toggleAdditionalFieldsBtn");

      const sideActions = document.querySelector(".editor-side-actions");
      const notesBtn = sideActions ? sideActions.querySelector('[data-editor-extra="description"]') : null;
      const notesSection = document.getElementById("editorNotesSection");
      const notesInput = sideActions ? sideActions.querySelector('[name="invoiceDescription"]') : null;

      // Ensure notes is NOT in top details
      const topDetailsNotes = document.querySelector(".editor-unified-secondary-row [name='invoiceDescription']");

      return {
        hasAdditionalPanel: Boolean(additionalPanel),
        hasAdditionalGrid: Boolean(additionalGrid),
        hasToggleBtn: Boolean(toggleBtn),
        hasSideActions: Boolean(sideActions),
        hasNotesBtn: Boolean(notesBtn),
        hasNotesSection: Boolean(notesSection),
        hasNotesInput: Boolean(notesInput),
        hasTopDetailsNotes: Boolean(topDetailsNotes),
        notesPlaceholder: notesInput?.placeholder,
      };
    })()`);

    assert.strictEqual(editorCheck.hasAdditionalPanel, true, "Additional Fields panel must be present when enabled");
    assert.strictEqual(editorCheck.hasAdditionalGrid, true, "Additional Fields grid must exist");
    assert.strictEqual(editorCheck.hasToggleBtn, true, "Additional Fields section must have a toggle button");
    assert.strictEqual(editorCheck.hasNotesBtn, true, "Notes button must exist in bottom-left actions");
    assert.strictEqual(editorCheck.hasNotesSection, true, "Notes section must exist near Notes button in bottom-left");
    assert.strictEqual(editorCheck.hasNotesInput, true, "Notes textarea must be located in bottom-left actions");
    assert.strictEqual(editorCheck.hasTopDetailsNotes, false, "Notes textarea must be removed from top details row");
    console.log("✓ Additional Fields panel and bottom-left Notes near Notes button confirmed!");

    // TEST 3: Test clicking Notes button focuses bottom-left textarea and typing sets active
    console.log("TEST 3: Verifying Notes button click and typing behavior...");
    const notesInteraction = await win.webContents.executeJavaScript(`(async () => {
      const notesBtn = document.querySelector('[data-editor-extra="description"]');
      const notesInput = document.querySelector('.editor-side-actions [name="invoiceDescription"]');
      notesBtn.click();
      await new Promise(r => setTimeout(r, 100));

      const isFocused = document.activeElement === notesInput;
      notesInput.value = "Delivery before 5 PM. Contact supervisor.";
      notesInput.dispatchEvent(new Event("input", { bubbles: true }));

      return {
        isFocused,
        isActive: notesBtn.classList.contains("active"),
        value: notesInput.value,
      };
    })()`);

    assert.strictEqual(notesInteraction.isFocused, true, "Clicking Notes button must focus bottom-left notes textarea");
    assert.strictEqual(notesInteraction.isActive, true, "Entering text must set Notes button to active");
    console.log("✓ Notes button interaction works cleanly (focuses textarea, highlights button)");
    const imgEditor = await win.webContents.capturePage();
    fs.writeFileSync("C:\\Users\\ANAS\\.gemini\\antigravity-ide\\brain\\9dd39af8-a7ad-430b-8ee8-49729ceb732f\\editor_notes_and_additional_fields_verified.png", imgEditor.toPNG());

    // TEST 4: Test toggling Additional Fields in Invoicing Settings to OFF
    console.log("TEST 4: Toggling Additional Fields to OFF in Settings and verifying hiding in Invoice editor...");
    const toggleOffCheck = await win.webContents.executeJavaScript(`(async () => {
      transactionLeaveBypass = true;
      showView("appSettings");
      transactionLeaveBypass = false;
      await new Promise(r => setTimeout(r, 200));
      const invTab = document.querySelector('[data-settings-tab="INVOICING"]');
      if (invTab) invTab.click();
      await new Promise(r => setTimeout(r, 200));

      const toggle = document.querySelector('[name="enableAdditionalFields"]');
      if (toggle && toggle.checked) {
        toggle.checked = false;
        toggle.dispatchEvent(new Event("change", { bubbles: true }));
      }

      const form = document.getElementById("businessSettingsForm");
      form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
      await new Promise(r => setTimeout(r, 600));

      const statusText = document.getElementById("businessSettingsStatus")?.textContent;

      // Now open Invoice editor
      openTransactionEditor("sale", { skipDirtyCheck: true });
      await new Promise(r => setTimeout(r, 400));

      const details = document.querySelector(".editor-more-details");
      if (details) details.open = true;

      const additionalPanel = document.getElementById("editorAdditionalFieldsPanel");
      return {
        statusText,
        additionalPanelExists: Boolean(additionalPanel),
        settingsValue: state.businessSettings.enableAdditionalFields,
      };
    })()`);

    assert.strictEqual(toggleOffCheck.settingsValue, false, "enableAdditionalFields setting should be false");
    assert.strictEqual(toggleOffCheck.additionalPanelExists, false, "Additional Fields panel must be completely hidden when toggle is OFF");
    console.log("✓ When Additional Fields toggle is turned OFF in Settings, section is hidden from Invoice editor");

    // Restore setting to true
    await win.webContents.executeJavaScript(`(async () => {
      state.businessSettings.enableAdditionalFields = true;
      if (window.giDB?.updateBusinessSettings) {
        await window.giDB.updateBusinessSettings(state.businessSettings);
      }
    })()`);

    console.log("\n=======================================================");
    console.log("   ALL ADDITIONAL FIELDS & NOTES TESTS PASSED 100%!    ");
    console.log("=======================================================\n");

    process.exit(0);
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  } finally {
    if (win && !win.isDestroyed()) win.close();
    app.quit();
  }
});
