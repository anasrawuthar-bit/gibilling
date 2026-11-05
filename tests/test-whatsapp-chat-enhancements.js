const { app, BrowserWindow } = require("electron");
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
        // 1. Setup mock state
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
            date: "2026-11-04"
          }
        ];

        whatsappConnectState.connected = true;
        whatsappConnectState.termsAccepted = true;
        whatsappConnectState.currentUser = { phone: "919048253862", name: "ZynBill Desktop" };
        whatsappConnectState.activePartyId = "party-anas";
        whatsappConnectState.chats = {};
        whatsappConnectState.draftAttachment = null;

        // Navigate to WhatsApp view
        showView("whatsapp");
        await new Promise(r => setTimeout(r, 400));

        const view = document.querySelector(".whatsapp-connect-view");
        const latestBillPill = view?.querySelector("[data-wa-quick='latest-bill']");
        const stmtPill = view?.querySelector("#waStmtPillBtn");
        const stmtMenu = view?.querySelector("#waStatementPeriodMenu");
        const input = view?.querySelector("#waMessageInput");
        const draftBar = view?.querySelector("#waDraftAttachmentBar");
        const sendBtn = view?.querySelector("#waSendBtn");

        const initialChecks = {
          hasView: Boolean(view),
          isTextarea: input?.tagName === "TEXTAREA",
          hasLatestBillPill: Boolean(latestBillPill),
          hasStmtPill: Boolean(stmtPill),
          hasDraftBar: Boolean(draftBar),
          draftBarInitiallyHidden: draftBar?.classList.contains("hidden"),
        };

        // 2. Test clicking Latest Bill -> Direct Draft into Chat (NO POPUP MODAL)
        latestBillPill?.click();
        await new Promise(r => setTimeout(r, 300));

        const afterLatestBill = {
          noModalOpened: !document.getElementById("waLatestBillModalBackdrop"),
          draftBarVisible: !draftBar?.classList.contains("hidden"),
          draftDocName: draftBar?.querySelector(".wa-draft-doc-name")?.textContent,
          inputValueHasInvoice: input?.value?.includes("INV-2627-0010"),
          hasAutoHeight: parseInt(input?.style?.height || "0", 10) >= 40,
        };

        // 3. Test Statement Period Selector (NO POPUP MODAL)
        stmtPill?.click();
        const stmtMenuOpened = !stmtMenu?.classList.contains("hidden");
        const thisMonthBtn = stmtMenu?.querySelector("[data-period='thisMonth']");
        thisMonthBtn?.click();
        await new Promise(r => setTimeout(r, 300));

        const afterStmt = {
          stmtMenuOpened,
          noModalOpened: !document.getElementById("waStatementModalBackdrop"),
          draftBarVisible: !draftBar?.classList.contains("hidden"),
          draftDocName: draftBar?.querySelector(".wa-draft-doc-name")?.textContent,
          inputValueHasStatement: input?.value?.includes("Statement of Account"),
        };

        // 4. Test Sending Message with Document (both text & PDF card in bubble)
        sendBtn?.click();
        await new Promise(r => setTimeout(r, 200));

        const bubbles = view?.querySelectorAll(".wa-message-bubble");
        const lastBubble = bubbles[bubbles.length - 1];
        const lastDocCard = lastBubble?.querySelector(".wa-bubble-doc-card");
        const lastText = lastBubble?.querySelector(".wa-bubble-text");

        const afterSend = {
          draftBarHiddenAgain: draftBar?.classList.contains("hidden"),
          inputCleared: input?.value === "",
          hasBubbleDocCard: Boolean(lastDocCard),
          hasBubbleText: Boolean(lastText),
          bubbleDocName: lastDocCard?.querySelector(".wa-doc-name")?.textContent,
        };

        return {
          initialChecks,
          afterLatestBill,
          afterStmt,
          afterSend,
        };
      })()
    `);

    console.log("Evaluation Results:", JSON.stringify(evalRes, null, 2));

    assert(evalRes.initialChecks.hasView, "WhatsApp Connect view must render");
    assert(evalRes.initialChecks.isTextarea, "Message input must be a flexible textarea");
    assert(evalRes.afterLatestBill.noModalOpened, "Latest Bill must NOT open a popup modal");
    assert(evalRes.afterLatestBill.draftBarVisible, "Draft attachment bar must be visible after clicking Latest Bill");
    assert(evalRes.afterLatestBill.inputValueHasInvoice, "Message input must be filled with invoice details");
    assert(evalRes.afterStmt.noModalOpened, "Statement must NOT open a popup modal");
    assert(evalRes.afterStmt.inputValueHasStatement, "Statement details must be drafted into input");
    assert(evalRes.afterSend.hasBubbleDocCard, "Sent bubble must render document card");
    assert(evalRes.afterSend.hasBubbleText, "Sent bubble must render caption text together with document");

    // Capture screenshot
    const img = await win.webContents.capturePage();
    const artifactPath = "C:\\Users\\ANAS\\.gemini\\antigravity\\brain\\bed9650d-397d-4216-aa80-c0ae1c3c4fcb\\whatsapp_enhanced_chat_workspace.png";
    fs.writeFileSync(artifactPath, img.toPNG());
    console.log("✓ Screenshot saved successfully:", artifactPath);

    console.log("=================================================");
    console.log("ALL WHATSAPP DESKTOP UX CHECKS PASSED 100%!");
    console.log("=================================================");
    app.exit(0);
  } catch (err) {
    console.error("Test failed:", err);
    app.exit(1);
  }
});
