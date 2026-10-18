const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-party-dup-test-"));
app.setPath("userData", testRoot);

app.whenReady().then(async () => {
  const rendererErrors = [];

  try {
    console.log("==================================================================");
    console.log("   TESTING PARTY DUPLICATE PREVENTION & ERROR MANAGEMENT          ");
    console.log("==================================================================");

    await database.initDatabase(testRoot);
    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
    ipcMain.handle("db:create-party", (_event, party) => database.createParty(party));
    ipcMain.handle("db:update-party", (_event, party) => database.updateParty(party));
    ipcMain.handle("db:create-item", (_event, item) => database.createItem(item));

    // ──────────────────────────────────────────────────────────────────
    // PART 1: BACKEND DATABASE CHECKS
    // ──────────────────────────────────────────────────────────────────
    console.log("\n▶ [TEST 1] Backend: Reject empty party name on creation...");
    assert.throws(
      () => database.createParty({ name: "   ", phone: "9876543210" }),
      /Party name is required/i,
      "Should throw error when party name is empty"
    );
    console.log("  ✓ Empty party name rejected.");

    console.log("\n▶ [TEST 2] Backend: Create initial party 'Acme Traders'...");
    database.createParty({
      name: "Acme Traders",
      phone: "+91 9876543210",
      gstin: "27AAAAA0000A1Z5",
      type: "party",
    });
    const state1 = database.getState();
    const acme = state1.parties.find((p) => p.name === "Acme Traders");
    assert.ok(acme, "Acme Traders should exist in parties");
    console.log("  ✓ 'Acme Traders' created successfully.");

    console.log("\n▶ [TEST 3] Backend: Reject duplicate party name (case-insensitive & trimmed)...");
    assert.throws(
      () => database.createParty({ name: "  acme traders  ", phone: "9123456789" }),
      /Party "acme traders" already exists/i,
      "Should block duplicate party name"
    );
    console.log("  ✓ Duplicate party name blocked.");

    console.log("\n▶ [TEST 4] Backend: Reject duplicate phone (matching last 10 digits across formats)...");
    assert.throws(
      () => database.createParty({ name: "Beta Corp", phone: "9876543210" }),
      /Mobile number "9876543210" is already registered for "Acme Traders"/i,
      "Should block duplicate phone matching trailing 10 digits"
    );
    console.log("  ✓ Duplicate phone blocked.");

    console.log("\n▶ [TEST 5] Backend: Reject duplicate GSTIN (case-insensitive)...");
    assert.throws(
      () => database.createParty({ name: "Gamma Enterprises", phone: "9988776655", gstin: "27aaaaa0000a1z5" }),
      /GSTIN "27AAAAA0000A1Z5" is already registered for "Acme Traders"/i,
      "Should block duplicate GSTIN"
    );
    console.log("  ✓ Duplicate GSTIN blocked.");

    console.log("\n▶ [TEST 6] Backend: Create second party 'Delta Logistics' with unique details...");
    database.createParty({
      name: "Delta Logistics",
      phone: "9123456789",
      gstin: "27BBBBB0000B1Z6",
      type: "party",
    });
    const delta = database.getState().parties.find((p) => p.name === "Delta Logistics");
    assert.ok(delta, "Delta Logistics should exist");
    console.log("  ✓ 'Delta Logistics' created successfully.");

    console.log("\n▶ [TEST 7] Backend: Reject updating Delta to Acme's name, phone, or GSTIN...");
    assert.throws(
      () => database.updateParty({ id: delta.id, name: "acme traders", phone: "9123456789" }),
      /Party "acme traders" already exists/i,
      "Should block renaming to existing party name"
    );
    assert.throws(
      () => database.updateParty({ id: delta.id, name: "Delta Logistics", phone: "09876543210" }),
      /Mobile number "09876543210" is already registered for "Acme Traders"/i,
      "Should block updating phone to existing party phone"
    );
    assert.throws(
      () => database.updateParty({ id: delta.id, name: "Delta Logistics", phone: "9123456789", gstin: "27AAAAA0000A1Z5" }),
      /GSTIN "27AAAAA0000A1Z5" is already registered for "Acme Traders"/i,
      "Should block updating GSTIN to existing party GSTIN"
    );
    console.log("  ✓ Backend updateParty duplicate checks verified.");

    console.log("\n▶ [TEST 8] Backend: Allow updating Delta's own details without self-collision...");
    database.updateParty({
      id: delta.id,
      name: "Delta Logistics",
      phone: "9123456789",
      gstin: "27BBBBB0000B1Z6",
      billingAddress: "Warehouse 4, Port Area",
    });
    const deltaUpdated = database.getState().parties.find((p) => p.id === delta.id);
    assert.strictEqual(deltaUpdated.billingAddress, "Warehouse 4, Port Area");
    console.log("  ✓ Self-update succeeded without false collision.");

    // ──────────────────────────────────────────────────────────────────
    // PART 2: FRONTEND UI & TABBED MODAL CHECKS
    // ──────────────────────────────────────────────────────────────────
    const window = new BrowserWindow({
      width: 1366,
      height: 768,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    window.webContents.on("console-message", (_event, level, message) => {
      console.log(`[RENDERER ${level}] ${message}`);
    });

    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Open first company if company selection is shown
    await window.webContents.executeJavaScript(`(() => {
      const btn = document.querySelector(".open-company-button");
      if (btn) btn.click();
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 500));

    console.log("\n▶ [TEST 9] UI: Duplicate name validation prevents submit and shows inline error...");
    const uiNameDup = await window.webContents.executeJavaScript(`(() => {
      try {
        openEntryModal("party");
        const nameInput = document.getElementById("partyNameInput");
        const phoneInput = document.getElementById("partyPhoneInput");
        nameInput.value = "Acme Traders";
        phoneInput.value = "9555111222";

        const saveBtn = document.getElementById("saveEntryButton");
        saveBtn.click();

        const modal = document.getElementById("entryModal");
        const isModalOpen = !modal.classList.contains("hidden");
        const nameFieldError = nameInput.closest("label").querySelector(".field-error");
        const isNameInvalid = nameInput.classList.contains("invalid-field");
        const basicTabActive = document.querySelector('.party-tab-btn[data-tab="basic"]').classList.contains("active");

        return {
          isModalOpen,
          hasError: !!nameFieldError,
          errorMessage: nameFieldError?.textContent || "",
          isNameInvalid,
          basicTabActive,
        };
      } catch (err) {
        return { error: err.message, stack: err.stack };
      }
    })()`);

    if (uiNameDup.error) {
      console.error("Renderer script error:", uiNameDup.error, uiNameDup.stack);
    }

    assert.strictEqual(uiNameDup.isModalOpen, true, "Modal should remain open");
    assert.strictEqual(uiNameDup.isNameInvalid, true, "Name input should have invalid-field class");
    assert.ok(uiNameDup.errorMessage.includes("already exists"), "Error message should mention already exists");
    assert.strictEqual(uiNameDup.basicTabActive, true, "Basic tab should be active");
    console.log("  ✓ UI duplicate party name validation passed: " + uiNameDup.errorMessage);

    console.log("\n▶ [TEST 10] UI: Duplicate phone validation prevents submit and shows inline error...");
    const uiPhoneDup = await window.webContents.executeJavaScript(`(() => {
      clearInlineErrors(document.getElementById("entryForm"));
      const nameInput = document.getElementById("partyNameInput");
      const phoneInput = document.getElementById("partyPhoneInput");
      nameInput.value = "Unique Supermart";
      phoneInput.value = "9876543210"; // same as Acme

      const saveBtn = document.getElementById("saveEntryButton");
      saveBtn.click();

      const modal = document.getElementById("entryModal");
      const phoneFieldError = phoneInput.closest("label").querySelector(".field-error");
      const isPhoneInvalid = phoneInput.classList.contains("invalid-field");
      const basicTabActive = document.querySelector('.party-tab-btn[data-tab="basic"]').classList.contains("active");

      return {
        isModalOpen: !modal.classList.contains("hidden"),
        hasError: !!phoneFieldError,
        errorMessage: phoneFieldError?.textContent || "",
        isPhoneInvalid,
        basicTabActive,
      };
    })()`);

    assert.strictEqual(uiPhoneDup.isModalOpen, true, "Modal should remain open");
    assert.strictEqual(uiPhoneDup.isPhoneInvalid, true, "Phone input should have invalid-field class");
    assert.ok(uiPhoneDup.errorMessage.includes("already registered"), "Error message should mention already registered");
    assert.strictEqual(uiPhoneDup.basicTabActive, true, "Basic tab should be active");
    console.log("  ✓ UI duplicate phone validation passed: " + uiPhoneDup.errorMessage);

    console.log("\n▶ [TEST 11] UI: Invalid phone format (<10 digits) shows error...");
    const uiPhoneInvalid = await window.webContents.executeJavaScript(`(() => {
      clearInlineErrors(document.getElementById("entryForm"));
      const nameInput = document.getElementById("partyNameInput");
      const phoneInput = document.getElementById("partyPhoneInput");
      nameInput.value = "Unique Supermart";
      phoneInput.value = "12345";

      const saveBtn = document.getElementById("saveEntryButton");
      saveBtn.click();

      const phoneFieldError = phoneInput.closest("label").querySelector(".field-error");
      return {
        hasError: !!phoneFieldError,
        errorMessage: phoneFieldError?.textContent || "",
      };
    })()`);
    assert.ok(uiPhoneInvalid.errorMessage.includes("10-digit"), "Should require 10-digit mobile");
    console.log("  ✓ UI short phone rejection passed: " + uiPhoneInvalid.errorMessage);

    console.log("\n▶ [TEST 12] UI: Duplicate GSTIN with automatic tab switching...");
    const uiGstinDup = await window.webContents.executeJavaScript(`(() => {
      clearInlineErrors(document.getElementById("entryForm"));
      const nameInput = document.getElementById("partyNameInput");
      const phoneInput = document.getElementById("partyPhoneInput");
      const gstinInput = document.getElementById("partyGstinInput");
      const taxTypeSelect = document.getElementById("partyTaxType");

      nameInput.value = "Unique Supermart";
      phoneInput.value = "9555123456";
      taxTypeSelect.value = "gst_registered";
      gstinInput.value = "27AAAAA0000A1Z5"; // same as Acme

      // Explicitly switch user view back to Basic Info tab (GST tab is hidden!)
      document.querySelector('.party-tab-btn[data-tab="basic"]').click();
      const basicTabBefore = document.querySelector('.party-tab-btn[data-tab="basic"]').classList.contains("active");
      const gstPanelBefore = !document.getElementById("partyTabGst").classList.contains("hidden");

      // Now click Save
      const saveBtn = document.getElementById("saveEntryButton");
      saveBtn.click();

      // Check if system automatically navigated to GST tab!
      const gstTabAfter = document.querySelector('.party-tab-btn[data-tab="gst"]').classList.contains("active");
      const gstPanelAfter = !document.getElementById("partyTabGst").classList.contains("hidden");
      const gstinFieldError = gstinInput.closest("label").querySelector(".field-error");
      const isGstinInvalid = gstinInput.classList.contains("invalid-field");

      return {
        basicTabBefore,
        gstPanelBefore,
        gstTabAfter,
        gstPanelAfter,
        hasError: !!gstinFieldError,
        errorMessage: gstinFieldError?.textContent || "",
        isGstinInvalid,
      };
    })()`);

    assert.strictEqual(uiGstinDup.basicTabBefore, true, "Should have been on basic tab before save");
    assert.strictEqual(uiGstinDup.gstPanelBefore, false, "GST panel should have been hidden before save");
    assert.strictEqual(uiGstinDup.gstTabAfter, true, "GST tab should automatically become active");
    assert.strictEqual(uiGstinDup.gstPanelAfter, true, "GST panel should automatically become visible");
    assert.strictEqual(uiGstinDup.isGstinInvalid, true, "GSTIN input should have invalid-field class");
    assert.ok(uiGstinDup.errorMessage.includes("already registered"), "Error message should mention already registered");
    console.log("  ✓ UI duplicate GSTIN validation and automatic tab switching verified: " + uiGstinDup.errorMessage);

    console.log("\n▶ [TEST 13] UI: Successfully save party when all duplicate checks pass...");
    const uiSuccess = await window.webContents.executeJavaScript(`(() => {
      clearInlineErrors(document.getElementById("entryForm"));
      const nameInput = document.getElementById("partyNameInput");
      const phoneInput = document.getElementById("partyPhoneInput");
      const gstinInput = document.getElementById("partyGstinInput");
      const taxTypeSelect = document.getElementById("partyTaxType");

      nameInput.value = "Falcon Logistics Pvt Ltd";
      phoneInput.value = "9555888999";
      taxTypeSelect.value = "gst_registered";
      gstinInput.value = "27ABCDE1234F1Z5";

      const saveBtn = document.getElementById("saveEntryButton");
      saveBtn.click();

      return new Promise((resolve) => {
        setTimeout(() => {
          const modal = document.getElementById("entryModal");
          const isClosed = modal.classList.contains("hidden");
          const partyNames = (state.parties || []).map(p => p.name);
          resolve({ isClosed, partyNames });
        }, 500);
      });
    })()`);

    assert.strictEqual(uiSuccess.isClosed, true, "Modal should close on valid submit");
    assert.ok(uiSuccess.partyNames.includes("Falcon Logistics Pvt Ltd"), "Falcon Logistics should be present in party list");
    console.log("  ✓ Valid party saved successfully.");

    console.log("\n==================================================================");
    console.log("   ALL PARTY DUPLICATE VALIDATION & ERROR TESTS PASSED 100%!      ");
    console.log("==================================================================");

    window.close();
    app.quit();
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  }
});
