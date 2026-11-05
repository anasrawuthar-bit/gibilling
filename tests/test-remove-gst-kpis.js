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
  const capturePathExp = path.join(artifactDir, "expenses_no_gst_kpi.png");
  const capturePathEst = path.join(artifactDir, "estimate_no_gst_kpi.png");

  try {
    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 1200));

    // 1. Test Expenses view
    await win.webContents.executeJavaScript(`showView("expenses")`);
    await new Promise((r) => setTimeout(r, 500));

    const expResult = await win.webContents.executeJavaScript(`(() => {
      const cards = Array.from(document.querySelectorAll(".kpi-grid .kpi-card"));
      const titles = cards.map(c => c.querySelector(".kpi-title")?.textContent?.trim() || "");
      const hasGstCard = titles.some(t => t.toLowerCase().includes("gst") || t.toLowerCase().includes("tax"));
      return { cardCount: cards.length, titles, hasGstCard };
    })()`);

    console.log("Expenses KPI check:", expResult);
    assert.strictEqual(expResult.cardCount, 3, "Expenses should have exactly 3 KPI cards");
    assert.strictEqual(expResult.hasGstCard, false, "Expenses should NOT have GST card");
    console.log("✓ Expenses verified!");

    const imageExp = await win.webContents.capturePage();
    fs.writeFileSync(capturePathExp, imageExp.toPNG());
    console.log("✓ Saved screenshot:", capturePathExp);

    // 2. Test Estimate / Quotation view
    await win.webContents.executeJavaScript(`showView("estimate")`);
    await new Promise((r) => setTimeout(r, 500));

    const estResult = await win.webContents.executeJavaScript(`(() => {
      const cards = Array.from(document.querySelectorAll(".kpi-grid .kpi-card"));
      const titles = cards.map(c => c.querySelector(".kpi-title")?.textContent?.trim() || "");
      const hasGstCard = titles.some(t => t.toLowerCase().includes("gst") || t.toLowerCase().includes("tax"));
      return { cardCount: cards.length, titles, hasGstCard };
    })()`);

    console.log("Estimate KPI check:", estResult);
    assert.strictEqual(estResult.cardCount, 3, "Estimate should have exactly 3 KPI cards");
    assert.strictEqual(estResult.hasGstCard, false, "Estimate should NOT have GST card");
    console.log("✓ Estimate verified!");

    const imageEst = await win.webContents.capturePage();
    fs.writeFileSync(capturePathEst, imageEst.toPNG());
    console.log("✓ Saved screenshot:", capturePathEst);

    // 3. Test Sale Return / Credit Note view
    await win.webContents.executeJavaScript(`showView("saleReturn")`);
    await new Promise((r) => setTimeout(r, 500));

    const srResult = await win.webContents.executeJavaScript(`(() => {
      const cards = Array.from(document.querySelectorAll(".kpi-grid .kpi-card"));
      const titles = cards.map(c => c.querySelector(".kpi-title")?.textContent?.trim() || "");
      const hasGstCard = titles.some(t => t.toLowerCase().includes("gst") || t.toLowerCase().includes("tax"));
      return { cardCount: cards.length, titles, hasGstCard };
    })()`);

    console.log("Sale Return KPI check:", srResult);
    assert.strictEqual(srResult.cardCount, 3, "Sale Return should have exactly 3 KPI cards");
    assert.strictEqual(srResult.hasGstCard, false, "Sale Return should NOT have GST card");
    console.log("✓ Sale Return verified!");

    // 4. Test Purchase Return / Debit Note view
    await win.webContents.executeJavaScript(`showView("purchaseReturn")`);
    await new Promise((r) => setTimeout(r, 500));

    const prResult = await win.webContents.executeJavaScript(`(() => {
      const cards = Array.from(document.querySelectorAll(".kpi-grid .kpi-card"));
      const titles = cards.map(c => c.querySelector(".kpi-title")?.textContent?.trim() || "");
      const hasGstCard = titles.some(t => t.toLowerCase().includes("gst") || t.toLowerCase().includes("tax"));
      return { cardCount: cards.length, titles, hasGstCard };
    })()`);

    console.log("Purchase Return KPI check:", prResult);
    assert.strictEqual(prResult.cardCount, 3, "Purchase Return should have exactly 3 KPI cards");
    assert.strictEqual(prResult.hasGstCard, false, "Purchase Return should NOT have GST card");
    console.log("✓ Purchase Return verified!");

    console.log("\n=================================================");
    console.log("ALL GST KPI CARD REMOVALS VERIFIED 100%!");
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
