const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const assert = require("assert");

const testRoot = path.join(__dirname, "..", "tmp-test-wa-enhancements");
if (!fs.existsSync(testRoot)) fs.mkdirSync(testRoot, { recursive: true });
app.setPath("userData", testRoot);

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  try {
    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 1200));

    const evalRes = await win.webContents.executeJavaScript(`
      (async () => {
        // Setup state
        state.parties = [
          { id: "party-anas", name: "anas", phone: "9048253862", balance: 10764, state: "Kerala" },
          { id: "party-rafi", name: "rafi", phone: "", balance: 0, state: "Kerala" }
        ];
        state.invoices = [
          {
            id: "inv-anas-1",
            invoiceNo: "INV-2627-0010",
            type: "sale",
            party: "anas",
            partyId: "party-anas",
            amount: 5000,
            total: 5000,
            received: 0,
            balance: 5000,
            date: "2026-11-05"
          }
        ];

        // WhatsApp connected mock state
        whatsappConnectState.connected = true;
        whatsappConnectState.termsAccepted = true;
        whatsappConnectState.currentUser = { phone: "919048253862", name: "ZynBill Desktop" };
        whatsappConnectState.activePartyId = "party-anas";
        whatsappConnectState.chats = {};

        // Navigate to WhatsApp Connect view
        showView("whatsapp");
        await new Promise(r => setTimeout(r, 400));

        const view = document.querySelector(".whatsapp-connect-view");
        const latestBillPill = view?.querySelector("[data-wa-quick='latest-bill']");
        const statementPdfPill = view?.querySelector("[data-wa-quick='statement-pdf']");
        const reminderPill = view?.querySelector("[data-wa-quick='reminder']");
        const smartPill = view?.querySelector("[data-wa-quick='smart']");
        const attachBtn = view?.querySelector("#waAttachBtn");
        const popover = view?.querySelector("#waAttachPopover");

        // Test popover toggle
        attachBtn?.click();
        const popoverOpened = !popover?.classList.contains("hidden");

        // Test Latest Bill click
        latestBillPill?.click();
        await new Promise(r => setTimeout(r, 200));
        const billModal = document.getElementById("waLatestBillModalBackdrop");
        const billModalTitle = billModal?.querySelector("h3")?.textContent?.trim();
        const billModalDocName = billModal?.querySelector("strong")?.textContent?.trim();
        billModal?.querySelector("#waBillCloseBtn")?.click();
        await new Promise(r => setTimeout(r, 100));

        // Test Statement PDF click
        statementPdfPill?.click();
        await new Promise(r => setTimeout(r, 200));
        const stmtModal = document.getElementById("waStatementModalBackdrop");
        const stmtModalTitle = stmtModal?.querySelector("h3")?.textContent?.trim();
        stmtModal?.querySelector("#waStmtCloseBtn")?.click();
        await new Promise(r => setTimeout(r, 100));

        // Test chat doc card presence
        const docCard = view?.querySelector(".wa-bubble-doc-card");
        const docName = docCard?.querySelector(".wa-doc-name")?.textContent?.trim();

        return {
          hasView: Boolean(view),
          hasLatestBillPill: Boolean(latestBillPill),
          latestBillText: latestBillPill?.textContent?.replace(/\\s+/g, " ")?.trim(),
          hasStatementPdfPill: Boolean(statementPdfPill),
          statementPdfText: statementPdfPill?.textContent?.replace(/\\s+/g, " ")?.trim(),
          hasReminderPill: Boolean(reminderPill),
          hasSmartPill: Boolean(smartPill),
          popoverOpened,
          billModalOpened: Boolean(billModal),
          billModalTitle,
          billModalDocName,
          stmtModalOpened: Boolean(stmtModal),
          stmtModalTitle,
          hasDocCard: Boolean(docCard),
          docName
        };
      })()
    `);

    console.log("Evaluation Results:", evalRes);

    assert(evalRes.hasView, "WhatsApp Connect view must render");
    assert(evalRes.hasLatestBillPill, "Latest Bill quick pill must exist");
    assert(evalRes.latestBillText.includes("INV-2627-0010"), "Latest Bill must show #INV-2627-0010");
    assert(evalRes.hasStatementPdfPill, "Party Statement (PDF) quick pill must exist");
    assert(evalRes.popoverOpened, "Attachment popover must open on '+' click");
    assert(evalRes.billModalOpened, "Latest Bill modal must open on click");
    assert(evalRes.stmtModalOpened, "Statement PDF modal must open on click");
    assert(evalRes.hasDocCard, "Chat bubble with document card must render");

    // Capture screenshot
    const img = await win.webContents.capturePage();
    const artifactPath = "C:\\Users\\ANAS\\.gemini\\antigravity\\brain\\bed9650d-397d-4216-aa80-c0ae1c3c4fcb\\whatsapp_enhanced_chat_workspace.png";
    fs.writeFileSync(artifactPath, img.toPNG());
    console.log("✓ Screenshot saved successfully:", artifactPath);

    console.log("=================================================");
    console.log("ALL WHATSAPP CHAT ENHANCEMENT CHECKS PASSED 100%!");
    console.log("=================================================");
    app.exit(0);
  } catch (err) {
    console.error("Test failed:", err);
    app.exit(1);
  }
});
