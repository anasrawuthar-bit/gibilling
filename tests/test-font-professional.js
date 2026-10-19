const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

async function run() {
  const window = new BrowserWindow({
    show: true,
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity\\brain\\bed9650d-397d-4216-aa80-c0ae1c3c4fcb";

  try {
    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 1500));

    // Check font status in the document
    const fontMetrics = await window.webContents.executeJavaScript(`
      (async () => {
        await document.fonts.ready;
        const bodyFont = window.getComputedStyle(document.body).fontFamily;
        const isInterLoaded = document.fonts.check("13px Inter");
        const loadedFonts = [];
        document.fonts.forEach(f => {
          loadedFonts.push({
            family: f.family,
            status: f.status,
            weight: f.weight,
            style: f.style
          });
        });

        // Also check table, headings, inputs
        const h1 = document.querySelector("h1, h2, .view-title");
        const th = document.querySelector("th, td");
        const input = document.querySelector("input");

        return {
          bodyFont,
          isInterLoaded,
          loadedFonts,
          h1LetterSpacing: h1 ? window.getComputedStyle(h1).letterSpacing : null,
          thFontFeatureSettings: th ? window.getComputedStyle(th).fontFeatureSettings : null
        };
      })()
    `);

    console.log("FONT VERIFICATION METRICS:", JSON.stringify(fontMetrics, null, 2));

    // Capture Sales / Dashboard view
    await window.webContents.executeJavaScript(`
      (() => {
        showView("sales");
      })()
    `);
    await new Promise((r) => setTimeout(r, 800));
    const imgSales = await window.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "professional_font_sales_view.png"), imgSales.toPNG());
    console.log("Saved professional_font_sales_view.png");

    // Capture Purchases view
    await window.webContents.executeJavaScript(`
      (() => {
        showView("purchases");
      })()
    `);
    await new Promise((r) => setTimeout(r, 800));
    const imgPurchases = await window.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "professional_font_purchases_view.png"), imgPurchases.toPNG());
    console.log("Saved professional_font_purchases_view.png");

    // Capture Transaction Editor / Invoice
    await window.webContents.executeJavaScript(`
      (() => {
        openTransactionEditor("sale");
      })()
    `);
    await new Promise((r) => setTimeout(r, 800));
    const imgEditor = await window.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "professional_font_invoice_editor.png"), imgEditor.toPNG());
    console.log("Saved professional_font_invoice_editor.png");

  } catch (err) {
    console.error("Test error:", err);
  } finally {
    window.destroy();
    app.quit();
  }
}

app.whenReady().then(run);
