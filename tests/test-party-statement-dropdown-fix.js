const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const assert = require("assert");

const testRoot = path.join(__dirname, "..", "tmp-test-wa-statement-fix");
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

    // Test 1: Verify menu open state, check no smart templates
    const evalRes1 = await win.webContents.executeJavaScript(`
      (async () => {
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

        showView("whatsapp");
        await new Promise(r => setTimeout(r, 400));

        const view = document.querySelector(".whatsapp-connect-view");
        const smartTemplatesPill = view?.querySelector("[data-wa-quick='smart']");
        const smartTemplatesText = Array.from(view?.querySelectorAll("button") || []).find(b => b.textContent.includes("Smart Templates"));
        
        const stmtMenus = view?.querySelectorAll("#waStatementPeriodMenu");
        const stmtPill = view?.querySelector("#waStmtPillBtn");

        // Click statement pill to toggle dropdown open
        stmtPill?.click();
        await new Promise(r => setTimeout(r, 100));

        const menuVisibleAfterClick = !stmtMenus[0]?.classList.contains("hidden");
        const periodItems = Array.from(stmtMenus[0]?.querySelectorAll(".wa-period-item") || []).map(b => ({
          period: b.getAttribute("data-period"),
          text: b.textContent.trim().replace(/\\s+/g, " ")
        }));

        return {
          smartTemplatesPillExists: Boolean(smartTemplatesPill || smartTemplatesText),
          stmtMenusCount: stmtMenus.length,
          menuVisibleAfterClick,
          periodItems
        };
      })()
    `);

    console.log("Evaluation 1 (Menu Opened):", JSON.stringify(evalRes1, null, 2));
    assert(!evalRes1.smartTemplatesPillExists, "Smart Templates pill must be removed");
    assert.strictEqual(evalRes1.stmtMenusCount, 1, "There must be exactly ONE #waStatementPeriodMenu in DOM");
    assert(evalRes1.menuVisibleAfterClick, "Statement Period menu must open on click");
    assert.strictEqual(evalRes1.periodItems.length, 4, "Must have 4 period choices");

    // Capture screenshot of open dropdown menu
    const img1 = await win.webContents.capturePage();
    const artifactMenuPath = "C:\\Users\\ANAS\\.gemini\\antigravity\\brain\\bed9650d-397d-4216-aa80-c0ae1c3c4fcb\\whatsapp_connect_statement_menu_opened.png";
    fs.writeFileSync(artifactMenuPath, img1.toPNG());
    console.log("✓ Menu screenshot saved:", artifactMenuPath);

    // Test 2: Click a period item (e.g. 'all' or 'thisMonth') -> drafts statement into chat
    const evalRes2 = await win.webContents.executeJavaScript(`
      (async () => {
        const view = document.querySelector(".whatsapp-connect-view");
        const menu = view?.querySelector("#waStatementPeriodMenu");
        const allTimeBtn = menu?.querySelector("[data-period='all']");
        
        allTimeBtn?.click();
        await new Promise(r => setTimeout(r, 400));

        const menuClosedAfterSelect = menu?.classList.contains("hidden");
        const draftBar = view?.querySelector("#waDraftAttachmentBar");
        const input = view?.querySelector("#waMessageInput");

        return {
          menuClosedAfterSelect,
          draftBarVisible: !draftBar?.classList.contains("hidden"),
          draftDocName: draftBar?.querySelector(".wa-draft-doc-name")?.textContent,
          draftDocSize: draftBar?.querySelector(".wa-draft-doc-size")?.textContent,
          messageDrafted: input?.value?.includes("Statement of Account"),
          messageContent: input?.value
        };
      })()
    `);

    console.log("Evaluation 2 (Statement Drafted):", JSON.stringify(evalRes2, null, 2));
    assert(evalRes2.menuClosedAfterSelect, "Menu must close after selecting period");
    assert(evalRes2.draftBarVisible, "Draft attachment bar must be visible");
    assert(evalRes2.messageDrafted, "Message input must contain statement");

    // Capture screenshot of drafted statement
    const img2 = await win.webContents.capturePage();
    const artifactDraftPath = "C:\\Users\\ANAS\\.gemini\\antigravity\\brain\\bed9650d-397d-4216-aa80-c0ae1c3c4fcb\\whatsapp_connect_statement_drafted_verified.png";
    fs.writeFileSync(artifactDraftPath, img2.toPNG());
    console.log("✓ Draft screenshot saved:", artifactDraftPath);

    console.log("=================================================");
    console.log("ALL STATEMENT FIX CHECKS PASSED SUCCESSFULLY!");
    console.log("=================================================");
    app.exit(0);
  } catch (err) {
    console.error("Test failed:", err);
    app.exit(1);
  }
});
