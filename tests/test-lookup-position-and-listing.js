const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-lookup-test-"));
app.setPath("userData", testRoot);

const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity\\brain\\bed9650d-397d-4216-aa80-c0ae1c3c4fcb";

app.whenReady().then(async () => {
  let win;
  try {
    await database.initDatabase(testRoot);

    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
    ipcMain.handle("db:get-last-active-company", () => database.getLastActiveCompany());

    win = new BrowserWindow({
      show: true,
      width: 1280,
      height: 800,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 800));

    // Setup active company and test items
    await win.webContents.executeJavaScript(`
      (async () => {
        const btn = document.querySelector(".open-company-button");
        const companyName = btn?.dataset?.company || "testt";
        await openCompany(companyName);
      })()
    `);
    await new Promise((r) => setTimeout(r, 1200));

    const testResults = await win.webContents.executeJavaScript(`
      (async () => {
        const logs = [];
        const assertLog = (cond, msg) => {
          if (!cond) throw new Error(msg);
          logs.push("PASS: " + msg);
        };

        try {
          state.items = [
            { id: 101, name: "256 ssd wd", salePrice: 4500, purchasePrice: 3500, currentStock: 0, unit: "Nos", category: "Computer Accessories", sku: "SSD-256" },
            { id: 102, name: "processor", salePrice: 0, purchasePrice: 0, currentStock: 9, unit: "Pcs", category: "Computer Accessories", sku: "1236" },
            { id: 103, name: "keyboard dell", salePrice: 800, purchasePrice: 500, currentStock: 15, unit: "Nos", category: "Peripherals", sku: "KB-01" }
          ];

          state.parties = [
            { id: 201, name: "techii", phone: "8476541513", type: "customer", balance: 2310 }
          ];

          openTransactionEditor("sale");
          await new Promise((r) => setTimeout(r, 500));

          // Verify NO Purchase Cost column in table header or rows
          const tableHeader = document.querySelector(".editor-table thead");
          assertLog(!tableHeader.textContent.includes("Purchase Cost"), "Table header omits 'Purchase Cost' column");

          // Add rows so we have 3 rows
          addTransactionEditorRow();
          addTransactionEditorRow();

          const rows = document.querySelectorAll("#transactionRows tr");
          assertLog(rows.length >= 3, "Created 3 table rows");

          // Set row 1 item to '256 ssd wd'
          const row1ItemInput = rows[0].querySelector('[name="item"]');
          row1ItemInput.value = "256 ssd wd";
          row1ItemInput.dispatchEvent(new Event("input", { bubbles: true }));

          // Set row 3 item to 'processor'
          const row3ItemInput = rows[2].querySelector('[name="item"]');
          row3ItemInput.value = "processor";
          row3ItemInput.dispatchEvent(new Event("input", { bubbles: true }));

          // Check stock line for row 1
          const row1Hint = rows[0].querySelector(".row-smart-hint")?.textContent || "";
          assertLog(row1Hint.includes("Cost ₹3,500"), "Row 1 stock hint line displays 'Cost ₹3,500': " + row1Hint);

          // Focus row 3 item input to trigger its lookup panel
          row3ItemInput.focus();
          renderItemLookupPanel(row3ItemInput);

          const row3Panel = rows[2].querySelector(".editor-item-lookup");
          assertLog(!row3Panel.classList.contains("hidden"), "Row 3 lookup panel is visible");

          // Check that row 1's lookup panel is NOT open
          const row1Panel = rows[0].querySelector(".editor-item-lookup");
          assertLog(row1Panel.classList.contains("hidden"), "Row 1 lookup panel is hidden while row 3 is open");

          // Check position of row 3 lookup panel:
          // It must NOT be placed at the top of the window near Customer Name!
          const row3Rect = row3ItemInput.getBoundingClientRect();
          const panelRect = row3Panel.getBoundingClientRect();
          // The panel must either be immediately below row 3 or immediately above row 3
          const isNearRow3 = (panelRect.top >= row3Rect.bottom - 10 && panelRect.top <= row3Rect.bottom + 20) ||
                             (panelRect.bottom <= row3Rect.top + 10 && panelRect.bottom >= row3Rect.top - 20);
          assertLog(isNearRow3, "Row 3 lookup panel is anchored right next to Row 3 (panel top: " + Math.round(panelRect.top) + ", bottom: " + Math.round(panelRect.bottom) + ", field top: " + Math.round(row3Rect.top) + ", field bottom: " + Math.round(row3Rect.bottom) + ")");

          // Now focus row 1 item input
          row1ItemInput.focus();
          renderItemLookupPanel(row1ItemInput);

          // Row 3's panel MUST now be hidden!
          assertLog(row3Panel.classList.contains("hidden"), "Row 3 lookup panel automatically closed when focusing row 1");
          assertLog(!row1Panel.classList.contains("hidden"), "Row 1 lookup panel is now visible");

          // Customer Name input should NOT have any item panel
          const partyPanel = document.querySelector("#editorPartyLookup");
          assertLog(partyPanel.classList.contains("hidden"), "Party lookup panel is hidden");

          // Now focus Customer Name input
          const partyInput = document.querySelector('[name="party"]');
          partyInput.focus();
          partyInput.value = "tech";
          handleEditorPartyLookupInput("party");

          // Row 1's item panel MUST be closed!
          assertLog(row1Panel.classList.contains("hidden"), "Row 1 lookup panel automatically closed when focusing Customer Name");
          assertLog(!partyPanel.classList.contains("hidden"), "Party lookup panel is now visible");

          // Now click on Qty input of row 1
          const qtyInput = rows[0].querySelector('[name="qty"]');
          qtyInput.focus();
          qtyInput.dispatchEvent(new Event("focusin", { bubbles: true }));

          // All panels must now be hidden!
          assertLog(row1Panel.classList.contains("hidden"), "Row 1 lookup panel hidden on Qty focus");
          assertLog(row3Panel.classList.contains("hidden"), "Row 3 lookup panel hidden on Qty focus");
          assertLog(partyPanel.classList.contains("hidden"), "Party lookup panel hidden on Qty focus");

          return { success: true, logs };
        } catch (err) {
          return { success: false, error: err.message, stack: err.stack, logs };
        }
      })()
    `);

    console.log("=== LISTING & POSITION TEST LOGS ===");
    (testResults.logs || []).forEach((l) => console.log(l));

    if (!testResults.success) {
      console.error("FAIL:", testResults.error);
      console.error(testResults.stack);
      app.exit(1);
      return;
    }

    // Now take a screenshot of row 1 item lookup cleanly open and table without Purchase Cost column
    await win.webContents.executeJavaScript(`
      (() => {
        const rows = document.querySelectorAll("#transactionRows tr");
        const row1ItemInput = rows[0].querySelector('[name="item"]');
        row1ItemInput.focus();
        row1ItemInput.value = "256";
        handleEditorItemLookupInput(row1ItemInput);
      })()
    `);
    await new Promise((r) => setTimeout(r, 600));

    const screenshotImg = await win.webContents.capturePage();
    const screenshotPath = path.join(artifactDir, "fixed_listing_and_no_purchase_cost_table.png");
    fs.writeFileSync(screenshotPath, screenshotImg.toPNG());
    console.log("Saved verification screenshot:", screenshotPath);

    console.log("ALL LISTING & POSITION TESTS PASSED 100%!");
    app.exit(0);
  } catch (err) {
    console.error("Test execution failed:", err);
    app.exit(1);
  }
});
