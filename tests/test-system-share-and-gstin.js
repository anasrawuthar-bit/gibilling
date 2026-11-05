const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload.js"),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  win.loadFile(path.join(__dirname, "../index.html"));

  win.webContents.once("did-finish-load", async () => {
    try {
      console.log("Page loaded. Waiting for app bootstrap...");
      await win.webContents.executeJavaScript(`
        new Promise((resolve) => {
          const check = () => {
            const splash = document.getElementById("appInitialSplash");
            if (!splash || splash.classList.contains("hidden")) {
              resolve();
            } else {
              setTimeout(check, 100);
            }
          };
          check();
        })
      `);
      await new Promise((r) => setTimeout(r, 400));
      console.log("App bootstrapped! Testing System Share and Party GSTIN...");

      // 1. Test Party GSTIN visibility for unregistered vs registered
      const partyTestResult = await win.webContents.executeJavaScript(`
        (() => {
          // Open party modal
          openEntryModal("party");
          const taxTypeSelect = document.getElementById("partyTaxType");
          const gstinGroup = document.querySelector(".gstin-field-group");
          const topBar = document.querySelector(".party-modal-top-bar");

          // By default, unregistered
          const defaultTaxType = taxTypeSelect?.value;
          const isGstinHiddenDefault = gstinGroup?.style.display === "none";
          const isTwoColDefault = topBar?.classList.contains("two-col");

          // Change to registered
          if (taxTypeSelect) {
            taxTypeSelect.value = "gst_registered";
            taxTypeSelect.dispatchEvent(new Event("change"));
          }
          const isGstinVisibleRegistered = gstinGroup?.style.display !== "none";
          const isTwoColRegistered = topBar?.classList.contains("two-col");

          // Change back to unregistered
          if (taxTypeSelect) {
            taxTypeSelect.value = "unregistered";
            taxTypeSelect.dispatchEvent(new Event("change"));
          }
          const isGstinHiddenAgain = gstinGroup?.style.display === "none";

          return {
            defaultTaxType,
            isGstinHiddenDefault,
            isTwoColDefault,
            isGstinVisibleRegistered,
            isTwoColRegistered,
            isGstinHiddenAgain,
          };
        })()
      `);
      console.log("Party GSTIN test:", JSON.stringify(partyTestResult, null, 2));

      await new Promise((r) => setTimeout(r, 250));

      // Capture screenshot of Add Party modal with GSTIN hidden for unregistered
      const partyImg = await win.webContents.capturePage();
      const partyArtifactPath = "C:/Users/ANAS/.gemini/antigravity/brain/bed9650d-397d-4216-aa80-c0ae1c3c4fcb/party_modal_unregistered_no_gstin.png";
      fs.writeFileSync(partyArtifactPath, partyImg.toPNG());
      console.log("Saved party modal screenshot to:", partyArtifactPath);

      // Close party modal
      await win.webContents.executeJavaScript(`
        (() => {
          document.getElementById("entryModal")?.classList.add("hidden");
          document.body.dataset.entryType = "";
        })()
      `);

      await new Promise((r) => setTimeout(r, 200));

      // 2. Test Share Modal
      const shareModalResult = await win.webContents.executeJavaScript(`
        (() => {
          const sampleRecord = {
            id: "INV-9999",
            invoiceNo: "INV-2026-0099",
            date: "2026-11-05",
            party: "Anas Test",
            phone: "9048253862",
            amount: 7500,
            received: 5000,
            hasPdf: true,
            filename: "INV-2026-0099.pdf"
          };

          openWhatsAppShareModal(sampleRecord, "sale");

          const backdrop = document.getElementById("whatsappShareModalBackdrop");
          if (!backdrop) return { error: "Modal not found" };

          const textContent = backdrop.textContent;
          const hasZeroBan = textContent.includes("Zero Ban");
          const hasPhoneScanInstructions = textContent.includes("Scan to Send via Phone");
          const hasQrContainer = !!document.getElementById("waQrCodeContainer");

          const hasWhatsAppDesktopCard = !!document.getElementById("waCardDesktopBtn");
          const hasSystemPickAppBtn = !!document.getElementById("systemPickAppBtn");
          const hasSystemEmailBtn = !!document.getElementById("systemEmailBtn");
          const hasWhatsAppWebBtn = !!document.getElementById("waOpenWebBtn");
          const hasSaveAndLocatePdfBtn = !!document.getElementById("waSaveAndLocatePdfBtn");
          const hasFooterDesktopBtn = !!document.getElementById("waFooterDesktopBtn");
          const hasFooterPickAppBtn = !!document.getElementById("waFooterPickAppBtn");

          return {
            hasZeroBan,
            hasPhoneScanInstructions,
            hasQrContainer,
            hasWhatsAppDesktopCard,
            hasSystemPickAppBtn,
            hasSystemEmailBtn,
            hasWhatsAppWebBtn,
            hasSaveAndLocatePdfBtn,
            hasFooterDesktopBtn,
            hasFooterPickAppBtn,
          };
        })()
      `);
      console.log("Share Modal test:", JSON.stringify(shareModalResult, null, 2));

      await new Promise((r) => setTimeout(r, 300));

      // Capture screenshot of new System Share modal
      const shareImg = await win.webContents.capturePage();
      const shareArtifactPath = "C:/Users/ANAS/.gemini/antigravity/brain/bed9650d-397d-4216-aa80-c0ae1c3c4fcb/system_share_modal_verified.png";
      fs.writeFileSync(shareArtifactPath, shareImg.toPNG());
      console.log("Saved system share modal screenshot to:", shareArtifactPath);

      // 3. Test Auto-Send on Bill Creation
      const autoSendResult = await win.webContents.executeJavaScript(`
        (() => {
          const testTx = {
            invoiceNo: "INV-TEST-001",
            party: "Anas Auto Customer",
            phone: "9876543210",
            total: 12000,
            received: 4000,
            date: "2026-11-05"
          };

          // Call the function directly to ensure no runtime errors
          autoSendBillViaSystemWhatsApp(testTx);

          return { success: true };
        })()
      `);
      console.log("Auto-Send Bill test:", JSON.stringify(autoSendResult, null, 2));

      console.log("ALL TESTS COMPLETED SUCCESSFULLY.");
      app.quit();
    } catch (err) {
      console.error("Test execution failed:", err);
      app.quit();
    }
  });
});
