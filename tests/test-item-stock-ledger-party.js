const { app, BrowserWindow } = require("electron");
const path = require("path");
const assert = require("assert");
const fs = require("fs");

const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity\\brain\\bed9650d-397d-4216-aa80-c0ae1c3c4fcb";

async function runTest() {
  const window = new BrowserWindow({
    show: true,
    width: 1366,
    height: 820,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  try {
    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 1000));

    await window.webContents.executeJavaScript(`
      (() => {
        state.parties = [
          { id: 1, name: "Bharat Suppliers Corp", phone: "9876543210", type: "supplier" },
          { id: 2, name: "rafi", phone: "9123456780", type: "customer" },
          { id: 3, name: "cust", phone: "9856541257", type: "customer" }
        ];

        state.items = [
          { id: 10, name: "mouse", sku: "MOU-01", currentStock: 9, purchasePrice: 265, salePrice: 780, unit: "Pcs", itemType: "product", category: "Computer Accessories" }
        ];

        state.invoices = [
          { id: "inv-p1", invoiceNo: "billbo09898/78/56", type: "purchase", party: "Bharat Suppliers Corp", date: "2026-09-20", total: 2650, balance: 0 },
          { id: "inv-p2", invoiceNo: "PUR-2026-002", type: "purchase", party: "Bharat Suppliers Corp", date: "2026-09-20", total: 780, balance: 0 },
          { id: "inv-s1", invoiceNo: "INV-2627-0002", type: "sale", party: "rafi", date: "2026-09-20", total: 6500, balance: 680 },
          { id: "inv-s2", invoiceNo: "INV-2627-0006", type: "sale", party: "cust", date: "2026-09-20", total: 780, balance: 0 }
        ];

        state.stockMovements = [
          { id: 1, itemId: 10, movementType: "in", quantity: 10, rate: 265, movementDate: "2026-09-20", invoiceId: "inv-p1" },
          { id: 2, itemId: 10, movementType: "in", quantity: 1, rate: 780, movementDate: "2026-09-20", transactionId: "inv-p2" },
          { id: 3, itemId: 10, movementType: "out", quantity: 1, rate: 6500, movementDate: "2026-09-20", invoiceId: "inv-s1" },
          { id: 4, itemId: 10, movementType: "out", quantity: 1, rate: 780, movementDate: "2026-09-20", invoiceId: "inv-s2" }
        ];

        showView("items");
      })()
    `);
    await new Promise((r) => setTimeout(r, 600));

    const check = await window.webContents.executeJavaScript(`
      (() => {
        const table = document.querySelector(".item-stock-ledger-table table");
        if (!table) return null;
        const ths = Array.from(table.querySelectorAll("thead th")).map(th => th.textContent.trim().replace(/[▲▼↕]/g, "").trim());
        const rows = Array.from(table.querySelectorAll("tbody tr")).map(tr => {
          const partyEl = tr.querySelector(".ledger-party-name");
          const refEl = tr.querySelector(".ledger-ref-badge");
          return {
            date: tr.cells[0]?.textContent.trim(),
            type: tr.cells[1]?.textContent.trim(),
            party: partyEl?.textContent.trim() || tr.cells[2]?.textContent.trim(),
            ref: refEl?.textContent.trim() || "",
            qtyIn: tr.cells[3]?.textContent.trim(),
            qtyOut: tr.cells[4]?.textContent.trim(),
            rate: tr.cells[5]?.textContent.trim()
          };
        });
        return { headers: ths, rows };
      })()
    `);

    console.log("Headers:", check.headers);
    console.log("Rows:", JSON.stringify(check.rows, null, 2));

    assert(check.headers.includes("Party"), "Table header must have 'Party' column instead of 'Reference'");
    assert(!check.headers.includes("Reference"), "Header must NOT say 'Reference'");

    assert.strictEqual(check.rows.length, 4, "Must render 4 rows");
    assert(check.rows.some(r => r.party === "Bharat Suppliers Corp"), "Must show Bharat Suppliers Corp");
    assert(check.rows.some(r => r.party === "rafi"), "Must show rafi");
    assert(check.rows.some(r => r.party === "cust"), "Must show cust");

    // Capture visual artifact
    await new Promise((r) => setTimeout(r, 400));
    const image = await window.webContents.capturePage();
    const capturePath = path.join(artifactDir, "item_stock_ledger_party_verified.png");
    fs.writeFileSync(capturePath, image.toPNG());
    console.log("Saved screenshot to:", capturePath);

    console.log("ALL ITEM STOCK LEDGER PARTY CHECKS PASSED!");
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  } finally {
    window.close();
    app.quit();
  }
}

app.whenReady().then(runTest);
