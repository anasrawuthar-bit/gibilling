const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const assert = require("assert");

async function run() {
  const win = new BrowserWindow({
    show: false,
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity\\brain\\bed9650d-397d-4216-aa80-c0ae1c3c4fcb";
  const capturePath = path.join(artifactDir, "tax_and_toggle_verified.png");

  try {
    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 1200));

    // 1. Open quotation editor
    await win.webContents.executeJavaScript(`openTransactionEditor("estimate")`);
    await new Promise((r) => setTimeout(r, 600));

    // 2. Test Additional Fields toggle
    const toggleTest1 = await win.webContents.executeJavaScript(`(() => {
      const btn = document.querySelector("#toggleAdditionalFieldsBtn");
      const grid = document.querySelector("#editorAdditionalFieldsGrid");
      const initialDisplay = grid ? window.getComputedStyle(grid).display : null;

      // Click to hide
      btn.click();
      const hiddenDisplay = window.getComputedStyle(grid).display;
      const textAfterHide = btn.querySelector(".toggle-text")?.textContent;
      const isCollapsed = btn.classList.contains("collapsed");

      // Click to show again
      btn.click();
      const visibleDisplay = window.getComputedStyle(grid).display;
      const textAfterShow = btn.querySelector(".toggle-text")?.textContent;

      return {
        hasBtn: Boolean(btn),
        hasGrid: Boolean(grid),
        initialDisplay,
        hiddenDisplay,
        textAfterHide,
        isCollapsed,
        visibleDisplay,
        textAfterShow,
      };
    })()`);

    console.log("Toggle Test Result:", toggleTest1);
    assert.strictEqual(toggleTest1.hiddenDisplay, "none", "Grid should be hidden when toggle button is clicked!");
    assert.strictEqual(toggleTest1.textAfterHide, "Show", "Button text should be 'Show' when hidden!");
    assert.strictEqual(toggleTest1.isCollapsed, true, "Button should have class 'collapsed' when hidden!");
    assert.strictEqual(toggleTest1.visibleDisplay, "grid", "Grid should be grid when shown!");
    assert.strictEqual(toggleTest1.textAfterShow, "Hide", "Button text should be 'Hide' when shown!");
    console.log("✓ Additional Fields toggle verified 100%!");

    // 3. Test GST tax selection on party ajal and item monitor
    const taxTest = await win.webContents.executeJavaScript(`(() => {
      // Find party ajal or create if needed
      let ajal = (state.parties || []).find(p => p.name.toLowerCase().includes("ajal"));
      if (!ajal) {
        ajal = { name: "ajal", state: "Kerala", phone: "7736205024" };
      }
      selectTransactionParty(ajal);

      // Find item monitor or create
      let monitor = (state.items || []).find(i => i.name.toLowerCase().includes("monitor"));
      if (!monitor) {
        monitor = { id: 999, name: "monitor", taxRate: 18, taxType: "GST@18%", salePrice: 64654, unit: "Pcs" };
        state.items = state.items || [];
        state.items.push(monitor);
      }

      const row = document.querySelector("#transactionRows tr:first-child");
      const itemInput = row.querySelector('[name="item"]');
      itemInput.value = monitor.name;
      itemInput.dataset.selectedItemId = String(monitor.id);
      applyEditorItemIntelligence(row, false);
      recalcTransactionEditor();

      const taxSelect = row.querySelector('[name="tax"]');
      const taxVal = taxSelect ? taxSelect.value : null;

      const splitMode = editorTaxSplitMode();
      const placeOfSupply = elements.featureView.querySelector('[name="state"]')?.value;
      const firmState = state.businessSettings?.state;

      const cgstVal = document.getElementById("editorCgstTotal")?.textContent;
      const sgstVal = document.getElementById("editorSgstTotal")?.textContent;
      const igstVal = document.getElementById("editorIgstTotal")?.textContent;
      const grandTotalVal = document.getElementById("editorGrandTotal")?.value;

      return {
        splitMode,
        placeOfSupply,
        firmState,
        taxVal,
        cgstVal,
        sgstVal,
        igstVal,
        grandTotalVal,
      };
    })()`);

    console.log("Tax Test Result:", taxTest);
    assert.strictEqual(taxTest.taxVal, "GST@18%", "Line item tax should be GST@18%, NOT IGST@18%!");
    assert.strictEqual(taxTest.splitMode, "local", "Split mode should be local for Kerala to Kerala!");
    console.log("✓ GST tax selection verified 100%!");

    // Capture screenshot of the verified editor
    const image = await win.webContents.capturePage();
    fs.writeFileSync(capturePath, image.toPNG());
    console.log("✓ Screenshot saved to:", capturePath);

    console.log("\n=================================================");
    console.log("ALL TAX AND TOGGLE FIXES VERIFIED 100%!");
    console.log("=================================================");
    win.destroy();
    app.quit();
  } catch (err) {
    console.error("Test failed:", err);
    if (win) win.destroy();
    app.quit();
    process.exit(1);
  }
}

app.whenReady().then(run);
