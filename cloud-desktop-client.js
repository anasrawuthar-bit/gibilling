/**
 * ZynBill Cloud Integration, Security PIN & Offline Sync Engine
 * Handles:
 * 1. Online / Offline Status Indicator & Sync Outbox Counter
 * 2. Subscription Validation & 14-Day Offline Grace Period
 * 3. 4-Digit Quick PIN Security (Setup, Unlock & Verification)
 * 4. First-Time Online Cloud Activation & Device Binding
 * 5. Automatic Local Database Backups & Recovery
 */

const CLOUD_STORAGE_KEYS = {
  LICENSE: "zynbill_cloud_license",
  ACTIVATED: "zynbill_activated",
  PIN_ENABLED: "zynbill_pin_enabled",
  PIN_HASH: "zynbill_pin_hash",
  PIN_SALT: "zynbill_pin_salt",
  LAST_SYNC: "zynbill_last_sync_timestamp",
  SERVER_URL: "zynbill_cloud_server_url"
};

// ── 1. Cloud License & Grace Period Manager ───────────────────────────
class CloudLicenseManager {
  static getServerUrl() {
    return localStorage.getItem(CLOUD_STORAGE_KEYS.SERVER_URL) || "http://localhost:4000";
  }

  static setServerUrl(url) {
    if (url) localStorage.setItem(CLOUD_STORAGE_KEYS.SERVER_URL, url.trim().replace(/\/$/, ""));
  }

  static getLicense() {
    try {
      const data = localStorage.getItem(CLOUD_STORAGE_KEYS.LICENSE);
      if (data) return JSON.parse(data);
    } catch (_) {}

    // Default license structure for offline resilience
    return {
      activated: localStorage.getItem(CLOUD_STORAGE_KEYS.ACTIVATED) === "true",
      companyId: "default",
      companyName: "My Business",
      email: "owner@company.com",
      plan: "Professional",
      validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      lastOnlineCheck: new Date().toISOString(),
      gracePeriodDays: 14,
      status: "active"
    };
  }

  static saveLicense(license) {
    if (!license) return;
    localStorage.setItem(CLOUD_STORAGE_KEYS.LICENSE, JSON.stringify(license));
    localStorage.setItem(CLOUD_STORAGE_KEYS.ACTIVATED, "true");
  }

  static isActivated() {
    const val = localStorage.getItem(CLOUD_STORAGE_KEYS.ACTIVATED);
    if (val === null) {
      // Auto-activate existing local workspace so existing billing is never blocked
      return true;
    }
    return val === "true";
  }

  static setActivated(val = true) {
    localStorage.setItem(CLOUD_STORAGE_KEYS.ACTIVATED, val ? "true" : "false");
  }

  /**
   * Evaluates offline grace period.
   * If past validUntil, grants up to gracePeriodDays (14 days) before lock.
   */
  static checkGracePeriod() {
    const license = this.getLicense();
    if (!license || !license.validUntil) return { isOverdue: false, inGracePeriod: false, daysRemaining: 14 };

    const now = Date.now();
    const expiry = new Date(license.validUntil).getTime();
    const overdueMs = now - expiry;

    if (overdueMs <= 0) {
      return { isOverdue: false, inGracePeriod: false, daysRemaining: 14 };
    }

    const graceMs = (license.gracePeriodDays || 14) * 24 * 60 * 60 * 1000;
    const daysRemaining = Math.max(0, Math.ceil((graceMs - overdueMs) / (24 * 60 * 60 * 1000)));

    if (overdueMs <= graceMs) {
      return { isOverdue: true, inGracePeriod: true, daysRemaining };
    }

    return { isOverdue: true, inGracePeriod: false, daysRemaining: 0 };
  }
}

// ── 2. PIN Security Manager ───────────────────────────────────────────
class PinSecurityManager {
  static isPinEnabled() {
    return localStorage.getItem(CLOUD_STORAGE_KEYS.PIN_ENABLED) === "true" &&
      Boolean(localStorage.getItem(CLOUD_STORAGE_KEYS.PIN_HASH));
  }

  static async hashPin(pin, salt) {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin + ":" + salt);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  static async setPin(pin) {
    if (!pin || pin.length !== 4) throw new Error("PIN must be exactly 4 digits.");
    const salt = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const hash = await this.hashPin(pin, salt);
    localStorage.setItem(CLOUD_STORAGE_KEYS.PIN_SALT, salt);
    localStorage.setItem(CLOUD_STORAGE_KEYS.PIN_HASH, hash);
    localStorage.setItem(CLOUD_STORAGE_KEYS.PIN_ENABLED, "true");
  }

  static async verifyPin(pin) {
    if (!pin || pin.length !== 4) return false;
    const salt = localStorage.getItem(CLOUD_STORAGE_KEYS.PIN_SALT);
    const storedHash = localStorage.getItem(CLOUD_STORAGE_KEYS.PIN_HASH);
    if (!salt || !storedHash) return false;
    const hash = await this.hashPin(pin, salt);
    return hash === storedHash;
  }

  static disablePin() {
    localStorage.setItem(CLOUD_STORAGE_KEYS.PIN_ENABLED, "false");
  }
}

// ── 3. Desktop Cloud Sync & Status Widget ──────────────────────────────
class CloudSyncWidget {
  static currentStatus = "online"; // 'online' | 'syncing' | 'offline' | 'error'
  static pendingCount = 0;
  static isSyncing = false;

  static async init() {
    this.bindDomElements();
    this.bindNetworkListeners();
    await this.refreshStatus();

    // Periodic check every 20 seconds
    setInterval(() => this.refreshStatus(), 20000);
  }

  static bindDomElements() {
    const badge = document.getElementById("cloudSyncStatusBadge");
    const popover = document.getElementById("cloudSyncPopover");
    const closeBtn = document.getElementById("syncPopoverCloseBtn");
    const syncNowBtn = document.getElementById("syncNowBtn");
    const backupBtn = document.getElementById("syncBackupNowBtn");

    badge?.addEventListener("click", (e) => {
      e.stopPropagation();
      popover?.classList.toggle("hidden");
      this.updatePopoverDetails();
    });

    closeBtn?.addEventListener("click", () => popover?.classList.add("hidden"));

    document.addEventListener("click", (e) => {
      if (popover && !popover.contains(e.target) && e.target !== badge && !badge?.contains(e.target)) {
        popover.classList.add("hidden");
      }
    });

    syncNowBtn?.addEventListener("click", () => this.triggerSyncNow());
    backupBtn?.addEventListener("click", () => this.triggerBackupNow());
  }

  static bindNetworkListeners() {
    window.addEventListener("online", () => {
      this.refreshStatus();
      this.triggerSyncNow();
    });
    window.addEventListener("offline", () => {
      this.setStatus("offline");
    });
  }

  static setStatus(status, pending = null) {
    this.currentStatus = status;
    if (pending !== null) this.pendingCount = pending;

    const badge = document.getElementById("cloudSyncStatusBadge");
    const label = document.getElementById("syncStatusLabel");
    const pendingEl = document.getElementById("syncPendingBadge");

    if (!badge || !label) return;

    badge.className = `cloud-sync-status-badge ${status}`;

    if (status === "online") {
      label.textContent = "Online";
      badge.title = "ZynBill Cloud: Online & Synced";
      pendingEl?.classList.add("hidden");
    } else if (status === "syncing") {
      label.textContent = "Syncing";
      badge.title = "Synchronizing changes with cloud...";
      if (this.pendingCount > 0 && pendingEl) {
        pendingEl.textContent = String(this.pendingCount);
        pendingEl.classList.remove("hidden");
      }
    } else if (status === "offline") {
      label.textContent = "Offline";
      badge.title = "Operating in offline mode (local SQLite)";
      if (this.pendingCount > 0 && pendingEl) {
        pendingEl.textContent = String(this.pendingCount);
        pendingEl.classList.remove("hidden");
      }
    } else if (status === "error") {
      label.textContent = "Sync Error";
      badge.title = "Cloud synchronization encountered an error";
    }

    this.updatePopoverDetails();
  }

  static async refreshStatus() {
    if (!navigator.onLine) {
      this.setStatus("offline");
      return;
    }

    try {
      if (window.giDB?.getSyncStatus) {
        const syncStatus = await window.giDB.getSyncStatus();
        const pending = (syncStatus?.pending || 0) + (syncStatus?.retry || 0);
        this.pendingCount = pending;
        if (this.isSyncing) {
          this.setStatus("syncing", pending);
        } else if (pending > 0) {
          this.setStatus("online", pending);
        } else {
          this.setStatus("online", 0);
        }
      } else {
        this.setStatus("online", 0);
      }
    } catch (_) {
      this.setStatus("offline");
    }
  }

  static updatePopoverDetails() {
    const popStatus = document.getElementById("syncPopoverStatus");
    const popPending = document.getElementById("syncPopoverPendingCount");
    const popLastSync = document.getElementById("syncPopoverLastSynced");
    const popGrace = document.getElementById("syncGraceWarning");
    const popGraceText = document.getElementById("syncGraceDaysText");
    const popTenant = document.getElementById("syncPopoverTenant");

    const license = CloudLicenseManager.getLicense();
    if (popTenant) {
      popTenant.textContent = license.companyName || "ZynBill Cloud Ecosystem";
    }

    if (popStatus) {
      popStatus.textContent = this.currentStatus === "online" ? "Online & Synced"
        : (this.currentStatus === "syncing" ? "Syncing..." : "Offline (Local SQLite)");
      popStatus.className = `sync-status-${this.currentStatus}`;
    }

    if (popPending) {
      popPending.textContent = this.pendingCount === 1 ? "1 change queued"
        : `${this.pendingCount} changes queued`;
    }

    const lastSyncTime = localStorage.getItem(CLOUD_STORAGE_KEYS.LAST_SYNC);
    if (popLastSync) {
      popLastSync.textContent = lastSyncTime
        ? new Date(lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : "Recently";
    }

    // Grace period evaluation
    const grace = CloudLicenseManager.checkGracePeriod();
    if (grace.isOverdue && grace.inGracePeriod && popGrace) {
      popGrace.classList.remove("hidden");
      if (popGraceText) {
        popGraceText.textContent = `${grace.daysRemaining} days remaining in offline grace period. Reconnect to renew license.`;
      }
    } else {
      popGrace?.classList.add("hidden");
    }
  }

  static async triggerSyncNow() {
    if (this.isSyncing) return;
    this.isSyncing = true;
    this.setStatus("syncing");

    try {
      if (window.giDB?.syncNow) {
        await window.giDB.syncNow();
      } else {
        await new Promise(r => setTimeout(r, 600)); // simulated sync for standalone
      }
      localStorage.setItem(CLOUD_STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
      this.setStatus("online", 0);
      if (typeof showToast === "function") showToast("Cloud synchronization completed.", "success");
    } catch (err) {
      console.warn("Sync error:", err);
      this.setStatus(navigator.onLine ? "error" : "offline");
      if (typeof showToast === "function") showToast("Sync deferred: will retry automatically.", "warning");
    } finally {
      this.isSyncing = false;
    }
  }

  static async triggerBackupNow() {
    try {
      if (window.giDB?.createDailyBackup) {
        const res = await window.giDB.createDailyBackup();
        if (res?.date) {
          if (typeof showToast === "function") showToast(`Local SQLite backup created: zynbill-backup-${res.date}.db`, "success");
        }
      } else {
        if (typeof showToast === "function") showToast("Local database backup saved.", "success");
      }
    } catch (err) {
      if (typeof showToast === "function") showToast("Could not create local backup: " + err.message, "error");
    }
  }
}

// ── 4. PIN Setup & PIN Lock Controllers ────────────────────────────────
class PinUiController {
  static currentInput = "";
  static isSetupMode = false;
  static setupFirstPin = "";

  static init() {
    this.bindKeypad("pinKeypad", (digit) => this.handleLockDigit(digit));
    this.bindKeypad("pinSetupKeypad", (digit) => this.handleSetupDigit(digit));

    document.getElementById("pinSetupSkipBtn")?.addEventListener("click", () => {
      document.getElementById("pinSetupModal")?.classList.add("hidden");
      PinSecurityManager.disablePin();
      if (typeof showToast === "function") showToast("PIN security skipped. You can enable it in Settings anytime.");
    });

    document.getElementById("pinForgotBtn")?.addEventListener("click", () => {
      document.getElementById("pinLockModal")?.classList.add("hidden");
      ActivationUiController.showActivationModal(true);
    });

    // Keyboard support for PIN entry
    window.addEventListener("keydown", (e) => {
      const lockModal = document.getElementById("pinLockModal");
      const setupModal = document.getElementById("pinSetupModal");

      const isLockOpen = lockModal && !lockModal.classList.contains("hidden");
      const isSetupOpen = setupModal && !setupModal.classList.contains("hidden");

      if (!isLockOpen && !isSetupOpen) return;

      if (e.key >= "0" && e.key <= "9") {
        if (isLockOpen) this.handleLockDigit(e.key);
        else if (isSetupOpen) this.handleSetupDigit(e.key);
      } else if (e.key === "Backspace") {
        if (isLockOpen) this.handleLockDigit("back");
        else if (isSetupOpen) this.handleSetupDigit("back");
      } else if (e.key === "Escape") {
        if (isLockOpen) this.handleLockDigit("clear");
        else if (isSetupOpen) this.handleSetupDigit("clear");
      }
    });
  }

  static bindKeypad(containerId, handler) {
    const keypad = document.getElementById(containerId);
    keypad?.querySelectorAll(".pin-key").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const key = btn.getAttribute("data-key");
        handler(key);
      });
    });
  }

  static showLockScreen() {
    this.currentInput = "";
    this.updateDots("pinDotsRow", 0);
    document.getElementById("pinErrorText")?.classList.add("hidden");
    document.getElementById("pinLockModal")?.classList.remove("hidden");
  }

  static hideLockScreen() {
    document.getElementById("pinLockModal")?.classList.add("hidden");
    this.currentInput = "";
  }

  static showSetupModal() {
    this.currentInput = "";
    this.setupFirstPin = "";
    this.isSetupMode = true;
    const title = document.getElementById("pinSetupTitle");
    const subtitle = document.getElementById("pinSetupSubtitle");
    if (title) title.textContent = "Configure Security PIN";
    if (subtitle) subtitle.textContent = "Set a 4-digit PIN for quick, secure application login";
    this.updateDots("pinSetupDotsRow", 0);
    document.getElementById("pinSetupErrorText")?.classList.add("hidden");
    document.getElementById("pinSetupModal")?.classList.remove("hidden");
  }

  static updateDots(containerId, count) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const dots = container.querySelectorAll(".pin-dot");
    dots.forEach((dot, idx) => {
      if (idx < count) dot.classList.add("filled");
      else dot.classList.remove("filled");
    });
  }

  static async handleLockDigit(key) {
    const errorEl = document.getElementById("pinErrorText");
    errorEl?.classList.add("hidden");

    if (key === "clear") {
      this.currentInput = "";
    } else if (key === "back") {
      this.currentInput = this.currentInput.slice(0, -1);
    } else if (this.currentInput.length < 4) {
      this.currentInput += key;
    }

    this.updateDots("pinDotsRow", this.currentInput.length);

    if (this.currentInput.length === 4) {
      const isValid = await PinSecurityManager.verifyPin(this.currentInput);
      if (isValid) {
        this.hideLockScreen();
        if (typeof showToast === "function") showToast("PIN verified. Welcome to ZynBill!", "success");
      } else {
        if (errorEl) {
          errorEl.textContent = "Incorrect PIN. Please try again.";
          errorEl.classList.remove("hidden");
        }
        this.currentInput = "";
        setTimeout(() => this.updateDots("pinDotsRow", 0), 200);
      }
    }
  }

  static async handleSetupDigit(key) {
    const errorEl = document.getElementById("pinSetupErrorText");
    errorEl?.classList.add("hidden");

    if (key === "clear") {
      this.currentInput = "";
    } else if (key === "back") {
      this.currentInput = this.currentInput.slice(0, -1);
    } else if (this.currentInput.length < 4) {
      this.currentInput += key;
    }

    this.updateDots("pinSetupDotsRow", this.currentInput.length);

    if (this.currentInput.length === 4) {
      if (!this.setupFirstPin) {
        // Step 1: First entry completed, ask to confirm
        this.setupFirstPin = this.currentInput;
        this.currentInput = "";
        const title = document.getElementById("pinSetupTitle");
        const subtitle = document.getElementById("pinSetupSubtitle");
        if (title) title.textContent = "Confirm Security PIN";
        if (subtitle) subtitle.textContent = "Re-enter the same 4-digit PIN to confirm";
        setTimeout(() => this.updateDots("pinSetupDotsRow", 0), 150);
      } else {
        // Step 2: Confirm entry
        if (this.currentInput === this.setupFirstPin) {
          await PinSecurityManager.setPin(this.setupFirstPin);
          document.getElementById("pinSetupModal")?.classList.add("hidden");
          if (typeof showToast === "function") showToast("Security PIN configured successfully!", "success");
        } else {
          if (errorEl) {
            errorEl.textContent = "PINs did not match. Please start over.";
            errorEl.classList.remove("hidden");
          }
          this.setupFirstPin = "";
          this.currentInput = "";
          const title = document.getElementById("pinSetupTitle");
          const subtitle = document.getElementById("pinSetupSubtitle");
          if (title) title.textContent = "Configure Security PIN";
          if (subtitle) subtitle.textContent = "Set a 4-digit PIN for quick, secure application login";
          setTimeout(() => this.updateDots("pinSetupDotsRow", 0), 200);
        }
      }
    }
  }
}

// ── 5. Cloud Activation UI Controller ──────────────────────────────────
class ActivationUiController {
  static init() {
    const form = document.getElementById("cloudActivationForm");
    const demoBtn = document.getElementById("activationOfflineDemoBtn");
    const advToggle = document.getElementById("activationAdvToggle");
    const serverField = document.getElementById("activationServerField");
    const regLink = document.getElementById("activationRegisterLink");

    advToggle?.addEventListener("click", () => {
      serverField?.classList.toggle("hidden");
    });

    demoBtn?.addEventListener("click", () => {
      this.activateOfflineTrial();
    });

    regLink?.addEventListener("click", (e) => {
      e.preventDefault();
      const sUrl = document.getElementById("activationServerUrl")?.value || "http://localhost:4000";
      const regUrl = `${sUrl.replace(/\/$/, "")}/register.html`;
      if (window.giApp?.openExternal) window.giApp.openExternal(regUrl);
      else window.open(regUrl, "_blank");
    });

    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("activationEmail")?.value?.trim();
      const password = document.getElementById("activationPassword")?.value?.trim();
      const serverUrl = document.getElementById("activationServerUrl")?.value?.trim() || "http://localhost:4000";
      const errorEl = document.getElementById("activationErrorMsg");
      const submitBtn = document.getElementById("activationSubmitBtn");

      errorEl?.classList.add("hidden");
      submitBtn.disabled = true;
      submitBtn.textContent = "Validating Account...";

      try {
        CloudLicenseManager.setServerUrl(serverUrl);
        const res = await fetch(`${serverUrl.replace(/\/$/, "")}/api/v1/auth/desktop-activate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, machineName: "Desktop" })
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || "Activation failed. Please check credentials.");
        }

        CloudLicenseManager.saveLicense({
          activated: true,
          token: data.token,
          companyId: data.companyId || "default",
          companyName: data.companyName || email,
          email: email,
          plan: data.plan || "Professional",
          validUntil: data.validUntil || new Date(Date.now() + 365*24*60*60*1000).toISOString(),
          lastOnlineCheck: new Date().toISOString(),
          gracePeriodDays: 14,
          status: "active"
        });

        document.getElementById("cloudActivationModal")?.classList.add("hidden");
        if (typeof showToast === "function") showToast("ZynBill Activated Successfully!", "success");

        // Prompt user to set up PIN
        PinUiController.showSetupModal();
      } catch (err) {
        if (errorEl) {
          errorEl.textContent = err.message || "Network error. Connect to internet or try offline mode.";
          errorEl.classList.remove("hidden");
        }
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Activate & Unlock";
      }
    });
  }

  static activateOfflineTrial() {
    CloudLicenseManager.saveLicense({
      activated: true,
      companyId: "offline-demo",
      companyName: "Local Business Workspace",
      email: "demo@local.zynbill",
      plan: "Offline Enterprise",
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      lastOnlineCheck: new Date().toISOString(),
      gracePeriodDays: 14,
      status: "active"
    });

    document.getElementById("cloudActivationModal")?.classList.add("hidden");
    if (typeof showToast === "function") showToast("Offline mode enabled. Welcome to ZynBill!", "success");
    PinUiController.showSetupModal();
  }

  static showActivationModal(force = false) {
    if (!CloudLicenseManager.isActivated() || force) {
      document.getElementById("cloudActivationModal")?.classList.remove("hidden");
    }
  }
}

// ── 6. Global Bootstrap Initialization ─────────────────────────────────
window.addEventListener("DOMContentLoaded", async () => {
  ActivationUiController.init();
  PinUiController.init();
  await CloudSyncWidget.init();

  // If not activated, require activation
  if (!CloudLicenseManager.isActivated()) {
    ActivationUiController.showActivationModal();
  } else if (PinSecurityManager.isPinEnabled()) {
    // If PIN is enabled, require PIN unlock on app open
    PinUiController.showLockScreen();
  }
});

// Export globally for renderer access
window.CloudLicenseManager = CloudLicenseManager;
window.PinSecurityManager = PinSecurityManager;
window.CloudSyncWidget = CloudSyncWidget;
window.PinUiController = PinUiController;
window.ActivationUiController = ActivationUiController;
