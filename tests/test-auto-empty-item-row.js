const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const database = require("../database");

const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity-ide\\brain\\9dd39af8-a7ad-430b-8ee8-49729ceb732f";
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-auto-row-test-"));
app.setPath("userData", testRoot);

async function runAutoRowTest() {
  await database.initDatabase(testRoot);

  ipcMain.handle("db:get-state", () => database.getState());
  ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
  ipcMain.handle("db:create-party", (_event, party) => database.createParty(party));
  ipcMain.handle("db:create-item", (_event, item) => database.createItem(item));
  ipcMain.handle("db:create-transaction", (_event, txn) => database.createTransaction(txn));
  ipcMain.handle("db:preview-next-invoice-number", (_event, type, date) => database.previewNextInvoiceNumber(type, date));

  const win = new BrowserWindow({
    show: true,
    width: 1280,
    height: 850,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 800));

    // Open first company
    await win.webContents.executeJavaScript(`document.querySelector(".open-company-button").click(); undefined`);
    await new Promise((r) => setTimeout(r, 600));

    // Create test customer & test items
    await win.webContents.executeJavaScript(`
      (async () => {
        state = normalizeState(await window.giDB.createParty({
          name: "Acme Constructions",
          phone: "9876500001",
          type: "customer",
          taxType: "unregistered"
        }));
        state = normalizeState(await window.giDB.createItem({
          name: "Steel Rods 12mm",
          salePrice: 450,
          unit: "Pcs",
          taxRate: 18,
          taxType: "GST@18%"
        }));
        state = normalizeState(await window.giDB.createItem({
          name: "Cement Grade 53",
          salePrice: 380,
          unit: "Bags",
          taxRate: 28,
          taxType: "GST@28%"
        }));
      })()
    `);
    await new Promise((r) => setTimeout(r, 400));

    // Open sale invoice editor
    await win.webContents.executeJavaScript(`openTransactionEditor("sale"); undefined`);
    await new Promise((r) => setTimeout(r, 600));

    // 1. Initial check: exactly 1 empty row
    const initialRowsCount = await win.webContents.executeJavaScript(`
      document.querySelectorAll("#transactionRows tr").length
    `);
    console.log("Initial rows count:", initialRowsCount);
    assert.strictEqual(initialRowsCount, 1, "Initially there should be exactly 1 row");

    // 2. Select item for row 1
    const step1 = await win.webContents.executeJavaScript(`
      (() => {
        const rows = document.querySelectorAll("#transactionRows tr");
        const item1 = state.items.find(i => i.name === "Steel Rods 12mm");
        selectTransactionItem(rows[0], item1);

        const newRows = document.querySelectorAll("#transactionRows tr");
        const row1Item = newRows[0].querySelector('[name="item"]').value;
        const row2Item = newRows[1] ? newRows[1].querySelector('[name="item"]').value : null;

        return {
          totalRows: newRows.length,
          row1Item,
          row2Item,
          row1Num: newRows[0].querySelector(".row-num-text")?.textContent,
          row2Num: newRows[1]?.querySelector(".row-num-text")?.textContent
        };
      })()
    `);
    console.log("After selecting item on Row 1:", step1);
    assert.strictEqual(step1.totalRows, 2, "Row 2 must be automatically created when Row 1 is filled");
    assert.strictEqual(step1.row1Item, "Steel Rods 12mm", "Row 1 must have selected item");
    assert.strictEqual(step1.row2Item, "", "Row 2 must be empty for next entry");
    assert.strictEqual(step1.row1Num, "1", "Row 1 number should be 1");
    assert.strictEqual(step1.row2Num, "2", "Row 2 number should be 2");

    // 3. Select item for row 2
    const step2 = await win.webContents.executeJavaScript(`
      (() => {
        const rows = document.querySelectorAll("#transactionRows tr");
        const item2 = state.items.find(i => i.name === "Cement Grade 53");
        selectTransactionItem(rows[1], item2);

        const newRows = document.querySelectorAll("#transactionRows tr");
        return {
          totalRows: newRows.length,
          row2Item: newRows[1].querySelector('[name="item"]').value,
          row3Item: newRows[2] ? newRows[2].querySelector('[name="item"]').value : null,
          row3Num: newRows[2]?.querySelector(".row-num-text")?.textContent
        };
      })()
    `);
    console.log("After selecting item on Row 2:", step2);
    assert.strictEqual(step2.totalRows, 3, "Row 3 must be automatically created when Row 2 is filled");
    assert.strictEqual(step2.row2Item, "Cement Grade 53", "Row 2 must have Cement");
    assert.strictEqual(step2.row3Item, "", "Row 3 must be empty for next entry");
    assert.strictEqual(step2.row3Num, "3", "Row 3 number should be 3");

    // 4. Changing Row 1 item should NOT add duplicate empty rows
    const step3 = await win.webContents.executeJavaScript(`
      (() => {
        const rows = document.querySelectorAll("#transactionRows tr");
        const item2 = state.items.find(i => i.name === "Cement Grade 53");
        selectTransactionItem(rows[0], item2);

        const newRows = document.querySelectorAll("#transactionRows tr");
        return {
          totalRows: newRows.length
        };
      })()
    `);
    console.log("After changing Row 1 item:", step3);
    assert.strictEqual(step3.totalRows, 3, "Row count must remain 3 (no duplicate empty rows)");

    // Capture visual screenshot
    await new Promise((r) => setTimeout(r, 400));
    const shot = await win.webContents.capturePage();
    const shotPath = path.join(artifactDir, "invoice_auto_add_empty_row_verified.png");
    fs.writeFileSync(shotPath, shot.toPNG());
    console.log("Verified screenshot saved to:", shotPath);

    // 5. Save invoice and verify trailing empty row is ignored and does not block save
    const saveCheck = await win.webContents.executeJavaScript(`
      (async () => {
        const party = state.parties.find(p => p.name === "Acme Constructions");
        selectTransactionParty(party);

        const form = document.getElementById("transactionEditorForm");
        const validation = validateTransactionEditorSelections();

        return {
          valid: validation.valid,
          itemsCount: validation.rows.length,
          items: validation.rows.map(r => r.item.name)
        };
      })()
    `);
    console.log("Save validation check (ignoring trailing empty row):", saveCheck);
    assert.strictEqual(saveCheck.valid, true, "Validation must pass even with trailing empty row");
    assert.strictEqual(saveCheck.itemsCount, 2, "Only the 2 filled items should be processed");

    console.log("\n========================================================");
    console.log("  AUTO CREATE EMPTY ITEM ROW TEST PASSED 100%!         ");
    console.log("========================================================\n");

  } catch (err) {
    console.error("Test error:", err);
    process.exitCode = 1;
  } finally {
    win.close();
    app.quit();
  }
}

app.whenReady().then(runAutoRowTest);
