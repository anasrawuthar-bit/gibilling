const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

async function run() {
  const window = new BrowserWindow({
    show: false,
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

    const metrics = await window.webContents.executeJavaScript(`
      (() => {
        openBankAccountModal();
        const modal = document.querySelector(".bank-modal-revamp");
        const saveBtn = document.querySelector(".bank-save-btn");
        const saveSvg = saveBtn ? saveBtn.querySelector("svg") : null;
        const prevHeaderSvg = document.querySelector(".bank-preview-header svg");
        const badgeSvg = document.querySelector(".bank-modal-badge svg");

        const getInfo = (el) => {
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          const comp = window.getComputedStyle(el);
          return {
            width: rect.width,
            height: rect.height,
            fill: comp.fill,
            stroke: comp.stroke,
            strokeWidth: comp.strokeWidth,
            display: comp.display
          };
        };

        return {
          modal: getInfo(modal),
          saveBtn: getInfo(saveBtn),
          saveSvg: getInfo(saveSvg),
          prevHeaderSvg: getInfo(prevHeaderSvg),
          badgeSvg: getInfo(badgeSvg),
        };
      })()
    `);

    console.log("AFTER METRICS:", JSON.stringify(metrics, null, 2));

    const img = await window.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "bank_modal_after.png"), img.toPNG());
    console.log("Saved bank_modal_after.png");

    // Test 1: Backdrop click outside closes modal
    const testBackdrop = await window.webContents.executeJavaScript(`
      (() => {
        const backdrop = document.querySelector(".bank-modal-backdrop");
        if (!backdrop) return { ok: false, error: "No backdrop found" };
        backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        return { ok: true, closed: !document.querySelector(".bank-modal-backdrop") };
      })()
    `);
    console.log("Backdrop click test:", testBackdrop);

    // Test 2: Re-open modal and click close button
    const testCloseBtn = await window.webContents.executeJavaScript(`
      (() => {
        openBankAccountModal();
        const closeBtn = document.querySelector(".bank-modal-close");
        if (!closeBtn) return { ok: false, error: "No close button found" };
        closeBtn.click();
        return { ok: true, closed: !document.querySelector(".bank-modal-backdrop") };
      })()
    `);
    console.log("Close button test:", testCloseBtn);

    // Test 3: Re-open modal and click Cancel button
    const testCancelBtn = await window.webContents.executeJavaScript(`
      (() => {
        openBankAccountModal();
        const cancelBtn = document.querySelector("[data-action='cancel-bank']");
        if (!cancelBtn) return { ok: false, error: "No cancel button found" };
        cancelBtn.click();
        return { ok: true, closed: !document.querySelector(".bank-modal-backdrop") };
      })()
    `);
    console.log("Cancel button test:", testCancelBtn);

    // Test 4: Re-open modal, test live input synchronization
    const testSync = await window.webContents.executeJavaScript(`
      (() => {
        openBankAccountModal();
        const bankNameInput = document.getElementById("bankNameInput");
        const accountNoInput = document.getElementById("bankAccountNoInput");
        const bpBankName = document.getElementById("bpBankName");
        const bpAccountNo = document.getElementById("bpAccountNo");

        bankNameInput.value = "State Bank of India";
        bankNameInput.dispatchEvent(new Event("input", { bubbles: true }));

        accountNoInput.value = "123456789012";
        accountNoInput.dispatchEvent(new Event("input", { bubbles: true }));

        return {
          ok: true,
          bankMatch: bpBankName.textContent === "State Bank of India",
          accMatch: bpAccountNo.textContent === "123456789012"
        };
      })()
    `);
    console.log("Live preview sync test:", testSync);
  } catch (err) {
    console.error("Test error:", err);
  } finally {
    window.destroy();
    app.quit();
  }
}

app.whenReady().then(run);
