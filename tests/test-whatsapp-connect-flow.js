const { app, BrowserWindow, ipcMain } = require("electron");
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

async function captureCleanPage(win, filename) {
  await win.webContents.executeJavaScript(`
    new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(resolve, 300);
        });
      });
    })
  `);
  await win.webContents.capturePage();
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(screenshotDir, filename), img.toPNG());
  console.log("  Saved " + filename);
}

async function runTest() {
  const window = new BrowserWindow({
    show: false,
    width: 1366,
    height: 768,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    console.log(`[Renderer Console] ${message} (${sourceId}:${line})`);
  });

  try {
    await window.loadFile(path.join(__dirname, "..", "index.html"));
    console.log("Waiting for app initialization (initApp / enterAppShell)...");
    await window.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const check = () => {
          const shell = document.getElementById("appShell");
          if (shell && !shell.classList.contains("hidden") && typeof currentView !== "undefined") {
            resolve(true);
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      })
    `);
    await new Promise((r) => setTimeout(r, 600));

    console.log("Setting up mock database & parties...");
    await window.webContents.executeJavaScript(`
      (() => {
        // Reset whatsapp connect state to logged out / disconnected
        localStorage.removeItem("gi-whatsapp-connect-state");
        whatsappConnectState = {
          connected: false,
          activePartyId: null,
          searchQuery: "",
          chats: {},
          directParties: []
        };

        // Mock parties: one with phone, one without phone
        state.parties = [
          { id: 101, name: "Rahul Sharma", phone: "9876543210", balance: 15400, receivable: 15400, state: "Kerala" },
          { id: 102, name: "Walk-in Counter Sale", phone: "", balance: 3500, receivable: 3500, state: "Kerala" },
          { id: 103, name: "Ananya Trades", phone: "9123456780", balance: 0, receivable: 0, state: "Kerala" }
        ];

        state.invoices = [];
        state.transactions = [];

        // Open WhatsApp Connect view explicitly
        if (typeof navigateView === "function") {
          navigateView("whatsapp");
        } else {
          const waNav = document.querySelector('[data-view="whatsapp"]');
          if (waNav) waNav.click();
        }
      })()
    `);
    await new Promise((r) => setTimeout(r, 1000));

    console.log("Test 1: Verify WhatsApp Connect starts at QR Pairing screen when NOT logged in...");
    const qrCheck = await window.webContents.executeJavaScript(`
      (() => {
        const qrContainer = document.querySelector("#waPairingQrContainer");
        const connectBtn = document.querySelector('[data-wa-action="connect"]');
        const offlinePill = document.querySelector(".wa-status-pill.offline");
        const chatWorkspace = document.querySelector(".wa-chat-workspace");
        const currentActiveView = typeof currentView !== "undefined" ? currentView : null;
        return {
          currentActiveView,
          hasQrContainer: Boolean(qrContainer),
          hasConnectBtn: Boolean(connectBtn),
          hasOfflinePill: Boolean(offlinePill),
          chatWorkspaceBlocked: !chatWorkspace
        };
      })()
    `);
    console.log("  QR Screen check result:", qrCheck);
    assert(qrCheck.hasQrContainer, "QR code container must be present");
    assert(qrCheck.hasConnectBtn, "Link device / connect button must be present");
    assert(qrCheck.hasOfflinePill, "Must display Not Paired / Logged Out status");
    assert(qrCheck.chatWorkspaceBlocked, "Chat workspace must NOT be rendered when logged out");

    await captureCleanPage(window, "clean_whatsapp_qr_pairing_login_required.png");

    console.log("Test 2: Link device / Log in and verify Chat Workspace unlocks...");
    await window.webContents.executeJavaScript(`
      (() => {
        const connectBtn = document.querySelector('[data-wa-action="connect"]');
        connectBtn?.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 800));

    const connectedCheck = await window.webContents.executeJavaScript(`
      (() => {
        const onlinePill = document.querySelector(".wa-status-pill.online");
        const disconnectBtn = document.querySelector('[data-wa-action="disconnect"]');
        const chatWorkspace = document.querySelector(".wa-chat-workspace");
        const partyItems = Array.from(document.querySelectorAll(".wa-party-item"));
        return {
          isOnline: Boolean(onlinePill),
          hasDisconnectBtn: Boolean(disconnectBtn),
          hasChatWorkspace: Boolean(chatWorkspace),
          partyCount: partyItems.length
        };
      })()
    `);
    console.log("  Connected check result:", connectedCheck);
    assert(connectedCheck.isOnline, "Must show online / connected status");
    assert(connectedCheck.hasDisconnectBtn, "Must show Disconnect button");
    assert(connectedCheck.hasChatWorkspace, "Chat workspace must be open");
    assert(connectedCheck.partyCount >= 3, "Party list should display parties");

    await captureCleanPage(window, "clean_whatsapp_chat_workspace_connected.png");

    console.log("Test 3: Click party WITHOUT phone number and verify 'Number Missing' prompt is shown...");
    await window.webContents.executeJavaScript(`
      (() => {
        const noPhoneItem = document.querySelector('.wa-party-item[data-wa-party-id="102"]');
        noPhoneItem?.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 500));

    const noPhoneCheck = await window.webContents.executeJavaScript(`
      (() => {
        const promptCard = document.querySelector(".wa-no-phone-card");
        const phoneInput = document.querySelector("#waInlinePhoneInput");
        const saveCheck = document.querySelector("#waSavePhoneToParty");
        const messageInput = document.querySelector("#waMessageInput");
        const activeName = document.querySelector(".wa-chat-header-name")?.textContent;
        const noPhoneBadge = document.querySelector('.wa-party-item[data-wa-party-id="102"] .wa-no-phone-tag');
        return {
          hasPromptCard: Boolean(promptCard),
          hasPhoneInput: Boolean(phoneInput),
          hasSaveCheck: Boolean(saveCheck),
          messageInputHidden: !messageInput,
          activeName,
          hasBadge: Boolean(noPhoneBadge)
        };
      })()
    `);
    console.log("  No phone check result:", noPhoneCheck);
    assert(noPhoneCheck.hasPromptCard, "Must show WhatsApp Number Missing prompt card");
    assert(noPhoneCheck.hasPhoneInput, "Must render mobile input field");
    assert(noPhoneCheck.messageInputHidden, "Normal message input must be hidden when phone is missing");
    assert(noPhoneCheck.hasBadge, "Sidebar must show 'No phone number' warning badge");

    await captureCleanPage(window, "clean_whatsapp_no_phone_prompt_view.png");

    console.log("Test 4: Enter 10-digit phone number, save, and verify chat unlocks with messaging enabled...");
    await window.webContents.executeJavaScript(`
      (() => {
        const phoneInput = document.querySelector("#waInlinePhoneInput");
        phoneInput.value = "9846123456";
        const form = document.querySelector("#waInlinePhoneForm");
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      })()
    `);
    await new Promise((r) => setTimeout(r, 600));

    const unlockedCheck = await window.webContents.executeJavaScript(`
      (() => {
        const promptCard = document.querySelector(".wa-no-phone-card");
        const messageInput = document.querySelector("#waMessageInput");
        const quickPills = document.querySelectorAll(".wa-quick-pill");
        const partyHeaderPhone = document.querySelector(".wa-chat-header-phone")?.textContent;
        const party102 = state.parties.find(p => p.id === 102);
        return {
          promptCardCleared: !promptCard,
          hasMessageInput: Boolean(messageInput),
          quickPillsCount: quickPills.length,
          partyHeaderPhone,
          savedPhoneInState: party102?.phone
        };
      })()
    `);
    console.log("  Chat unlocked check result:", unlockedCheck);
    assert(unlockedCheck.promptCardCleared, "Number missing card should be dismissed");
    assert(unlockedCheck.hasMessageInput, "Message input bar must now be available");
    assert(unlockedCheck.quickPillsCount >= 4, "Quick pills should be rendered");
    assert.strictEqual(unlockedCheck.savedPhoneInState, "9846123456", "Phone must be saved to party in state");

    await captureCleanPage(window, "clean_whatsapp_phone_added_chat_unlocked.png");

    console.log("Test 5: Open '+ New Chat' modal and verify unsaved number direct chat...");
    await window.webContents.executeJavaScript(`
      (() => {
        const newBtn = document.querySelector("#waNewChatBtn");
        newBtn?.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 400));

    const modalCheck = await window.webContents.executeJavaScript(`
      (() => {
        const modal = document.querySelector("#waNewChatModal");
        const phoneInput = document.querySelector("#waDirectPhoneInput");
        return {
          isModalOpen: modal && !modal.classList.contains("hidden"),
          hasInput: Boolean(phoneInput)
        };
      })()
    `);
    console.log("  Modal check result:", modalCheck);
    assert(modalCheck.isModalOpen, "New Chat modal must open");

    await captureCleanPage(window, "clean_whatsapp_new_chat_direct_modal.png");

    // Submit new chat
    await window.webContents.executeJavaScript(`
      (() => {
        const phoneInput = document.querySelector("#waDirectPhoneInput");
        const nameInput = document.querySelector("#waDirectNameInput");
        phoneInput.value = "9988776655";
        nameInput.value = "Quick Walkin Guest";
        const form = document.querySelector("#waNewChatForm");
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      })()
    `);
    await new Promise((r) => setTimeout(r, 500));

    const directChatCheck = await window.webContents.executeJavaScript(`
      (() => {
        const activeName = document.querySelector(".wa-chat-header-name")?.textContent;
        const activePhone = document.querySelector(".wa-chat-header-phone")?.textContent;
        return { activeName, activePhone };
      })()
    `);
    console.log("  Direct chat result:", directChatCheck);
    assert(directChatCheck.activeName.includes("Quick Walkin Guest"), "Must activate direct chat contact");

    console.log("Test 6: Click Disconnect and verify session locks back to QR Pairing screen...");
    await window.webContents.executeJavaScript(`
      (() => {
        const disconnectBtn = document.querySelector('[data-wa-action="disconnect"]');
        disconnectBtn?.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 500));

    const disconnectCheck = await window.webContents.executeJavaScript(`
      (() => {
        const qrContainer = document.querySelector("#waPairingQrContainer");
        const chatWorkspace = document.querySelector(".wa-chat-workspace");
        const offlinePill = document.querySelector(".wa-status-pill.offline");
        return {
          hasQr: Boolean(qrContainer),
          chatWorkspaceHidden: !chatWorkspace,
          isOffline: Boolean(offlinePill)
        };
      })()
    `);
    console.log("  Disconnect result:", disconnectCheck);
    assert(disconnectCheck.hasQr, "Must return to QR Pairing screen after logout");
    assert(disconnectCheck.chatWorkspaceHidden, "Chat workspace must be completely hidden on disconnect");
    assert(disconnectCheck.isOffline, "Status must show offline / logged out");

    console.log("\n==================================================");
    console.log("  ALL WHATSAPP CONNECT FLOW TESTS PASSED 100%!    ");
    console.log("==================================================\n");

  } catch (err) {
    console.error("Test failed:", err);
    process.exitCode = 1;
  } finally {
    window.destroy();
    app.quit();
  }
}

app.whenReady().then(runTest);
