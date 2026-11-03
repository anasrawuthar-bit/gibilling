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

    console.log("Setting up party with address and opening transaction editor...");
    await window.webContents.executeJavaScript(`
      (() => {
        state.parties = [
          {
            id: 201,
            name: "Apex Precision Tools",
            phone: "9872131233",
            billingAddress: "Plot 42, Phase II, MIDC Industrial Area, Coimbatore 641001",
            shippingAddress: "Plot 42, Phase II, MIDC Industrial Area, Coimbatore 641001",
            gstin: "33AABCA1234A1Z5",
            state: "Tamil Nadu",
            type: "customer"
          }
        ];

        openTransactionEditor("sale");
      })()
    `);
    await new Promise((r) => setTimeout(r, 600));

    console.log("TEST 1: Verifying billing address is readonly and has tabindex=-1...");
    const initialCheck = await window.webContents.executeJavaScript(`
      (() => {
        const moreDetails = document.querySelector(".editor-unified-more-details");
        if (moreDetails) moreDetails.open = true;

        const address = document.querySelector('.transaction-editor [name="address"]');
        if (!address) return null;

        const computed = window.getComputedStyle(address);
        return {
          isReadonly: address.readOnly,
          tabIndex: address.getAttribute("tabindex"),
          tagName: address.tagName,
          placeholder: address.placeholder,
          resize: computed.resize,
          cursor: computed.cursor,
          backgroundColor: computed.backgroundColor
        };
      })()
    `);

    console.log("  Initial address field check:", initialCheck);
    assert.strictEqual(initialCheck.isReadonly, true, "Address input must be readonly");
    assert.strictEqual(initialCheck.tabIndex, "-1", "Address input must have tabindex='-1'");
    assert.strictEqual(initialCheck.resize, "none", "Address input must have resize: none");

    console.log("TEST 2: Selecting customer and verifying address auto-fills while remaining readonly...");
    const autoFilledCheck = await window.webContents.executeJavaScript(`
      (() => {
        const party = state.parties[0];
        selectTransactionParty(party);

        const address = document.querySelector('.transaction-editor [name="address"]');
        return {
          value: address.value,
          isReadonly: address.readOnly
        };
      })()
    `);

    console.log("  Autofilled address:", autoFilledCheck);
    assert.strictEqual(autoFilledCheck.value, "Plot 42, Phase II, MIDC Industrial Area, Coimbatore 641001");
    assert.strictEqual(autoFilledCheck.isReadonly, true, "Address must remain readonly after autofill");

    console.log("TEST 3: Capturing verified screenshot of invoice editor with readonly address...");
    await new Promise((r) => setTimeout(r, 400));
    const shot = await window.webContents.capturePage();
    const shotPath = path.join(artifactDir, "invoice_editor_address_readonly_verified.png");
    fs.writeFileSync(shotPath, shot.toPNG());
    console.log("  Saved screenshot to:", shotPath);

    console.log("TEST 4: Clearing party input and verifying address is cleared...");
    const clearCheck = await window.webContents.executeJavaScript(`
      (() => {
        const partyInput = document.querySelector('.transaction-editor [name="party"]');
        partyInput.value = "";
        delete partyInput.dataset.selectedPartyId;
        applyEditorPartyIntelligence();

        const address = document.querySelector('.transaction-editor [name="address"]');
        return {
          value: address.value,
          isReadonly: address.readOnly
        };
      })()
    `);

    console.log("  After clearing party:", clearCheck);
    assert.strictEqual(clearCheck.value, "", "Address should be cleared when party is cleared");
    assert.strictEqual(clearCheck.isReadonly, true, "Address must stay readonly");

    console.log("\n=======================================================");
    console.log("  ALL ADDRESS READONLY TESTS PASSED SUCCESSFULLY!      ");
    console.log("=======================================================\n");

  } catch (err) {
    console.error("Test error:", err);
    process.exitCode = 1;
  } finally {
    window.close();
    app.quit();
  }
}

app.whenReady().then(runTest);
