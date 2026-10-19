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
    await new Promise((r) => setTimeout(r, 1000));

    // Show purchases view
    await window.webContents.executeJavaScript(`
      (() => {
        showView("purchases");
      })()
    `);
    await new Promise((r) => setTimeout(r, 500));

    // Test 1: Single combined popup for Purchase Bill Saved + Payment Recorded
    const toastData = await window.webContents.executeJavaScript(`
      (() => {
        showToast({
          title: "Purchase Bill Saved",
          message: "Payment of ₹4,130 recorded.",
          type: "success"
        });

        const host = document.getElementById("toastHost");
        const toasts = host ? host.querySelectorAll(".toast-message") : [];
        const first = toasts[0];
        const rect = first ? first.getBoundingClientRect() : null;
        const hostRect = host ? host.getBoundingClientRect() : null;

        return {
          toastCount: toasts.length,
          title: first?.querySelector(".toast-title")?.textContent,
          detail: first?.querySelector(".toast-detail")?.textContent,
          hasIcon: Boolean(first?.querySelector(".toast-icon-wrap svg")),
          hasCloseBtn: Boolean(first?.querySelector(".toast-close-btn")),
          hostTop: hostRect?.top,
          hostRight: window.innerWidth - (hostRect?.right || 0),
          toastTop: rect?.top,
          toastRight: window.innerWidth - (rect?.right || 0),
          width: rect?.width,
          height: rect?.height
        };
      })()
    `);

    console.log("TOAST 1 METRICS:", JSON.stringify(toastData, null, 2));

    await new Promise((r) => setTimeout(r, 400));
    const inspectState = await window.webContents.executeJavaScript(`
      (() => {
        const toast = document.querySelector(".toast-message");
        return {
          classes: toast?.className,
          opacity: toast ? window.getComputedStyle(toast).opacity : null,
          display: toast ? window.getComputedStyle(toast).display : null,
          zIndex: toast ? window.getComputedStyle(toast).zIndex : null,
          rect: toast ? toast.getBoundingClientRect() : null
        };
      })()
    `);
    console.log("INSPECT TOAST STATE BEFORE CAPTURE:", inspectState);

    const img1 = await window.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "neat_top_corner_toast_box.png"), img1.toPNG());
    console.log("Saved neat_top_corner_toast_box.png");

    // Test 2: Sequential calls auto-merging ("Invoice saved." then "Payment recorded.")
    const mergeData = await window.webContents.executeJavaScript(`
      (() => {
        document.querySelectorAll(".toast-message").forEach(el => el.remove());

        showToast("Invoice saved.");
        showToast("Payment recorded.");

        const host = document.getElementById("toastHost");
        const toasts = host ? host.querySelectorAll(".toast-message") : [];
        const first = toasts[0];

        return {
          toastCount: toasts.length,
          title: first?.querySelector(".toast-title")?.textContent,
          detail: first?.querySelector(".toast-detail")?.textContent,
          mergedIntoOne: toasts.length === 1
        };
      })()
    `);
    console.log("MERGE TEST RESULT:", JSON.stringify(mergeData, null, 2));

  } catch (err) {
    console.error("Test error:", err);
  } finally {
    window.destroy();
    app.quit();
  }
}

app.whenReady().then(run);
