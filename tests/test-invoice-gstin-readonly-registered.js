const { app, BrowserWindow } = require("electron");
const path = require("path");
const assert = require("assert");
const fs = require("fs");

const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity-ide\\brain\\9dd39af8-a7ad-430b-8ee8-49729ceb732f";

async function runTest() {
  const window = new BrowserWindow({
    show: true,
    width: 1366,
    height: 920,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  try {
    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 1000));

    console.log("Setting up parties (registered vs unregistered)...");
    await window.webContents.executeJavaScript(`
      (() => {
        state.parties = [
          {
            id: 301,
            name: "FVs Consumer Store",
            phone: "9872131233",
            billingAddress: "Shop 12, Market Complex, Coimbatore",
            taxType: "unregistered",
            type: "customer"
          },
          {
            id: 302,
            name: "Apex Precision Tools Ltd",
            phone: "9845012345",
            gstin: "33AABCA1234A1Z5",
            billingAddress: "Plot 42, Phase II, MIDC Industrial Area, Coimbatore 641001",
            taxType: "gst_registered",
            type: "customer"
          }
        ];

        openTransactionEditor("sale");
      })()
    `);
    await new Promise((r) => setTimeout(r, 600));

    console.log("TEST 1: Selecting unregistered customer (FVs Consumer Store)...");
    const unregCheck = await window.webContents.executeJavaScript(`
      (() => {
        const moreDetails = document.querySelector(".editor-unified-more-details");
        if (moreDetails) moreDetails.open = true;

        const unregParty = state.parties.find(p => p.id === 301);
        selectTransactionParty(unregParty);

        const colGstin = document.querySelector('.transaction-editor .col-gstin');
        const secondaryRow = document.querySelector('.transaction-editor .editor-unified-secondary-row');
        const gstinInput = document.querySelector('.transaction-editor [name="partyGstin"]');
        const supplyType = document.querySelector('.transaction-editor [name="supplyType"]');

        return {
          colDisplay: colGstin ? window.getComputedStyle(colGstin).display : null,
          hasGstinHiddenClass: secondaryRow?.classList.contains("gstin-hidden"),
          gstinValue: gstinInput?.value,
          supplyType: supplyType?.value,
          isReadonly: gstinInput?.readOnly
        };
      })()
    `);

    console.log("  Unregistered customer check:", unregCheck);
    assert.strictEqual(unregCheck.colDisplay, "none", "GSTIN col must be hidden for unregistered customer");
    assert.strictEqual(unregCheck.hasGstinHiddenClass, true, "Secondary row must have gstin-hidden class");
    assert.strictEqual(unregCheck.supplyType, "b2c", "Supply type should be b2c");
    assert.strictEqual(unregCheck.gstinValue, "", "GSTIN value must be empty");

    // Capture screenshot of unregistered customer
    await new Promise((r) => setTimeout(r, 300));
    const unregShot = await window.webContents.capturePage();
    const unregShotPath = path.join(artifactDir, "invoice_editor_unregistered_no_gstin_verified.png");
    fs.writeFileSync(unregShotPath, unregShot.toPNG());
    console.log("  Saved unregistered screenshot to:", unregShotPath);

    console.log("TEST 2: Selecting registered customer (Apex Precision Tools Ltd)...");
    const regCheck = await window.webContents.executeJavaScript(`
      (() => {
        const regParty = state.parties.find(p => p.id === 302);
        selectTransactionParty(regParty);

        const colGstin = document.querySelector('.transaction-editor .col-gstin');
        const secondaryRow = document.querySelector('.transaction-editor .editor-unified-secondary-row');
        const gstinInput = document.querySelector('.transaction-editor [name="partyGstin"]');
        const supplyType = document.querySelector('.transaction-editor [name="supplyType"]');
        const computed = window.getComputedStyle(gstinInput);

        return {
          colDisplay: colGstin ? window.getComputedStyle(colGstin).display : null,
          hasGstinHiddenClass: secondaryRow?.classList.contains("gstin-hidden"),
          gstinValue: gstinInput?.value,
          supplyType: supplyType?.value,
          isReadonly: gstinInput?.readOnly,
          tabIndex: gstinInput?.getAttribute("tabindex"),
          backgroundColor: computed.backgroundColor,
          cursor: computed.cursor
        };
      })()
    `);

    console.log("  Registered customer check:", regCheck);
    assert.notStrictEqual(regCheck.colDisplay, "none", "GSTIN col must be visible for registered customer");
    assert.strictEqual(regCheck.hasGstinHiddenClass, false, "Secondary row must NOT have gstin-hidden class");
    assert.strictEqual(regCheck.gstinValue, "33AABCA1234A1Z5", "GSTIN value must match registered party GSTIN");
    assert.strictEqual(regCheck.isReadonly, true, "GSTIN input must be readOnly");
    assert.strictEqual(regCheck.tabIndex, "-1", "GSTIN input must have tabindex='-1'");

    // Capture screenshot of registered customer
    await new Promise((r) => setTimeout(r, 300));
    const regShot = await window.webContents.capturePage();
    const regShotPath = path.join(artifactDir, "invoice_editor_registered_gstin_readonly_verified.png");
    fs.writeFileSync(regShotPath, regShot.toPNG());
    console.log("  Saved registered screenshot to:", regShotPath);

    console.log("TEST 3: Switching GST Supply dropdown manually...");
    const toggleCheck = await window.webContents.executeJavaScript(`
      (() => {
        const supplyType = document.querySelector('.transaction-editor [name="supplyType"]');
        const colGstin = document.querySelector('.transaction-editor .col-gstin');

        // Toggle to b2c
        supplyType.value = "b2c";
        supplyType.dispatchEvent(new Event("change", { bubbles: true }));
        const hiddenDisplay = window.getComputedStyle(colGstin).display;

        // Toggle to b2b
        supplyType.value = "b2b";
        supplyType.dispatchEvent(new Event("change", { bubbles: true }));
        const visibleDisplay = window.getComputedStyle(colGstin).display;

        return { hiddenDisplay, visibleDisplay };
      })()
    `);

    console.log("  Manual toggle check:", toggleCheck);
    assert.strictEqual(toggleCheck.hiddenDisplay, "none", "GSTIN col must hide when set to b2c");
    assert.notStrictEqual(toggleCheck.visibleDisplay, "none", "GSTIN col must show when set to b2b");

    console.log("\n===================================================================");
    console.log("  ALL GSTIN READONLY & REGISTERED USER TESTS PASSED SUCCESSFULLY!  ");
    console.log("===================================================================\n");

  } catch (err) {
    console.error("Test error:", err);
    process.exitCode = 1;
  } finally {
    window.close();
    app.quit();
  }
}

app.whenReady().then(runTest);
