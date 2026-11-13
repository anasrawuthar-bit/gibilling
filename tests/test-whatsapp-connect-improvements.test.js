const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

test("WhatsApp Connect - Dynamic UPI Links, Two-Way Sync, and Bulk Reminders Verification", async (t) => {
  const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const wsJs = fs.readFileSync(path.join(__dirname, "..", "whatsapp-service.js"), "utf8");
  const preloadJs = fs.readFileSync(path.join(__dirname, "..", "preload.js"), "utf8");
  const stylesCss = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

  await t.test("1. Two-way messaging and read receipts are registered in Baileys socket", () => {
    assert.ok(wsJs.includes('sock.ev.on("messages.upsert"'), "whatsapp-service.js must listen for messages.upsert");
    assert.ok(wsJs.includes('sock.ev.on("messages.update"'), "whatsapp-service.js must listen for messages.update");
    assert.ok(wsJs.includes('whatsapp:message-received'), "whatsapp-service.js must notify renderer of incoming messages");
    assert.ok(wsJs.includes('whatsapp:message-status'), "whatsapp-service.js must notify renderer of message delivery/read status");
  });

  await t.test("2. Preload bridge exposes incoming message listeners to window.giApp", () => {
    assert.ok(preloadJs.includes("onWhatsAppMessageReceived:"), "preload.js must expose onWhatsAppMessageReceived");
    assert.ok(preloadJs.includes("onWhatsAppMessageStatus:"), "preload.js must expose onWhatsAppMessageStatus");
  });

  await t.test("3. Dynamic 1-Click UPI Payment link is embedded into reminders and invoices", () => {
    assert.ok(appJs.includes("upi://pay?pa="), "app.js must format dynamic 1-click UPI links");
    assert.ok(appJs.includes("Pay in 1-Click via UPI"), "Payment reminders must include 1-click UPI payment call-to-action");
  });

  await t.test("4. Bulk / Batch Payment Reminders feature is fully implemented", () => {
    assert.ok(appJs.includes("function openWhatsAppBulkRemindersModal"), "app.js must define openWhatsAppBulkRemindersModal");
    assert.ok(appJs.includes("waBulkReminderTopBtn"), "WhatsApp Connect topbar must include Bulk Reminders button");
    assert.ok(appJs.includes("Anti-Ban Protection Active"), "Bulk reminders must feature anti-ban rate limiting explanation");
  });

  await t.test("5. Save & WhatsApp integration is added to the Transaction Editor", () => {
    assert.ok(appJs.includes('data-save-mode="whatsapp"'), "Transaction editor must have Save & WhatsApp button");
    assert.ok(appJs.includes("editorAutoWhatsAppCheck"), "Transaction editor must offer Send on WhatsApp toggle");
    assert.ok(appJs.includes("autoSendBillViaSystemWhatsApp"), "Auto-send function must be defined");
  });

  await t.test("6. CSS supports delivered and read ticks (Blue Ticks)", () => {
    assert.ok(stylesCss.includes(".wa-check-icon.wa-read"), "styles.css must have .wa-check-icon.wa-read");
    assert.ok(stylesCss.includes(".wa-check-icon.wa-delivered"), "styles.css must have .wa-check-icon.wa-delivered");
  });

  await t.test("7. WhatsApp Web / Open Desktop header buttons are removed from chat window", () => {
    assert.strictEqual(appJs.includes('<div class="wa-chat-header-actions">'), false, "Chat header must not contain wa-chat-header-actions");
  });

  await t.test("8. Inbound message deduplication and single-thread party merging are active", () => {
    assert.ok(appJs.includes("function getWhatsAppAllParties"), "app.js must define getWhatsAppAllParties");
    assert.ok(appJs.includes("function deduplicateChatMessages"), "app.js must define deduplicateChatMessages");
    assert.ok(wsJs.includes('remoteJid.split(":")[0].split("@")[0]'), "whatsapp-service.js must cleanly strip device and domain from remoteJid");
  });

  await t.test("9. Compact message bubble and no ticks for incoming contacts preview", () => {
    // Bubble padding and compact styles
    assert.ok(stylesCss.includes(".wa-message-bubble {"), "styles.css must style .wa-message-bubble");
    assert.ok(!stylesCss.includes(".wa-message-bubble {\n  max-width: 65%;\n  padding: 8px 12px;"), "Message bubble must not have large legacy 8px 12px padding");
    assert.ok(stylesCss.includes("padding: 6px 9px 5px 9px;"), "Message bubble must use compact padding");
    
    // Left contacts list must NOT show ticks for incoming messages
    assert.ok(appJs.includes("Received incoming message from customer: Do NOT show ticks!"), "Incoming message handler must not add check icon to sidebar");
    assert.ok(appJs.includes("lastMsg.from === \"me\""), "Sidebar contacts list must only show tick icon when last message was sent by me");
  });
});
