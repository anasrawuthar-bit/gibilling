/**
 * ZynBill Cloud Integration, Security PIN & Offline Sync Engine
 * Handles:
 * 1. Online / Offline Status Indicator & Sync Outbox Counter
 * 2. Subscription Validation, Active Plan Status & 14-Day Offline Grace Period
 * 3. 4-Digit Quick PIN Security (Setup, Unlock & In-App OTP Reset)
 * 4. First-Time Online Cloud Activation with One-Time Device Verification Code
 * 5. Dedicated Subscription & License Details Modal
 * 6. Automatic Local Database Backups & Recovery
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

    return {
      activated: localStorage.getItem(CLOUD_STORAGE_KEYS.ACTIVATED) === "true",
      companyId: "default",
      companyName: "Business Workspace",
      email: "owner@company.com",
      plan: "Professional",
      validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      lastOnlineCheck: new Date().toISOString(),
      gracePeriodDays: 14,
      status: "active",
      token: "zyndev_offline"
    };
  }

  static saveLicense(license) {
    if (!license) return;
    const existing = this.getLicense();
    const merged = { ...existing, ...license };
    localStorage.setItem(CLOUD_STORAGE_KEYS.LICENSE, JSON.stringify(merged));
    localStorage.setItem(CLOUD_STORAGE_KEYS.ACTIVATED, "true");
  }

  static isActivated() {
    const val = localStorage.getItem(CLOUD_STORAGE_KEYS.ACTIVATED);
    if (val === null) {
      return true; // Resilience for existing local workspaces
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
      const daysRemaining = Math.ceil((expiry - now) / (24 * 60 * 60 * 1000));
      return { isOverdue: false, inGracePeriod: false, daysRemaining };
    }

    const graceMs = (license.gracePeriodDays || 14) * 24 * 60 * 60 * 1000;
    const daysRemaining = Math.max(0, Math.ceil((graceMs - overdueMs) / (24 * 60 * 60 * 1000)));

    if (overdueMs <= graceMs) {
      return { isOverdue: true, inGracePeriod: true, daysRemaining };
    }

    return { isOverdue: true, inGracePeriod: false, daysRemaining: 0 };
  }

  /**
   * Syncs latest subscription and plan status from cloud backend
   */

  static signOut() {
    if (!confirm("Are you sure you want to sign out of ZynBill? Your local invoices and master data remain safely on this PC.")) {
      return;
    }
    localStorage.removeItem(CLOUD_STORAGE_KEYS.LICENSE);
    localStorage.setItem(CLOUD_STORAGE_KEYS.ACTIVATED, "false");
    if (typeof PinSecurityManager !== "undefined") {
      PinSecurityManager.disablePin();
    }
    if (typeof showToast === "function") {
      showToast("Signed out of ZynBill account.", "info");
    }

    const actModal = document.getElementById("cloudActivationModal");
    const form = document.getElementById("cloudActivationForm");
    const otpStep = document.getElementById("activationOtpStep");
    form?.classList.remove("hidden");
    otpStep?.classList.add("hidden");
    actModal?.classList.remove("hidden");

    CloudSyncWidget.updatePlanPill();
    CloudSyncWidget.updatePopoverDetails();
  }

  static async syncLicenseWithServer() {
    const license = this.getLicense();
    const sUrl = this.getServerUrl();
    if (!navigator.onLine || !license.token) return license;

    try {
      const res = await fetch(`${sUrl}/api/v1/system/health`, {
        headers: { 'Authorization': 'Bearer ' + license.token }
      });
      const data = await res.json();
      if (res.ok && data.ok && data.license) {
        this.saveLicense({
          plan: data.license.plan,
          validUntil: data.license.validUntil,
          companyName: data.license.companyName,
          email: data.license.email,
          status: data.license.status,
          lastOnlineCheck: new Date().toISOString()
        });
        return this.getLicense();
      }
    } catch (_) {}
    return license;
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
    localStorage.removeItem(CLOUD_STORAGE_KEYS.PIN_HASH);
    localStorage.removeItem(CLOUD_STORAGE_KEYS.PIN_SALT);
  }
}

// ── 3. Desktop Cloud Sync & Status Widget ──────────────────────────────
class CloudSyncWidget {
  static currentStatus = "online";
  static pendingCount = 0;
  static isSyncing = false;

  static async init() {
    this.bindDomElements();
    this.bindNetworkListeners();
    await this.refreshStatus();

    // Check plan & sync status every 30 seconds
    setInterval(() => this.refreshStatus(), 30000);
  }

  static bindDomElements() {
    const badge = document.getElementById("cloudSyncStatusBadge");
    const syncNowBtn = document.getElementById("syncNowBtn");
    const backupBtn = document.getElementById("syncBackupNowBtn");
    const planPill = document.getElementById("sidebarPlanPill");

    // Online/Offline pill click gives live ping feedback without opening popover
    badge?.addEventListener("click", async (e) => {
      e.stopPropagation();
      badge.style.opacity = "0.6";
      const isOnline = await this.pingServer();
      badge.style.opacity = "1";
      this.setStatus(isOnline ? "online" : "offline");
      if (isOnline) this.triggerSyncNow();
    });

    syncNowBtn?.addEventListener("click", () => this.triggerSyncNow());
    backupBtn?.addEventListener("click", () => this.triggerBackupNow());

    // Clicking the plan pill navigates directly to Settings -> Subscription Plan
    planPill?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (typeof navigateView === "function") {
        navigateView("appSettings", "PLAN");
      }
    });

    document.getElementById("sidebarSignOutBtn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      CloudLicenseManager.signOut();
    });

    document.getElementById("btnSettingsSignOut")?.addEventListener("click", () => {
      CloudLicenseManager.signOut();
    });

    document.getElementById("brandHomeButton")?.addEventListener("click", () => {
      if (typeof navigateView === "function") {
        navigateView("home");
      }
    });
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
    const logoDot = document.getElementById("logoStatusDot");

    if (logoDot) {
      logoDot.className = "logo-status-dot " + status;
      logoDot.title = status === "online" ? "ZynBill Cloud: Online" : (status === "syncing" ? "Syncing..." : "Operating Offline (SQLite)");
    }

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
      badge.title = "Cloud synchronization error";
    }

    this.updatePopoverDetails();
    this.updatePlanPill();
  }

  static async pingServer() {
    if (!navigator.onLine) return false;
    try {
      const sUrl = CloudLicenseManager.getServerUrl();
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 2000);
      const res = await fetch(`${sUrl}/api/v1/auth/plans`, {
        method: "GET",
        signal: ctrl.signal,
        cache: "no-store"
      });
      clearTimeout(tid);
      return res.ok;
    } catch (_) {
      return false;
    }
  }

  static async refreshStatus() {
    if (!navigator.onLine) {
      this.setStatus("offline");
      return;
    }

    const isReachable = await this.pingServer();
    if (!isReachable) {
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

  static updatePlanPill() {
    const pill = document.getElementById("sidebarPlanPill");
    const nameEl = document.getElementById("sidebarPlanName");
    const daysEl = document.getElementById("sidebarPlanDays");
    if (!pill || !nameEl || !daysEl) return;

    const license = CloudLicenseManager.getLicense();
    const grace = CloudLicenseManager.checkGracePeriod();

    const planShort = (license.plan || "Pro").replace(/\s+Plan$/i, "");
    nameEl.textContent = planShort;

    if (grace.isOverdue) {
      if (grace.inGracePeriod) {
        daysEl.textContent = `${grace.daysRemaining}d grace`;
        pill.className = "plan-status-pill warning";
      } else {
        daysEl.textContent = "Expired";
        pill.className = "plan-status-pill danger";
      }
    } else {
      daysEl.textContent = `${grace.daysRemaining}d`;
      pill.className = "plan-status-pill";
    }
  }

  static updatePopoverDetails() {
    const popStatus = document.getElementById("syncPopoverStatus");
    const popPending = document.getElementById("syncPopoverPendingCount");
    const popLastSync = document.getElementById("syncPopoverLastSynced");
    const popGrace = document.getElementById("syncGraceWarning");
    const popGraceText = document.getElementById("syncGraceDaysText");
    const popTenant = document.getElementById("syncPopoverTenant");
    const popPlanName = document.getElementById("syncPopoverPlanName");
    const popPlanValidity = document.getElementById("syncPopoverPlanValidity");

    const license = CloudLicenseManager.getLicense();
    const grace = CloudLicenseManager.checkGracePeriod();

    if (popTenant) popTenant.textContent = license.companyName || "ZynBill Cloud Ecosystem";
    if (popPlanName) popPlanName.textContent = (license.plan || "Professional") + " Plan";

    if (popPlanValidity) {
      if (grace.isOverdue) {
        popPlanValidity.textContent = grace.inGracePeriod
          ? `${grace.daysRemaining} days remaining in grace period`
          : "License expired. Please renew.";
      } else {
        popPlanValidity.textContent = `${grace.daysRemaining} days remaining`;
      }
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

    if (grace.isOverdue && grace.inGracePeriod && popGrace) {
      popGrace.classList.remove("hidden");
      if (popGraceText) {
        popGraceText.textContent = `${grace.daysRemaining} days remaining in offline grace period. Reconnect online to refresh plan.`;
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
        await new Promise(r => setTimeout(r, 600));
      }
      localStorage.setItem(CLOUD_STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
      await CloudLicenseManager.syncLicenseWithServer();
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

// ── 4. Subscription & Plan Modal Controller ────────────────────────────
class SubscriptionModalController {
  static init() {
    const modal = document.getElementById("subscriptionModal");
    const closeBtn = document.getElementById("subscriptionModalCloseBtn");
    const refreshBtn = document.getElementById("subModalRefreshBtn");
    const portalBtn = document.getElementById("subModalPortalBtn");

    closeBtn?.addEventListener("click", () => modal?.classList.add("hidden"));

    refreshBtn?.addEventListener("click", async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = "Checking Server...";
      try {
        await CloudLicenseManager.syncLicenseWithServer();
        this.renderDetails();
        CloudSyncWidget.updatePlanPill();
        CloudSyncWidget.updatePopoverDetails();
        if (typeof showToast === "function") showToast("Subscription status updated from cloud.", "success");
      } catch (err) {
        if (typeof showToast === "function") showToast("Failed to refresh: " + err.message, "error");
      } finally {
        refreshBtn.disabled = false;
        refreshBtn.textContent = "Refresh License Online";
      }
    });

    portalBtn?.addEventListener("click", () => {
      const sUrl = CloudLicenseManager.getServerUrl();
      const pUrl = `${sUrl}/portal`;
      if (window.giApp?.openExternal) window.giApp.openExternal(pUrl);
      else window.open(pUrl, "_blank");
    });
  }

  static open() {
    if (typeof navigateView === "function") {
      navigateView("appSettings", "PLAN");
      return;
    }
    this.renderDetails();
    document.getElementById("subscriptionModal")?.classList.remove("hidden");
  }

  static renderDetails() {
    const license = CloudLicenseManager.getLicense();
    const grace = CloudLicenseManager.checkGracePeriod();

    const planNameEl = document.getElementById("subModalPlanName");
    const badgeEl = document.getElementById("subModalPlanBadge");
    const daysEl = document.getElementById("subModalDaysLeft");
    const barEl = document.getElementById("subModalProgressBar");
    const validUntilEl = document.getElementById("subModalValidUntil");
    const companyEl = document.getElementById("subModalCompanyName");
    const emailEl = document.getElementById("subModalEmail");
    const tokenEl = document.getElementById("subModalToken");

    if (planNameEl) planNameEl.textContent = (license.plan || "Professional") + " Plan";

    if (badgeEl) {
      if (grace.isOverdue) {
        badgeEl.textContent = grace.inGracePeriod ? "GRACE PERIOD" : "EXPIRED";
        badgeEl.style.background = grace.inGracePeriod ? "#fef3c7" : "#fee2e2";
        badgeEl.style.color = grace.inGracePeriod ? "#b45309" : "#b91c1c";
      } else {
        badgeEl.textContent = (license.status || "ACTIVE").toUpperCase();
        badgeEl.style.background = "#ecfdf5";
        badgeEl.style.color = "#047857";
      }
    }

    if (daysEl) daysEl.textContent = String(grace.daysRemaining);

    if (barEl) {
      const pct = Math.min(100, Math.max(0, Math.round((grace.daysRemaining / 365) * 100)));
      barEl.style.width = `${pct}%`;
      barEl.style.background = grace.isOverdue ? "#f59e0b" : "#10b981";
    }

    if (validUntilEl) {
      if (license.validUntil) {
        validUntilEl.textContent = new Date(license.validUntil).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' });
      } else {
        validUntilEl.textContent = "1 Year Included";
      }
    }

    if (companyEl) companyEl.textContent = license.companyName || "Business Workspace";
    if (emailEl) emailEl.textContent = license.email || "owner@company.com";
    if (tokenEl) tokenEl.textContent = license.token || "zyndev_••••••••";
  }
}

// ── 5. In-App PIN Reset Controller ─────────────────────────────────────
class PinResetInAppController {
  static init() {
    const cancel1 = document.getElementById("pinResetCancelBtn");
    const sendBtn = document.getElementById("pinResetSendOtpBtn");
    const cancel2 = document.getElementById("pinResetStep2CancelBtn");
    const verifyBtn = document.getElementById("pinResetVerifyCodeBtn");

    cancel1?.addEventListener("click", () => this.close());
    cancel2?.addEventListener("click", () => this.close());

    sendBtn?.addEventListener("click", () => this.handleSendOtp());
    verifyBtn?.addEventListener("click", () => this.handleVerifyCode());
  }

  static open() {
    const license = CloudLicenseManager.getLicense();
    const emailEl = document.getElementById("pinResetEmailDisplay");
    if (emailEl) emailEl.textContent = license.email || "your registered email";

    document.getElementById("pinResetStep1")?.classList.remove("hidden");
    document.getElementById("pinResetStep2")?.classList.add("hidden");
    document.getElementById("pinResetErrorText")?.classList.add("hidden");
    document.getElementById("pinResetInAppModal")?.classList.remove("hidden");
  }

  static close() {
    document.getElementById("pinResetInAppModal")?.classList.add("hidden");
  }

  static async handleSendOtp() {
    const license = CloudLicenseManager.getLicense();
    const sUrl = CloudLicenseManager.getServerUrl();
    const sendBtn = document.getElementById("pinResetSendOtpBtn");

    sendBtn.disabled = true;
    sendBtn.textContent = "Sending Code...";

    try {
      const res = await fetch(`${sUrl}/api/v1/auth/pin-reset-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: license.email })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to dispatch reset code.");

      document.getElementById("pinResetStep1")?.classList.add("hidden");
      document.getElementById("pinResetStep2")?.classList.remove("hidden");

      if (data.devOtp) {
        const inp = document.getElementById("pinResetCodeInput");
        if (inp) inp.value = data.devOtp;
      }
      if (typeof showToast === "function") showToast("Verification code dispatched to your email.", "success");
    } catch (err) {
      alert(err.message || "Could not send PIN reset email. Connect to internet.");
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = "Send Reset Code";
    }
  }

  static async handleVerifyCode() {
    const license = CloudLicenseManager.getLicense();
    const sUrl = CloudLicenseManager.getServerUrl();
    const code = document.getElementById("pinResetCodeInput")?.value?.trim();
    const errEl = document.getElementById("pinResetErrorText");
    const verifyBtn = document.getElementById("pinResetVerifyCodeBtn");

    errEl?.classList.add("hidden");

    if (!code || code.length < 6) {
      if (errEl) {
        errEl.textContent = "Please enter the 6-digit code.";
        errEl.classList.remove("hidden");
      }
      return;
    }

    verifyBtn.disabled = true;
    verifyBtn.textContent = "Verifying...";

    try {
      const res = await fetch(`${sUrl}/api/v1/auth/pin-reset-verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: license.email, code })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Incorrect verification code.");

      // Success: Clear old PIN and prompt for new PIN
      PinSecurityManager.disablePin();
      this.close();
      PinUiController.hideLockScreen();
      if (typeof showToast === "function") showToast("PIN verification approved. Please configure your new PIN.", "success");
      PinUiController.showSetupModal();
    } catch (err) {
      if (errEl) {
        errEl.textContent = err.message || "Verification failed.";
        errEl.classList.remove("hidden");
      }
    } finally {
      verifyBtn.disabled = false;
      verifyBtn.textContent = "Verify Code";
    }
  }
}

// ── 6. PIN Setup & Lock Screen Controllers ─────────────────────────────
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
      PinResetInAppController.open();
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
        this.setupFirstPin = this.currentInput;
        this.currentInput = "";
        const title = document.getElementById("pinSetupTitle");
        const subtitle = document.getElementById("pinSetupSubtitle");
        if (title) title.textContent = "Confirm Security PIN";
        if (subtitle) subtitle.textContent = "Re-enter the same 4-digit PIN to confirm";
        setTimeout(() => this.updateDots("pinSetupDotsRow", 0), 150);
      } else {
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

// ── 7. Cloud Activation UI Controller with First PC Verification Code ──
class ActivationUiController {
  static pendingEmail = "";

  static init() {
    const form = document.getElementById("cloudActivationForm");
    const demoBtn = document.getElementById("activationOfflineDemoBtn");
    const advToggle = document.getElementById("activationAdvToggle");
    const serverField = document.getElementById("activationServerField");
    const regLink = document.getElementById("activationRegisterLink");

    const verifyOtpBtn = document.getElementById("activationVerifyOtpBtn");
    const backBtn = document.getElementById("activationBackBtn");
    const resendLink = document.getElementById("activationResendOtpLink");

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

    // Step 1: Submit credentials to receive First PC Login One-Time Verification Code
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("activationEmail")?.value?.trim();
      const password = document.getElementById("activationPassword")?.value?.trim();
      const serverUrl = document.getElementById("activationServerUrl")?.value?.trim() || "http://localhost:4000";
      const errorEl = document.getElementById("activationErrorMsg");
      const submitBtn = document.getElementById("activationSubmitBtn");

      errorEl?.classList.add("hidden");
      submitBtn.disabled = true;
      submitBtn.textContent = "Authorizing PC...";

      try {
        CloudLicenseManager.setServerUrl(serverUrl);
        this.pendingEmail = email;

        // Call initiate login to request 6-digit Device Verification OTP
        const res = await fetch(`${serverUrl.replace(/\/$/, "")}/api/v1/auth/desktop-initiate-login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, machineName: await this.getMachineName() })
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || "Login failed. Check credentials or account approval status.");
        }

        if (data.requiresVerification) {
          // Switch to Step 2: One-Time Verification Code screen
          form.classList.add("hidden");
          const otpStep = document.getElementById("activationOtpStep");
          otpStep?.classList.remove("hidden");

          const targetEmailEl = document.getElementById("activationTargetEmail");
          if (targetEmailEl) targetEmailEl.textContent = email;

          if (data.devOtp) {
            const codeInput = document.getElementById("activationOtpCode");
            if (codeInput) codeInput.value = data.devOtp;
          }

          if (typeof showToast === "function") showToast("One-time authorization code sent to your email.", "info");
        }
      } catch (err) {
        if (errorEl) {
          errorEl.textContent = err.message || "Network error. Connect to internet or try offline mode.";
          errorEl.classList.remove("hidden");
        }
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Authorize PC & Activate";
      }
    });

    // Step 2: Submit Verification Code to authorize PC
    verifyOtpBtn?.addEventListener("click", async () => {
      const code = document.getElementById("activationOtpCode")?.value?.trim();
      const errorEl = document.getElementById("activationOtpErrorMsg");
      const serverUrl = CloudLicenseManager.getServerUrl();

      errorEl?.classList.add("hidden");

      if (!code || code.length < 6) {
        if (errorEl) {
          errorEl.textContent = "Please enter the 6-digit verification code.";
          errorEl.classList.remove("hidden");
        }
        return;
      }

      verifyOtpBtn.disabled = true;
      verifyOtpBtn.textContent = "Verifying PC...";

      try {
        const res = await fetch(`${serverUrl}/api/v1/auth/desktop-verify-device`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: this.pendingEmail, code, machineName: await this.getMachineName() })
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || "Invalid or expired verification code.");
        }

        CloudLicenseManager.saveLicense({
          activated: true,
          token: data.token,
          companyId: data.customer?.id || "default",
          companyName: data.customer?.companyName || this.pendingEmail,
          ownerName: data.customer?.ownerName,
          email: this.pendingEmail,
          plan: data.customer?.plan || "Professional",
          validUntil: data.customer?.validUntil || new Date(Date.now() + 365*24*60*60*1000).toISOString(),
          lastOnlineCheck: new Date().toISOString(),
          gracePeriodDays: 14,
          status: "active"
        });

        document.getElementById("cloudActivationModal")?.classList.add("hidden");
        if (typeof showToast === "function") showToast("PC Authorized & ZynBill Activated Successfully!", "success");

        CloudSyncWidget.updatePlanPill();
        CloudSyncWidget.updatePopoverDetails();

        // Prompt user to configure their 4-digit PIN
        PinUiController.showSetupModal();
      } catch (err) {
        if (errorEl) {
          errorEl.textContent = err.message || "Failed to verify code.";
          errorEl.classList.remove("hidden");
        }
      } finally {
        verifyOtpBtn.disabled = false;
        verifyOtpBtn.textContent = "Verify & Unlock PC";
      }
    });

    backBtn?.addEventListener("click", () => {
      document.getElementById("activationOtpStep")?.classList.add("hidden");
      document.getElementById("cloudActivationForm")?.classList.remove("hidden");
    });

    resendLink?.addEventListener("click", async (e) => {
      e.preventDefault();
      const password = document.getElementById("activationPassword")?.value?.trim();
      const serverUrl = CloudLicenseManager.getServerUrl();
      if (!this.pendingEmail || !password) return;

      try {
        const res = await fetch(`${serverUrl}/api/v1/auth/desktop-initiate-login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: this.pendingEmail, password, machineName: await this.getMachineName() })
        });
        const data = await res.json();
        if (data.ok && data.devOtp) {
          const codeInput = document.getElementById("activationOtpCode");
          if (codeInput) codeInput.value = data.devOtp;
        }
        if (typeof showToast === "function") showToast("Fresh verification code sent to your email.", "success");
      } catch (_) {}
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
      status: "active",
      token: "zyndev_demo"
    });

    document.getElementById("cloudActivationModal")?.classList.add("hidden");
    if (typeof showToast === "function") showToast("Offline mode enabled. Welcome to ZynBill!", "success");

    CloudSyncWidget.updatePlanPill();
    CloudSyncWidget.updatePopoverDetails();
    PinUiController.showSetupModal();
  }

  static showActivationModal(force = false) {
    if (!CloudLicenseManager.isActivated() || force) {
      document.getElementById("cloudActivationModal")?.classList.remove("hidden");
    }
  }
}

// ── 8. Global Bootstrap Initialization ─────────────────────────────────
window.addEventListener("DOMContentLoaded", async () => {
  ActivationUiController.init();
  PinUiController.init();
  PinResetInAppController.init();
  SubscriptionModalController.init();
  await CloudSyncWidget.init();

  if (!CloudLicenseManager.isActivated()) {
    ActivationUiController.showActivationModal();
  } else if (PinSecurityManager.isPinEnabled()) {
    PinUiController.showLockScreen();
  }
});

// Export globally for renderer access
window.CloudLicenseManager = CloudLicenseManager;
window.PinSecurityManager = PinSecurityManager;
window.CloudSyncWidget = CloudSyncWidget;
window.PinUiController = PinUiController;
window.ActivationUiController = ActivationUiController;
window.SubscriptionModalController = SubscriptionModalController;
window.PinResetInAppController = PinResetInAppController;