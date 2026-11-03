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

    console.log("TEST 1: Opening Invoice Editor...");
    const initialCheck = await window.webContents.executeJavaScript(`
      (() => {
        state.parties = [
          {
            id: 301,
            name: "Consumer Walkin",
            phone: "9872131233",
            taxType: "unregistered",
            type: "customer"
          },
          {
            id: 302,
            name: "Apex Precision Tools Ltd",
            phone: "9845012345",
            gstin: "33AABCA1234A1Z5",
            billingAddress: "Plot 42, Phase II, Coimbatore 641001",
            taxType: "gst_registered",
            type: "customer"
          }
        ];

        openTransactionEditor("sale");

        const editor = document.querySelector(".transaction-editor");
        const supplyCol = editor.querySelector(".col-doc-supply");
        const hiddenSupplyInput = editor.querySelector('input[name="supplyType"]');
        const primaryRow = editor.querySelector(".editor-unified-primary-row");
        const allLabels = Array.from(editor.querySelectorAll(".editor-compact-label span")).map(s => s.textContent.trim());

        // Check if any visible text says "GST Supply"
        const hasGstSupplyLabel = allLabels.some(t => t.includes("GST Supply"));

        // Get visible children in primaryRow
        const visibleCols = Array.from(primaryRow.children).filter(el => {
          return el.tagName !== "INPUT" || el.type !== "hidden";
        }).map(el => el.className);

        return {
          hasSupplyCol: Boolean(supplyCol),
          hasHiddenSupplyInput: Boolean(hiddenSupplyInput),
          hiddenSupplyType: hiddenSupplyInput?.type,
          hiddenSupplyValue: hiddenSupplyInput?.value,
          hasGstSupplyLabel,
          visibleColsCount: visibleCols.length,
          visibleCols
        };
      })()
    `);

    console.log("  Initial check:", initialCheck);
    assert.strictEqual(initialCheck.hasSupplyCol, false, "Must NOT have .col-doc-supply");
    assert.strictEqual(initialCheck.hasGstSupplyLabel, false, "Must NOT have visible 'GST Supply' label");
    assert.strictEqual(initialCheck.hasHiddenSupplyInput, true, "Must have hidden supplyType input");
    assert.strictEqual(initialCheck.hiddenSupplyType, "hidden", "supplyType input must be type=hidden");
    assert.strictEqual(initialCheck.hiddenSupplyValue, "b2c", "Default supplyType must be b2c");
    assert.strictEqual(initialCheck.visibleColsCount, 5, "Primary row must have exactly 5 visible columns");

    console.log("TEST 2: Selecting registered customer (Apex Precision Tools Ltd)...");
    const registeredCheck = await window.webContents.executeJavaScript(`
      (() => {
        const party = state.parties.find(p => p.id === 302);
        selectTransactionParty(party);

        const hiddenSupplyInput = document.querySelector('.transaction-editor input[name="supplyType"]');
        return {
          hiddenSupplyValue: hiddenSupplyInput?.value
        };
      })()
    `);

    console.log("  Registered customer check:", registeredCheck);
    assert.strictEqual(registeredCheck.hiddenSupplyValue, "b2b", "Selecting registered customer must update supplyType to b2b");

    // Take screenshot of invoice editor
    await new Promise((r) => setTimeout(r, 400));
    const shot = await window.webContents.capturePage();
    const shotPath = path.join(artifactDir, "invoice_page_no_gst_supply_verified.png");
    fs.writeFileSync(shotPath, shot.toPNG());
    console.log("  Saved invoice page screenshot to:", shotPath);

    console.log("=================================================");
    console.log("  ALL NO GST SUPPLY IN INVOICE PAGE TESTS PASSED!  ");
    console.log("=================================================");
  } catch (err) {
    console.error("Test failed:", err);
    process.exitCode = 1;
  } finally {
    window.close();
    app.quit();
  }
}

app.whenReady().then(runTest);
