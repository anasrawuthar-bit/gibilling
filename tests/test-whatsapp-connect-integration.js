const { app, BrowserWindow } = require("electron");
const path = require("path");
const assert = require("assert");
const fs = require("fs");

const screenshotDir = path.join(
  "C:",
  "Users",
  "ANAS",
  ".gemini",
  "antigravity",
  "brain",
  "bed9650d-397d-4216-aa80-c0ae1c3c4fcb"
);

app.whenReady().then(async () => {
  let win = null;
  try {
    win = new BrowserWindow({
      show: false,
      width: 1366,
      height: 768,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: false,
        nodeIntegration: true,
      },
    });

    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 1000));

    console.log("TEST 1: Verifying WhatsApp Connect button in sidebar under Parties...");
    const sidebarCheck = await win.webContents.executeJavaScript(`
      (() => {
        const partiesBtn = document.querySelector('.side-nav button[data-view="parties"]');
        const nextBtn = partiesBtn ? partiesBtn.nextElementSibling : null;
        return {
          partiesExists: !!partiesBtn,
          nextView: nextBtn ? nextBtn.dataset.view : null,
          nextText: nextBtn ? nextBtn.textContent.trim() : null,
        };
      })()
    `);

    assert.strictEqual(sidebarCheck.partiesExists, true, "Parties button must exist in sidebar");
    assert.strictEqual(sidebarCheck.nextView, "whatsapp", "Next button below Parties must be WhatsApp Connect");
    assert.ok(sidebarCheck.nextText.includes("WhatsApp Connect"), "Sidebar button text must be WhatsApp Connect");
    console.log("✓ Verified: WhatsApp Connect is placed in sidebar directly below Parties");

    console.log("TEST 2: Navigating to WhatsApp Connect workspace...");
    await win.webContents.executeJavaScript(`
      (() => {
        state.parties = [
          { id: "p1", name: "ajml", phone: "9846515684", balance: 22800, receivable: 22800, state: "Kerala" },
          { id: "p2", name: "Aman Traders", phone: "9876543210", balance: 15000, receivable: 15000, state: "Kerala" }
        ];
        state.businessSettings = state.businessSettings || {};
        state.businessSettings.businessName = "aesthec";
        state.businessSettings.phone = "9846515684";

        whatsappConnectState.connected = true;
        whatsappConnectState.activePartyId = "p1";
        saveWhatsAppConnectState();

        const waNav = document.querySelector('.side-nav button[data-view="whatsapp"]');
        if (waNav) waNav.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 600));

    const workspaceCheck = await win.webContents.executeJavaScript(`
      (() => {
        const view = document.querySelector(".whatsapp-connect-view");
        const title = view?.querySelector(".wa-connect-brand h1")?.textContent?.trim();
        const status = view?.querySelector(".wa-status-pill")?.textContent?.trim();
        const activePartyName = view?.querySelector(".wa-chat-header-name")?.textContent?.trim();
        const bubbles = Array.from(view?.querySelectorAll(".wa-message-bubble") || []).map(b => b.textContent.trim());
        const quickPills = Array.from(view?.querySelectorAll(".wa-quick-pill") || []).map(p => p.textContent.trim());

        return {
          exists: !!view,
          title,
          status,
          activePartyName,
          bubbleCount: bubbles.length,
          firstBubbleHasInvoice: bubbles[0] ? bubbles[0].includes("Invoice Amount") : false,
          quickPills,
        };
      })()
    `);

    assert.strictEqual(workspaceCheck.exists, true, "WhatsApp Connect view must be rendered");
    assert.strictEqual(workspaceCheck.title, "WhatsApp Connect");
    assert.ok(workspaceCheck.status.includes("Connected"), "Status must be Connected");
    assert.strictEqual(workspaceCheck.activePartyName, "ajml");
    assert.ok(workspaceCheck.bubbleCount >= 2, "Must render initial contextual bubbles");
    assert.strictEqual(workspaceCheck.firstBubbleHasInvoice, true, "First bubble must match Image 2 format");
    console.log("✓ Verified: Connected workspace matches Image 2 (active chat with ajml, invoice bubble, reminder bubble)");

    // Capture screenshot of Connected Chat Workspace (Image 2 representation)
    const img1 = await win.webContents.capturePage();
    fs.writeFileSync(path.join(screenshotDir, "clean_whatsapp_connect_chat_workspace.png"), img1.toPNG());
    console.log("✓ Saved clean_whatsapp_connect_chat_workspace.png");

    console.log("TEST 3: Testing Payment Reminder quick action pill...");
    await win.webContents.executeJavaScript(`
      (() => {
        const reminderBtn = document.querySelector('[data-wa-quick="reminder"]');
        if (reminderBtn) reminderBtn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 300));

    const inputVal = await win.webContents.executeJavaScript(`
      (() => {
        const input = document.getElementById("waMessageInput");
        return input ? input.value : "";
      })()
    `);

    assert.ok(inputVal.includes("Your payment of 22800.00 is pending with aesthec"), "Input must have reminder text");
    console.log("✓ Verified: Payment Reminder pill inserts preformatted reminder");

    console.log("TEST 4: Sending message and verifying bubble update...");
    await win.webContents.executeJavaScript(`
      (() => {
        const input = document.getElementById("waMessageInput");
        input.value = "Please confirm when payment will be processed.";
        const sendBtn = document.getElementById("waSendBtn");
        if (sendBtn) sendBtn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 400));

    const afterSendCheck = await win.webContents.executeJavaScript(`
      (() => {
        const bubbles = document.querySelectorAll(".wa-message-bubble");
        const lastBubble = bubbles[bubbles.length - 1];
        return {
          totalBubbles: bubbles.length,
          lastText: lastBubble?.querySelector(".wa-bubble-text")?.textContent?.trim(),
          hasCheckmark: !!lastBubble?.querySelector(".wa-check-icon"),
        };
      })()
    `);

    assert.strictEqual(afterSendCheck.lastText, "Please confirm when payment will be processed.");
    assert.strictEqual(afterSendCheck.hasCheckmark, true);
    console.log("✓ Verified: Sent message added to conversation with double checkmark");

    console.log("TEST 5: Switching to QR Pairing Screen (Image 1)...");
    await win.webContents.executeJavaScript(`
      (() => {
        const qrBtn = document.querySelector('[data-wa-action="show-qr"]') || document.querySelector('[data-wa-action="disconnect"]');
        if (qrBtn) qrBtn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 500));

    const qrCheck = await win.webContents.executeJavaScript(`
      (() => {
        const view = document.querySelector(".whatsapp-connect-view");
        const securityCard = view?.querySelector(".wa-security-card");
        const qrCard = view?.querySelector(".wa-qr-card-view");
        const steps = Array.from(qrCard?.querySelectorAll(".wa-instructions-list li") || []).map(li => li.textContent.trim());
        const hasLockBadge = !!securityCard?.querySelector(".wa-security-lock-badge");

        return {
          hasSecurityCard: !!securityCard,
          securityTitle: securityCard?.querySelector("h3")?.textContent?.trim(),
          hasLockBadge,
          hasQrCard: !!qrCard,
          qrTitle: qrCard?.querySelector("h2")?.textContent?.trim(),
          stepCount: steps.length,
        };
      })()
    `);

    assert.strictEqual(qrCheck.hasSecurityCard, true, "Security card must be present");
    assert.strictEqual(qrCheck.securityTitle, "Safety & Security");
    assert.strictEqual(qrCheck.hasLockBadge, true, "Green lock badge must be present");
    assert.strictEqual(qrCheck.hasQrCard, true, "QR card must be present");
    assert.strictEqual(qrCheck.qrTitle, "Scan this QR code");
    assert.strictEqual(qrCheck.stepCount, 3, "3 pairing steps must be present");
    console.log("✓ Verified: QR Pairing screen matches Image 1 (Safety & Security + QR code with 3 steps)");

    // Capture screenshot of QR Pairing Screen (Image 1 representation)
    const img2 = await win.webContents.capturePage();
    fs.writeFileSync(path.join(screenshotDir, "clean_whatsapp_connect_qr_pairing.png"), img2.toPNG());
    console.log("✓ Saved clean_whatsapp_connect_qr_pairing.png");

    console.log("TEST 6: Re-linking device back to connected workspace...");
    await win.webContents.executeJavaScript(`
      (() => {
        const linkBtn = document.querySelector('[data-wa-action="connect"]');
        if (linkBtn) linkBtn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 400));

    const finalCheck = await win.webContents.executeJavaScript(`
      (() => {
        return {
          isConnected: whatsappConnectState.connected,
          hasWorkspace: !!document.querySelector(".wa-chat-workspace"),
        };
      })()
    `);
    assert.strictEqual(finalCheck.isConnected, true);
    assert.strictEqual(finalCheck.hasWorkspace, true);
    console.log("✓ Verified: Smoothly re-linked back to connected workspace");

    console.log("\nALL WHATSAPP CONNECT INTEGRATION TESTS PASSED 100%!");
    win.close();
    app.quit();
  } catch (err) {
    console.error("Test failed:", err);
    if (win) win.close();
    process.exit(1);
  }
});
