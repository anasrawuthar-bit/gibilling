const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-party-statement-test-"));
app.setPath("userData", testRoot);

const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity\\brain\\bed9650d-397d-4216-aa80-c0ae1c3c4fcb";

app.whenReady().then(async () => {
  let win = null;
  try {
    await database.initDatabase(testRoot);

    // Direct IPC handlers
    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
    ipcMain.handle("db:create-party", (_event, party) => database.createParty(party));
    ipcMain.handle("db:update-party", (_event, party) => database.updateParty(party));
    ipcMain.handle("whatsapp:save-temp-pdf", async (_event, payload) => {
      const tempPath = path.join(testRoot, payload.filename || "statement.pdf");
      fs.writeFileSync(tempPath, payload.htmlContent || "pdf dummy");
      return { success: true, filePath: tempPath };
    });
    ipcMain.handle("whatsapp:open-link", async (_event, url) => {
      return { success: true, url };
    });
    ipcMain.handle("app:export-pdf", async (_event, payload) => {
      const exportPath = path.join(testRoot, payload.defaultFilename || "statement.pdf");
      fs.writeFileSync(exportPath, payload.htmlContent || "pdf dummy");
      return { success: true, filePath: exportPath };
    });

    win = new BrowserWindow({
      show: true,
      width: 1440,
      height: 900,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    win.webContents.on("console-message", (_event, _level, message) => {
      console.log("[Renderer Console]", message);
    });

    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Open company
    await win.webContents.executeJavaScript(`
      (async () => {
        const btn = document.querySelector(".open-company-button");
        await openCompany(btn?.dataset?.company || "testt");
      })()
    `);
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Create seed parties and update state
    await win.webContents.executeJavaScript(`
      (async () => {
        const res1 = await window.giDB.createParty({
          name: "Zenith Technologies",
          phone: "9846515684",
          type: "customer",
          openingBalance: 4500,
          openingBalanceType: "receivable",
          gstin: "29AABCA9999Z1Z1",
          billingAddress: "45 Industrial Area, Bangalore",
        });
        state = normalizeState(res1);

        const res2 = await window.giDB.createParty({
          name: "Apex Systems",
          phone: "",
          type: "customer",
          openingBalance: 2000,
          openingBalanceType: "receivable",
        });
        state = normalizeState(res2);

        // Navigate to Parties view
        showView("parties");
      })()
    `);
    await new Promise((resolve) => setTimeout(resolve, 800));

    // 1. Verify Party Detail Action buttons
    const partyDetailActions = await win.webContents.executeJavaScript(`
      (() => {
        const downloadBtn = document.querySelector("[data-action='download-party-statement']");
        const waBtn = document.querySelector("[data-action='share-party-statement-whatsapp']");
        const reportBtn = document.querySelector("[data-action='view-party-statement-report']");
        return {
          hasDownload: Boolean(downloadBtn),
          downloadText: downloadBtn?.textContent?.trim(),
          hasWa: Boolean(waBtn),
          waText: waBtn?.textContent?.trim(),
          hasReport: Boolean(reportBtn),
        };
      })()
    `);
    console.log("Party Detail Actions:", partyDetailActions);
    if (!partyDetailActions.hasDownload || !partyDetailActions.hasWa) {
      throw new Error("Missing Download Statement or WhatsApp Share button in partyDetail header!");
    }

    // Capture screenshot of Party Detail with actions
    const partyDetailImg = await win.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "party_detail_statement_actions_verified.png"), partyDetailImg.toPNG());
    console.log("✓ Saved party_detail_statement_actions_verified.png");

    // 2. Select Zenith Technologies (has phone: 9846515684) and click WhatsApp Share
    const waModalInfo = await win.webContents.executeJavaScript(`
      (async () => {
        // Explicitly select Zenith Technologies in list
        const zenithBtn = Array.from(document.querySelectorAll(".party-list-item")).find(b => b.textContent.includes("Zenith Technologies"));
        if (zenithBtn) {
          zenithBtn.click();
          await new Promise(r => setTimeout(r, 400));
        }

        const waBtn = document.querySelector("[data-action='share-party-statement-whatsapp']");
        console.log("Clicking waBtn for partyId:", waBtn?.dataset?.partyId);
        waBtn?.click();
        await new Promise(r => setTimeout(r, 600));

        const modal = document.querySelector("#whatsappShareModalBackdrop");
        const title = modal?.querySelector("#waModalTitle")?.textContent?.trim();
        const subtitle = modal?.querySelector(".whatsapp-brand-title p")?.textContent?.trim();
        const phone = modal?.querySelector("#waRecipientPhone")?.value?.trim();
        const msg = modal?.querySelector("#waMessageText")?.value?.trim();
        const pdfText = modal?.querySelector(".whatsapp-pdf-info strong")?.textContent?.trim();
        const locateBtnText = modal?.querySelector("#waSaveAndLocatePdfBtn")?.textContent?.trim();

        return {
          isOpen: Boolean(modal),
          title,
          subtitle,
          phone,
          msgSample: msg?.slice(0, 80),
          pdfText,
          locateBtnText
        };
      })()
    `);
    console.log("WhatsApp Modal Info:", waModalInfo);
    if (!waModalInfo.isOpen || !waModalInfo.phone.includes("9846515684")) {
      throw new Error("WhatsApp Statement modal failed to open or recipient phone mismatch!");
    }

    // Capture screenshot of WhatsApp Statement modal
    const waModalImg = await win.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "party_statement_whatsapp_modal_verified.png"), waModalImg.toPNG());
    console.log("✓ Saved party_statement_whatsapp_modal_verified.png");

    // Close WhatsApp modal
    await win.webContents.executeJavaScript(`
      (() => {
        document.querySelector("[data-wa-close]")?.click();
      })()
    `);
    await new Promise((resolve) => setTimeout(resolve, 400));

    // 3. Test Party WITHOUT phone (Apex Systems)
    const promptModalInfo = await win.webContents.executeJavaScript(`
      (async () => {
        // Select Apex Systems in list
        const apexBtn = Array.from(document.querySelectorAll(".party-list-item")).find(b => b.textContent.includes("Apex Systems"));
        if (apexBtn) {
          apexBtn.click();
          await new Promise(r => setTimeout(r, 500));
        }

        // Click WhatsApp Share
        const waBtn = document.querySelector("[data-action='share-party-statement-whatsapp']");
        waBtn?.click();
        await new Promise(r => setTimeout(r, 600));

        const promptModal = document.querySelector("#partyPhonePromptModalBackdrop");
        const title = promptModal?.querySelector("h3")?.textContent?.trim();
        const input = promptModal?.querySelector("#promptPartyPhoneInput");
        const saveCheck = promptModal?.querySelector("#promptSavePhoneToParty");

        return {
          isOpen: Boolean(promptModal),
          title,
          hasInput: Boolean(input),
          hasSaveCheck: Boolean(saveCheck),
        };
      })()
    `);
    console.log("Phone Prompt Modal Info:", promptModalInfo);
    if (!promptModalInfo.isOpen) {
      throw new Error("Phone prompt modal failed to open for party without phone number!");
    }

    // Capture screenshot of Phone Prompt modal
    const promptModalImg = await win.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "party_statement_phone_prompt_modal_verified.png"), promptModalImg.toPNG());
    console.log("✓ Saved party_statement_phone_prompt_modal_verified.png");

    // Close prompt modal
    await win.webContents.executeJavaScript(`
      (() => {
        document.querySelector("[data-prompt-close]")?.click();
      })()
    `);
    await new Promise((resolve) => setTimeout(resolve, 400));

    // 4. Test Party Statement Report WhatsApp Share button
    const reportActionInfo = await win.webContents.executeJavaScript(`
      (() => {
        showView("reports", "partyStatement");
        const waReportBtn = document.querySelector("[data-report-tool='share-whatsapp']");
        const exportCsvBtn = document.querySelector("[data-report-tool='export']");
        const exportPdfBtn = document.querySelector("[data-report-tool='export-pdf']");
        return {
          hasWa: Boolean(waReportBtn),
          waText: waReportBtn?.textContent?.trim(),
          hasCsv: Boolean(exportCsvBtn),
          hasPdf: Boolean(exportPdfBtn),
        };
      })()
    `);
    console.log("Party Statement Report Header Actions:", reportActionInfo);
    if (!reportActionInfo.hasWa) {
      throw new Error("WhatsApp Share button missing in partyStatement report header!");
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
    const reportImg = await win.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "party_statement_report_whatsapp_action_verified.png"), reportImg.toPNG());
    console.log("✓ Saved party_statement_report_whatsapp_action_verified.png");

    console.log("\n==================================================================");
    console.log("  ALL PARTY STATEMENT WORKFLOW INTEGRATION TESTS PASSED 100%!   ");
    console.log("==================================================================\n");

    if (win) win.close();
    app.quit();
  } catch (err) {
    console.error("Test failed with error:", err);
    if (win) win.close();
    app.quit();
    process.exit(1);
  }
});
