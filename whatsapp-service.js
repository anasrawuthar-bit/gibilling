const path = require("path");
const fs = require("fs");
const QRCode = require("qrcode");
const pino = require("pino");

let makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion;

try {
  const baileys = require("@whiskeysockets/baileys");
  makeWASocket = baileys.default || baileys.makeWASocket || baileys;
  useMultiFileAuthState = baileys.useMultiFileAuthState;
  DisconnectReason = baileys.DisconnectReason;
  fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
} catch (err) {
  console.warn("Baileys library could not be loaded:", err.message);
}

class WhatsAppService {
  constructor() {
    this.sock = null;
    this.app = null;
    this.ipcMain = null;
    this.getMainWindow = null;
    this.authDir = null;
    this.status = "disconnected"; // 'disconnected' | 'connecting' | 'qr' | 'connected'
    this.currentQrRaw = null;
    this.currentQrDataUrl = null;
    this.currentUser = null;
    this.isStarting = false;
    this.shouldReconnect = true;
    this.qrTimeoutTimer = null;
  }

  init({ app, ipcMain, getMainWindow }) {
    this.app = app;
    this.ipcMain = ipcMain;
    this.getMainWindow = getMainWindow;
    this.authDir = path.join(app.getPath("userData"), "whatsapp-auth");

    if (!fs.existsSync(this.authDir)) {
      try {
        fs.mkdirSync(this.authDir, { recursive: true });
      } catch (e) {
        console.warn("Could not create whatsapp-auth directory:", e);
      }
    }

    this.registerIpcHandlers();

    // If an authenticated session already exists on disk, auto-connect
    this.checkExistingSessionAndAutoConnect();
  }

  hasSavedSession() {
    if (!this.authDir || !fs.existsSync(this.authDir)) return false;
    try {
      const files = fs.readdirSync(this.authDir);
      return files.some((f) => f.includes("creds.json"));
    } catch (_) {
      return false;
    }
  }

  async checkExistingSessionAndAutoConnect() {
    if (this.hasSavedSession()) {
      console.log("[WhatsAppService] Existing session credentials found. Reconnecting...");
      this.startSession(false);
    }
  }

  notifyRenderer(eventName, payload) {
    try {
      const win = typeof this.getMainWindow === "function" ? this.getMainWindow() : null;
      if (win && !win.isDestroyed() && win.webContents) {
        win.webContents.send(eventName, payload);
      }
    } catch (err) {
      console.warn("[WhatsAppService] Error notifying renderer:", err.message);
    }
  }

  getStatus() {
    return {
      status: this.status,
      connected: this.status === "connected",
      user: this.currentUser,
      qrDataUrl: this.status === "qr" ? this.currentQrDataUrl : null,
      rawQr: this.status === "qr" ? this.currentQrRaw : null,
      hasSavedSession: this.hasSavedSession(),
    };
  }

  async startSession(forceNew = false) {
    if (!makeWASocket || !useMultiFileAuthState) {
      console.error("[WhatsAppService] Baileys is not available.");
      return { success: false, error: "WhatsApp engine (Baileys) is not installed." };
    }

    if (this.isStarting) {
      return { success: true, status: this.status };
    }

    if (this.sock && this.status === "connected" && !forceNew) {
      return { success: true, status: "connected", user: this.currentUser };
    }

    this.isStarting = true;
    this.shouldReconnect = true;
    this.status = "connecting";
    this.notifyRenderer("whatsapp:status-update", this.getStatus());

    try {
      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

      let version = [2, 3000, 1043857760];
      try {
        if (fetchLatestBaileysVersion) {
          const v = await fetchLatestBaileysVersion();
          if (v && v.version) version = v.version;
        }
      } catch (_) {}

      // Clean up existing socket if any
      if (this.sock) {
        try {
          this.sock.ev.removeAllListeners();
          this.sock.end(undefined);
        } catch (_) {}
        this.sock = null;
      }

      const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: "silent" }),
        printQRInTerminal: false,
        browser: ["ZynBill Desktop", "Chrome", "1.1.0"],
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
      });

      this.sock = sock;

      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          console.log("[WhatsAppService] Real WhatsApp Web QR emitted by server.");
          this.status = "qr";
          this.currentQrRaw = qr;
          try {
            this.currentQrDataUrl = await QRCode.toDataURL(qr, {
              margin: 1,
              scale: 6,
              color: { dark: "#0f172a", light: "#ffffff" },
            });
          } catch (qrErr) {
            console.error("[WhatsAppService] Error creating QR image:", qrErr);
          }
          this.notifyRenderer("whatsapp:status-update", this.getStatus());
        }

        if (connection === "open") {
          console.log("[WhatsAppService] WhatsApp connection opened successfully!");
          this.status = "connected";
          this.currentQrRaw = null;
          this.currentQrDataUrl = null;
          this.currentUser = {
            id: sock.user?.id || "",
            name: sock.user?.name || sock.user?.notify || "ZynBill User",
            phone: (sock.user?.id || "").split(":")[0] || (sock.user?.id || "").split("@")[0] || "",
          };
          this.notifyRenderer("whatsapp:status-update", this.getStatus());
        } else if (connection === "close") {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const shouldRestart = statusCode !== DisconnectReason?.loggedOut && this.shouldReconnect;

          console.log(`[WhatsAppService] Connection closed with statusCode: ${statusCode}, shouldRestart: ${shouldRestart}`);

          if (statusCode === DisconnectReason?.loggedOut) {
            console.log("[WhatsAppService] Logged out from WhatsApp mobile device.");
            await this.clearAuthDirectory();
            this.status = "disconnected";
            this.currentUser = null;
            this.currentQrDataUrl = null;
            this.notifyRenderer("whatsapp:status-update", this.getStatus());
          } else if (shouldRestart) {
            this.status = "connecting";
            this.notifyRenderer("whatsapp:status-update", this.getStatus());
            setTimeout(() => {
              if (this.shouldReconnect) this.startSession(false);
            }, 3000);
          } else {
            this.status = "disconnected";
            this.notifyRenderer("whatsapp:status-update", this.getStatus());
          }
        }
      });

      this.isStarting = false;
      return { success: true, status: this.status };
    } catch (err) {
      console.error("[WhatsAppService] Error in startSession:", err);
      this.isStarting = false;
      this.status = "disconnected";
      this.notifyRenderer("whatsapp:status-update", this.getStatus());
      return { success: false, error: err?.message || String(err) };
    }
  }

  async clearAuthDirectory() {
    if (!this.authDir || !fs.existsSync(this.authDir)) return;
    try {
      const files = fs.readdirSync(this.authDir);
      for (const file of files) {
        try {
          fs.rmSync(path.join(this.authDir, file), { recursive: true, force: true });
        } catch (_) {}
      }
    } catch (e) {
      console.warn("[WhatsAppService] Could not clear auth dir:", e.message);
    }
  }

  async disconnect() {
    this.shouldReconnect = false;
    this.status = "disconnected";
    this.currentQrRaw = null;
    this.currentQrDataUrl = null;
    this.currentUser = null;

    if (this.sock) {
      try {
        await this.sock.logout().catch(() => {});
        this.sock.ev.removeAllListeners();
        this.sock.end(undefined);
      } catch (_) {}
      this.sock = null;
    }

    await this.clearAuthDirectory();
    this.notifyRenderer("whatsapp:status-update", this.getStatus());
    return { success: true };
  }

  formatPhoneJid(rawPhone) {
    if (!rawPhone) return "";
    let clean = String(rawPhone).replace(/\D/g, "");
    if (!clean) return "";
    // If standard 10 digit Indian number without country code, prepend 91
    if (clean.length === 10) {
      clean = "91" + clean;
    }
    return clean + "@s.whatsapp.net";
  }

  async sendMessage({ phone, message, pdfPath, pdfName }) {
    if (this.status !== "connected" || !this.sock) {
      return {
        success: false,
        error: "WhatsApp is not connected. Please scan the QR code in WhatsApp Connect.",
      };
    }

    const jid = this.formatPhoneJid(phone);
    if (!jid) {
      return { success: false, error: "Invalid recipient phone number." };
    }

    try {
      const text = String(message || "").trim();

      // If a PDF document is provided
      if (pdfPath && fs.existsSync(pdfPath)) {
        const fileBuffer = fs.readFileSync(pdfPath);
        const fileName = pdfName ? path.basename(pdfName) : "Invoice.pdf";
        const result = await this.sock.sendMessage(jid, {
          document: fileBuffer,
          mimetype: "application/pdf",
          fileName: fileName,
          caption: text || undefined,
        });
        return { success: true, messageId: result?.key?.id };
      }

      // Plain text message
      if (!text) {
        return { success: false, error: "Cannot send an empty message." };
      }

      const result = await this.sock.sendMessage(jid, { text });
      return { success: true, messageId: result?.key?.id };
    } catch (err) {
      console.error("[WhatsAppService] Error sending message:", err);
      return { success: false, error: err?.message || String(err) };
    }
  }

  registerIpcHandlers() {
    if (!this.ipcMain) return;

    this.ipcMain.handle("whatsapp:get-status", async () => {
      return this.getStatus();
    });

    this.ipcMain.handle("whatsapp:start-session", async (_event, forceNew) => {
      return this.startSession(Boolean(forceNew));
    });

    this.ipcMain.handle("whatsapp:disconnect", async () => {
      return this.disconnect();
    });

    this.ipcMain.handle("whatsapp:send-message", async (_event, payload) => {
      return this.sendMessage(payload || {});
    });
  }
}

const whatsappService = new WhatsAppService();

module.exports = {
  whatsappService,
  WhatsAppService,
};
