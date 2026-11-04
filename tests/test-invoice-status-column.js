const { app, BrowserWindow } = require("electron");
const path = require("path");
const assert = require("assert");
const fs = require("fs");

const screenshotDir = path.join(
  "C:",
  "Users",
  "ANAS",
  ".gemini",
  "antigravity",
  "brain",
  "bed9650d-397d-4216-aa80-c0ae1c3c4fcb"
);

app.whenReady().then(async () => {
  let win = null;
  try {
    win = new BrowserWindow({
      show: false,
      width: 1366,
      height: 768,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: false,
        nodeIntegration: true,
      },
    });

    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 1000));

    console.log("Navigating to Sale Invoices workspace...");
    await win.webContents.executeJavaScript(`
      (() => {
        state.parties = [
          { id: 1, name: "Alpha Traders", phone: "9876543210", balance: 0, state: "Kerala" },
          { id: 2, name: "Beta Enterprises", phone: "9876543211", balance: 0, state: "Kerala" }
        ];
        state.invoices = [
          {
            id: "inv-1",
            invoiceNo: "INV-2627-0001",
            type: "sale",
            party: "Alpha Traders",
            total: 5000,
            received: 5000,
            balance: 0,
            status: "paid",
            date: new Date().toISOString()
          },
          {
            id: "inv-2",
            invoiceNo: "INV-2627-0002",
            type: "sale",
            party: "Beta Enterprises",
            total: 10000,
            received: 4000,
            balance: 6000,
            status: "partially_paid",
            date: new Date().toISOString()
          }
        ];
        showView("sales");
      })()
    `);
    await new Promise((r) => setTimeout(r, 600));

    const check = await win.webContents.executeJavaScript(`
      (() => {
        const table = document.querySelector(".invoice-modern-table");
        if (!table) return null;
        const headers = Array.from(table.querySelectorAll("thead th")).map(th => th.textContent.trim().replace(/\\s+/g, " "));
        const statusBadges = Array.from(table.querySelectorAll("tbody .invoice-status")).map(b => b.textContent.trim());
        const kpis = Array.from(document.querySelectorAll(".invoice-kpis .kpi-card span")).map(el => el.textContent.trim());
        return {
          headers,
          statusBadges,
          kpis,
        };
      })()
    `);

    assert.ok(check, "Table should exist");
    console.log("Table headers:", check.headers);
    console.log("Status badges:", check.statusBadges);
    console.log("KPIs:", check.kpis);

    // Verify "Status" is present in headers
    const hasStatus = check.headers.some(h => h.includes("Status"));
    assert.strictEqual(hasStatus, true, "Status column must be present in table headers");

    // Verify "Received" is NOT a table column header
    const hasReceivedCol = check.headers.some(h => h.toLowerCase().startsWith("received"));
    assert.strictEqual(hasReceivedCol, false, "Received column must NOT be present in table headers");

    // Verify Status badges exist in tbody
    assert.strictEqual(check.statusBadges.length, 2, "Must render 2 status badges in table");
    assert.ok(check.statusBadges.includes("Paid"));
    assert.ok(check.statusBadges.includes("Part Paid"));

    // Verify GST / Tax KPI card is absent
    const hasGstKpi = check.kpis.some(k => k.toLowerCase().includes("gst"));
    assert.strictEqual(hasGstKpi, false, "GST / Tax KPI card must remain absent");

    // Capture screenshot artifact
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(screenshotDir, "clean_sale_invoices_status_column_verified.png"), img.toPNG());
    console.log("✓ Saved clean_sale_invoices_status_column_verified.png");

    console.log("\nALL STATUS COLUMN TESTS PASSED PERFECTLY!");
    win.close();
    app.quit();
  } catch (err) {
    console.error("Test failed:", err);
    if (win) win.close();
    process.exit(1);
  }
});
