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
  const capturePathIn = path.join(artifactDir, "payment_in_no_payments_kpi.png");
  const capturePathOut = path.join(artifactDir, "payment_out_no_payments_kpi.png");

  try {
    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 1200));

    // 1. Show paymentIn view
    await win.webContents.executeJavaScript(`showView("paymentIn")`);
    await new Promise((r) => setTimeout(r, 500));

    const inResult = await win.webContents.executeJavaScript(`(() => {
      const cards = Array.from(document.querySelectorAll(".kpi-grid .kpi-card"));
      const titles = cards.map(c => c.querySelector(".kpi-title")?.textContent?.trim() || "");
      const hasPaymentsCard = titles.some(t => t.toLowerCase() === "payments");
      return {
        cardCount: cards.length,
        titles,
        hasPaymentsCard
      };
    })()`);

    console.log("Payment-In KPI check:", inResult);
    assert.strictEqual(inResult.cardCount, 3, "Payment-In should have exactly 3 KPI cards");
    assert.strictEqual(inResult.hasPaymentsCard, false, "Payment-In should NOT have 'Payments' card");
    console.log("✓ Payment-In verified!");

    const imageIn = await win.webContents.capturePage();
    fs.writeFileSync(capturePathIn, imageIn.toPNG());
    console.log("✓ Saved screenshot:", capturePathIn);

    // 2. Show paymentOut view
    await win.webContents.executeJavaScript(`showView("paymentOut")`);
    await new Promise((r) => setTimeout(r, 500));

    const outResult = await win.webContents.executeJavaScript(`(() => {
      const cards = Array.from(document.querySelectorAll(".kpi-grid .kpi-card"));
      const titles = cards.map(c => c.querySelector(".kpi-title")?.textContent?.trim() || "");
      const hasPaymentsCard = titles.some(t => t.toLowerCase() === "payments");
      return {
        cardCount: cards.length,
        titles,
        hasPaymentsCard
      };
    })()`);

    console.log("Payment-Out KPI check:", outResult);
    assert.strictEqual(outResult.cardCount, 3, "Payment-Out should have exactly 3 KPI cards");
    assert.strictEqual(outResult.hasPaymentsCard, false, "Payment-Out should NOT have 'Payments' card");
    console.log("✓ Payment-Out verified!");

    const imageOut = await win.webContents.capturePage();
    fs.writeFileSync(capturePathOut, imageOut.toPNG());
    console.log("✓ Saved screenshot:", capturePathOut);

    console.log("\n=================================================");
    console.log("PAYMENTS KPI CARD REMOVAL VERIFIED 100%!");
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
