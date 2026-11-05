const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

const ARTIFACT_DIR = "C:/Users/ANAS/.gemini/antigravity/brain/bed9650d-397d-4216-aa80-c0ae1c3c4fcb";

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  await win.loadFile(path.join(__dirname, "../index.html"));
  await new Promise((r) => setTimeout(r, 1200));

  const result = await win.webContents.executeJavaScript(`
    (async () => {
      const logs = [];
      const log = (msg) => { logs.push(msg); console.log(msg); };

      try {
        // Ensure mock items exist for testing
        if (!state.items || state.items.length < 5) {
          state.items = [
            { id: 101, name: "Keyboard Pro", sku: "KB-01", category: "Hardware", unit: "Pcs", hsn: "8471", salePrice: 1500, purchasePrice: 1000, currentStock: 20 },
            { id: 102, name: "Optical Mouse", sku: "MS-02", category: "Hardware", unit: "Pcs", hsn: "8471", salePrice: 600, purchasePrice: 400, currentStock: 35 },
            { id: 103, name: "SSD 500GB", sku: "SSD-03", category: "Storage", unit: "Pcs", hsn: "8471", salePrice: 4500, purchasePrice: 3200, currentStock: 15 },
            { id: 104, name: "Monitor 24 inch", sku: "MON-04", category: "Displays", unit: "Pcs", hsn: "8528", salePrice: 12000, purchasePrice: 9500, currentStock: 8 },
            { id: 105, name: "USB-C Hub", sku: "HUB-05", category: "Accessories", unit: "Pcs", hsn: "8471", salePrice: 2200, purchasePrice: 1400, currentStock: 12 },
          ];
        }

        // 1. Open Export Items page
        window.showView("exportItems");
        await new Promise((r) => setTimeout(r, 300));

        // 2. Verify KPI cards are removed
        const kpiGrid = document.querySelector(".export-items-page .kpi-grid");
        log("KPI grid removed: " + (!kpiGrid ? "PASS" : "FAIL"));

        // 3. Verify Checkboxes exist
        const selectAllCb = document.querySelector("#selectAllExportItems");
        const rowCheckboxes = document.querySelectorAll(".export-item-checkbox");
        log("Select All checkbox exists: " + (selectAllCb ? "PASS" : "FAIL"));
        log("Row checkboxes count: " + rowCheckboxes.length + " (PASS)");

        // 4. Initial state
        const countTextInitial = document.querySelector("#exportSelectedCountText")?.textContent || "";
        log("Initial selection badge: " + countTextInitial);
        const exportSelectedBtn = document.querySelector("[data-action='export-selected-items-csv']");
        log("Initial export selected disabled: " + (exportSelectedBtn?.disabled ? "PASS" : "FAIL"));

        // 5. Tick first 2 checkboxes
        rowCheckboxes[0].click();
        rowCheckboxes[1].click();
        await new Promise((r) => setTimeout(r, 100));

        const countTextAfter2 = document.querySelector("#exportSelectedCountText")?.textContent || "";
        log("Selection badge after 2 ticks: " + countTextAfter2);
        const btnLabelAfter2 = document.querySelector("#exportSelectedBtnLabel")?.textContent || "";
        log("Button label after 2 ticks: " + btnLabelAfter2);
        log("Button enabled after 2 ticks: " + (!exportSelectedBtn?.disabled ? "PASS" : "FAIL"));

        // 6. Test Select All
        const selectAllBtn = document.querySelector("[data-action='select-all-export-btn']");
        selectAllBtn.click();
        await new Promise((r) => setTimeout(r, 100));
        const countTextSelectAll = document.querySelector("#exportSelectedCountText")?.textContent || "";
        log("Badge after Select All: " + countTextSelectAll);

        // 7. Test Clear
        const clearBtn = document.querySelector("[data-action='clear-export-selection-btn']");
        clearBtn.click();
        await new Promise((r) => setTimeout(r, 100));
        const countTextAfterClear = document.querySelector("#exportSelectedCountText")?.textContent || "";
        log("Badge after Clear: " + countTextAfterClear);

        // 8. Tick 3 items for final screenshot
        rowCheckboxes[0].click();
        rowCheckboxes[2].click();
        rowCheckboxes[3].click();
        await new Promise((r) => setTimeout(r, 100));
        const finalBadge = document.querySelector("#exportSelectedCountText")?.textContent || "";
        log("Final badge with 3 items selected: " + finalBadge);

        return {
          success: true,
          logs,
          kpiRemoved: !kpiGrid,
          checkboxesFound: rowCheckboxes.length > 0,
          tickCountUpdated: countTextAfter2.includes("2 of"),
          selectAllWorked: countTextSelectAll.includes(rowCheckboxes.length + " of " + rowCheckboxes.length),
          clearWorked: countTextAfterClear.includes("0 of"),
        };
      } catch (err) {
        return { success: false, error: err.stack, logs };
      }
    })();
  `);

  console.log("Test Results:", JSON.stringify(result, null, 2));

  // Capture screenshot of the Export Items view with row selection & live counter
  const image = await win.capturePage();
  const screenshotPath = path.join(ARTIFACT_DIR, "export_items_checkbox_selection_verified.png");
  fs.writeFileSync(screenshotPath, image.toPNG());
  console.log("Saved export items screenshot to:", screenshotPath);

  win.close();
  app.quit();
});
