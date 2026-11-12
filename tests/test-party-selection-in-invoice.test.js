const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-party-sel-test-"));
app.setPath("userData", testRoot);

app.whenReady().then(async () => {
  const rendererErrors = [];

  try {
    await database.initDatabase(testRoot);
    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
    ipcMain.handle("db:preview-next-invoice-number", (_event, type, docDate) => database.previewNextInvoiceNumber(type, docDate));
    ipcMain.handle("whatsapp:get-status", () => ({ ready: false, authenticated: false }));
    ipcMain.handle("cloud:check-health", () => ({ reachable: false }));
    ipcMain.handle("secure-store:is-available", () => ({ available: false, platform: process.platform }));
    ipcMain.handle("secure-store:get-credentials", () => ({ ok: true, hasCredentials: false }));
    ipcMain.handle("secure-store:save-credentials", () => ({ ok: true }));
    ipcMain.handle("secure-store:clear-credentials", () => ({ ok: true }));
    ipcMain.handle("secure-store:migrate-from-local-storage", () => ({ ok: true, migrated: false }));
    ipcMain.handle("app:get-version", () => "1.1.2");

    const window = new BrowserWindow({
      width: 1400,
      height: 900,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    window.webContents.on("console-message", (_event, level, message) => {
      if (level >= 2) rendererErrors.push(message);
    });

    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await window.webContents.executeJavaScript(`
      localStorage.setItem('zynbill_device_activated', 'true');
      localStorage.setItem('zynbill_license_cache', JSON.stringify({
        token: 'smoke_test_token',
        email: 'smoke@zynbill.com',
        plan: 'Professional',
        status: 'active'
      }));
      window.dispatchEvent(new Event('gi-account-activated'));
    `);
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Test inside renderer
    const res = await window.webContents.executeJavaScript(`
      (async () => {
        // 1. Setup sample parties in state
        state.parties = [
          { id: 101, name: "Anas Traders", phone: "9048253862", type: "customer", billingAddress: "Calicut, Kerala", gstin: "32AAAAA0000A1Z5" },
          { id: 102, name: "Rafi Enterprises", phone: "9847012345", type: "both", billingAddress: "Cochin, Kerala", gstin: "" }
        ];

        // 2. Open sale invoice editor
        openTransactionEditor("sale");
        await new Promise(r => setTimeout(r, 400));

        const partyInput = document.querySelector('.transaction-editor [name="party"]');
        const phoneInput = document.querySelector('.transaction-editor [name="phone"]');
        const partyLookup = document.querySelector("#editorPartyLookup");
        const phoneLookup = document.querySelector("#editorPhoneLookup");

        if (!partyInput || !phoneInput || !partyLookup || !phoneLookup) {
          throw new Error("Invoice editor inputs not found");
        }

        // --- TEST A: Search and select party by Name ---
        partyInput.value = "Anas";
        partyInput.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise(r => setTimeout(r, 100));

        const partyButtons = partyLookup.querySelectorAll("[data-editor-party-id]");
        if (partyButtons.length === 0) throw new Error("No party buttons rendered for 'Anas'");

        // Click the first matching button
        partyButtons[0].dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        await new Promise(r => setTimeout(r, 150));

        const testAResult = {
          partyValue: partyInput.value,
          phoneValue: phoneInput.value,
          partyId: partyInput.dataset.selectedPartyId,
          panelHidden: partyLookup.classList.contains("hidden")
        };

        // --- TEST B: Search and select party by Phone ---
        partyInput.value = "";
        delete partyInput.dataset.selectedPartyId;
        phoneInput.value = "9847";
        phoneInput.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise(r => setTimeout(r, 100));

        const phoneButtons = phoneLookup.querySelectorAll("[data-editor-party-id]");
        if (phoneButtons.length === 0) throw new Error("No phone buttons rendered for '9847'");

        // Click the phone match
        phoneButtons[0].dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        await new Promise(r => setTimeout(r, 150));

        const testBResult = {
          partyValue: partyInput.value,
          phoneValue: phoneInput.value,
          partyId: partyInput.dataset.selectedPartyId,
          panelHidden: phoneLookup.classList.contains("hidden")
        };

        // --- TEST C: Keyboard Enter selection ---
        partyInput.value = "Anas";
        partyInput.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise(r => setTimeout(r, 100));

        // Dispatch ArrowDown then Enter on partyInput
        partyInput.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
        partyInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        await new Promise(r => setTimeout(r, 150));

        const testCResult = {
          partyValue: partyInput.value,
          phoneValue: phoneInput.value,
          partyId: partyInput.dataset.selectedPartyId
        };

        return { testAResult, testBResult, testCResult };
      })()
    `);

    console.log("TEST A (Party Name Select):", res.testAResult);
    assert.strictEqual(res.testAResult.partyValue, "Anas Traders");
    assert.strictEqual(res.testAResult.phoneValue, "9048253862");
    assert.strictEqual(String(res.testAResult.partyId), "101");
    assert.strictEqual(res.testAResult.panelHidden, true);

    console.log("TEST B (Phone Select):", res.testBResult);
    assert.strictEqual(res.testBResult.partyValue, "Rafi Enterprises");
    assert.strictEqual(res.testBResult.phoneValue, "9847012345");
    assert.strictEqual(String(res.testBResult.partyId), "102");
    assert.strictEqual(res.testBResult.panelHidden, true);

    console.log("TEST C (Keyboard Enter Select):", res.testCResult);
    assert.strictEqual(res.testCResult.partyValue, "Anas Traders");
    assert.strictEqual(res.testCResult.phoneValue, "9048253862");
    assert.strictEqual(String(res.testCResult.partyId), "101");

    console.log("\nRenderer errors during test:", rendererErrors);
    assert.strictEqual(rendererErrors.length, 0, `Expected 0 renderer errors, but got: ${rendererErrors.join(", ")}`);

    console.log("\nALL PARTY AND PHONE SELECTION TESTS PASSED WITH 0 ERRORS!");
    window.close();
    app.quit();
  } catch (err) {
    console.error("Test failed:", err);
    process.exitCode = 1;
    app.quit();
  }
});
