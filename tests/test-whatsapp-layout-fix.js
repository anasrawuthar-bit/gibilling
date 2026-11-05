const { app, BrowserWindow } = require("electron");
const path = require("path");
const assert = require("assert");
const fs = require("fs");

const testRoot = path.join(__dirname, "..", "tmp-test-wa-fix");
if (!fs.existsSync(testRoot)) fs.mkdirSync(testRoot, { recursive: true });
app.setPath("userData", testRoot);

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      width: 1366,
      height: 850,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 1200));

    console.log("Navigating to WhatsApp Connect workspace...");
    await win.webContents.executeJavaScript(`
      (() => {
        state.parties = [
          { id: 1, name: "anas", phone: "9048253862", balance: 10764, state: "Kerala" },
          { id: 2, name: "Beta Enterprises", phone: "9876543211", balance: 5000, state: "Kerala" }
        ];
        state.activeCompany = "testt";
        state.businessSettings = { businessName: "testt", phone: "9048253862" };
        whatsappConnectState.connected = false;
        whatsappConnectState.termsAccepted = true; // QR active mode as in user's screenshot
        showView("whatsapp");
      })()
    `);

    await new Promise((r) => setTimeout(r, 1000));

    const check = await win.webContents.executeJavaScript(`
      (() => {
        const textarea = document.querySelector("#waDirectDesktopMsg");
        const rect = textarea?.getBoundingClientRect();
        const computed = textarea ? window.getComputedStyle(textarea) : null;
        const linkBtn = document.querySelector('[data-wa-action="connect"]');
        const termsCheck = document.querySelector("#waTermsCheck");
        const directPanel = document.querySelector("#waDirectDesktopPanel");
        const partySelect = document.querySelector("#waDirectPartySelect");

        return {
          hasTextarea: Boolean(textarea),
          textareaHeight: rect?.height || 0,
          computedHeight: computed?.height || "",
          computedMinHeight: computed?.minHeight || "",
          textLength: textarea?.value?.length || 0,
          hasFullReminder: (textarea?.value || "").includes("₹10,764") && (textarea?.value || "").includes("Outstanding Balance"),
          firstFewLines: (textarea?.value || "").split("\\n").slice(0, 6).join("\\n"),
          hasLinkBtn: Boolean(linkBtn),
          linkBtnVisible: linkBtn ? window.getComputedStyle(linkBtn).display !== "none" : false,
          hasTermsCheck: Boolean(termsCheck),
          hasDirectPanel: Boolean(directPanel),
          partyVal: partySelect?.value
        };
      })()
    `);

    console.log("WhatsApp Connect Check Results:", check);

    assert(check.hasTextarea, "Direct desktop textarea must exist");
    assert(check.textareaHeight >= 140, `Textarea height must be at least 140px, got ${check.textareaHeight}px (was previously squashed to 32px!)`);
    assert(check.hasFullReminder, "Textarea must contain full payment reminder with ₹10,764 balance");
    assert(check.hasLinkBtn && check.linkBtnVisible, "Link Device button must be present and visible");
    assert(check.hasTermsCheck, "Terms check must be present");
    console.log("✓ SUCCESS: Textarea is fully expanded with complete multiline message preview!");

    // Capture screenshot
    const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity\\brain\\bed9650d-397d-4216-aa80-c0ae1c3c4fcb";
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "whatsapp_connect_fixed_textarea_and_layout.png"), img.toPNG());
    console.log("✓ Saved screenshot: whatsapp_connect_fixed_textarea_and_layout.png");

    console.log("\nALL WHATSAPP LAYOUT FIX TESTS PASSED 100%!");
    win.destroy();
    app.quit();
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  }
});
