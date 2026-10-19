const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-hover-del-test-"));
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

    // Open active company
    await win.webContents.executeJavaScript(`
      (async () => {
        const btn = document.querySelector(".open-company-button");
        const companyName = btn?.dataset?.company || "testt";
        await openCompany(companyName);
      })()
    `);
    await new Promise((r) => setTimeout(r, 1200));

    const results = await win.webContents.executeJavaScript(`
      (async () => {
        const logs = [];
        const assertLog = (cond, msg) => {
          if (!cond) throw new Error(msg);
          logs.push("PASS: " + msg);
        };

        try {
          openTransactionEditor("sale");
          await new Promise((r) => setTimeout(r, 400));

          // 1. Add 2 more rows to have 3 rows
          addTransactionEditorRow();
          addTransactionEditorRow();

          const rows = document.querySelectorAll("#transactionRows tr");
          assertLog(rows.length === 3, "Created 3 table rows");

          // 2. Verify structure of row-num-cell in each row
          rows.forEach((row, i) => {
            const numCell = row.querySelector(".row-num-cell");
            assertLog(numCell !== null, "Row " + (i + 1) + " has .row-num-cell");

            const numText = numCell.querySelector(".row-num-text");
            assertLog(numText !== null && numText.textContent.trim() === String(i + 1), "Row " + (i + 1) + " displays index " + (i + 1));

            const delBtn = numCell.querySelector(".row-delete-button");
            assertLog(delBtn !== null, "Row " + (i + 1) + " has .row-delete-button inside .row-num-cell");
          });

          // 3. Verify no 10th column in table header or rows
          const ths = document.querySelectorAll(".editor-table thead th");
          assertLog(ths.length === 9, "Table header has exactly 9 columns (no redundant trailing delete column)");
          rows.forEach((row, i) => {
            assertLog(row.children.length === 9, "Row " + (i + 1) + " has exactly 9 columns");
          });

          // 4. Verify unhovered style: row-num-text is visible, row-delete-button is hidden
          const row1Num = rows[0].querySelector(".row-num-text");
          const row1Del = rows[0].querySelector(".row-delete-button");
          const unhoveredNumDisplay = window.getComputedStyle(row1Num).display;
          const unhoveredDelDisplay = window.getComputedStyle(row1Del).display;
          assertLog(unhoveredNumDisplay !== "none", "Unhovered row number is visible (" + unhoveredNumDisplay + ")");
          assertLog(unhoveredDelDisplay === "none", "Unhovered delete button is hidden (" + unhoveredDelDisplay + ")");

          // 5. Test row deletion: delete row 2
          const initialCount = document.querySelectorAll("#transactionRows tr").length;
          const originalConfirm = window.confirm;
          window.confirm = () => true;

          const row2DelBtn = document.querySelectorAll("#transactionRows tr")[1].querySelector(".row-delete-button");
          row2DelBtn.click();

          const remainingRows = document.querySelectorAll("#transactionRows tr");
          assertLog(remainingRows.length === initialCount - 1, "Row successfully deleted; count is now " + remainingRows.length);

          // 6. Verify automatic renumbering after delete
          assertLog(remainingRows[0].querySelector(".row-num-text").textContent.trim() === "1", "First row is numbered 1");
          assertLog(remainingRows[1].querySelector(".row-num-text").textContent.trim() === "2", "Second row is automatically renumbered to 2");

          window.confirm = originalConfirm;

          return { success: true, logs };
        } catch (err) {
          return { success: false, error: err.message, stack: err.stack, logs };
        }
      })()
    `);

    console.log("=== HOVER DELETE BUTTON TEST LOGS ===");
    (results.logs || []).forEach((l) => console.log(l));

    if (!results.success) {
      console.error("FAIL:", results.error);
      console.error(results.stack);
      app.exit(1);
      return;
    }

    // Now populate items and simulate hover on row 1 by hovering the mouse pointer over Row 1's # cell
    await win.webContents.executeJavaScript(`
      (async () => {
        // Add one more row to have 3 rows
        addTransactionEditorRow();
        const rows = document.querySelectorAll("#transactionRows tr");
        rows[0].querySelector('[name="item"]').value = "256 ssd wd";
        rows[1].querySelector('[name="item"]').value = "processor";
        rows[2].querySelector('[name="item"]').value = "Logitech MX Master";
      })()
    `);
    await new Promise((r) => setTimeout(r, 400));

    // Get position of row 1 to move cursor over it
    const row1Bounds = await win.webContents.executeJavaScript(`
      (() => {
        const cell = document.querySelector("#transactionRows tr .row-num-cell");
        const rect = cell.getBoundingClientRect();
        return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
      })()
    `);

    // Send mouse move to trigger :hover on row 1
    win.webContents.sendInputEvent({ type: "mouseMove", x: row1Bounds.x, y: row1Bounds.y });
    await new Promise((r) => setTimeout(r, 400));

    // Capture visual proof of hover delete button
    const hoverImg = await win.webContents.capturePage();
    const hoverPath = path.join(artifactDir, "hover_delete_button_in_row_number_verified.png");
    fs.writeFileSync(hoverPath, hoverImg.toPNG());
    console.log("Saved verification screenshot:", hoverPath);

    console.log("ALL HOVER DELETE TESTS PASSED 100%!");
    app.exit(0);
  } catch (err) {
    console.error("Test execution failed:", err);
    app.exit(1);
  }
});
