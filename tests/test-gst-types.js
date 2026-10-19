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
    await new Promise((r) => setTimeout(r, 1200));

    // Open transaction editor
    await window.webContents.executeJavaScript(`
      (() => {
        openTransactionEditor("sale");
      })()
    `);
    await new Promise((r) => setTimeout(r, 500));

    // Verify tax options in the line item select
    const result = await window.webContents.executeJavaScript(`
      (() => {
        const taxSelect = document.querySelector('#transactionRows select[name="tax"]');
        const options = taxSelect ? [...taxSelect.options].map(o => o.value) : [];

        const expected = [
          "None",
          "IGST@0%",
          "GST@0%",
          "IGST@0.25%",
          "GST@0.25%",
          "IGST@3%",
          "GST@3%",
          "IGST@5%",
          "GST@5%",
          "IGST@12%",
          "GST@12%",
          "IGST@18%",
          "GST@18%",
          "IGST@28%",
          "GST@28%",
          "IGST@40%",
          "GST@40%",
          "Exempt"
        ];

        // Test calculation with GST@18%
        const row = document.querySelector('#transactionRows tr');
        row.querySelector('[name="qty"]').value = "1";
        row.querySelector('[name="price"]').value = "1000";
        row.querySelector('[name="tax"]').value = "GST@18%";
        recalcTransactionEditor();

        const cgst1 = document.getElementById("editorCgstTotal").textContent;
        const sgst1 = document.getElementById("editorSgstTotal").textContent;
        const igst1 = document.getElementById("editorIgstTotal").textContent;
        const total1 = document.getElementById("editorGrandTotal").value;

        // Test calculation with IGST@18%
        row.querySelector('[name="tax"]').value = "IGST@18%";
        recalcTransactionEditor();

        const cgst2 = document.getElementById("editorCgstTotal").textContent;
        const sgst2 = document.getElementById("editorSgstTotal").textContent;
        const igst2 = document.getElementById("editorIgstTotal").textContent;
        const total2 = document.getElementById("editorGrandTotal").value;

        // Test calculation with GST@0.25%
        row.querySelector('[name="price"]').value = "10000";
        row.querySelector('[name="tax"]').value = "GST@0.25%";
        recalcTransactionEditor();

        const cgst3 = document.getElementById("editorCgstTotal").textContent;
        const sgst3 = document.getElementById("editorSgstTotal").textContent;
        const total3 = document.getElementById("editorGrandTotal").value;

        // Test calculation with Exempt
        row.querySelector('[name="tax"]').value = "Exempt";
        recalcTransactionEditor();
        const taxTotalExempt = document.getElementById("editorTaxTotal").textContent;
        const totalExempt = document.getElementById("editorGrandTotal").value;

        return {
          optionsCount: options.length,
          options,
          matchesExpected: JSON.stringify(options) === JSON.stringify(expected),
          testGst18: { cgst: cgst1, sgst: sgst1, igst: igst1, total: total1 },
          testIgst18: { cgst: cgst2, sgst: sgst2, igst: igst2, total: total2 },
          testGst025: { cgst: cgst3, sgst: sgst3, total: total3 },
          testExempt: { taxTotal: taxTotalExempt, total: totalExempt }
        };
      })()
    `);

    console.log("GST TYPES VERIFICATION RESULT:", JSON.stringify(result, null, 2));

    // Reset row to show GST@18% and capture screenshot
    await window.webContents.executeJavaScript(`
      (() => {
        const row = document.querySelector('#transactionRows tr');
        row.querySelector('[name="item"]').value = "Industrial Fasteners M12";
        row.querySelector('[name="qty"]').value = "10";
        row.querySelector('[name="price"]').value = "800";
        row.querySelector('[name="tax"]').value = "GST@18%";
        recalcTransactionEditor();
      })()
    `);
    await new Promise((r) => setTimeout(r, 400));

    const img = await window.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "gst_types_verified.png"), img.toPNG());
    console.log("Saved gst_types_verified.png");

  } catch (err) {
    console.error("Test error:", err);
  } finally {
    window.destroy();
    app.quit();
  }
}

app.whenReady().then(run);
