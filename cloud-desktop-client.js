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
  PIN_ATTEMPTS: "zynbill_pin_failed_attempts",
  PIN_LOCKOUT_UNTIL: "zynbill_pin_lockout_until",
  LAST_SYNC: "zynbill_last_sync_timestamp",
  SERVER_URL: "zynbill_cloud_server_url"
};

// ── 1. Cloud License & Grace Period Manager ───────────────────────────
class CloudLicenseManager {
  static getServerUrl() {
    const stored = localStorage.getItem(CLOUD_STORAGE_KEYS.SERVER_URL);
    if (stored && stored.trim() && !stored.includes("localhost:4000")) {
      return stored.trim();
    }
    return "https://dir.anasrawuthar.in";
  }

  static getSettings() {
    return {
      serverUrl: this.getServerUrl()
    };
  }

  static setServerUrl(url) {
    if (url) localStorage.setItem(CLOUD_STORAGE_KEYS.SERVER_URL, url.trim().replace(/\/$/, ""));
  }

  static getStoredLicense() {
    try {
      const data = localStorage.getItem(CLOUD_STORAGE_KEYS.LICENSE);
      if (data) return JSON.parse(data);
    } catch (_) {}
    return null;
  }

  static getLicense() {
    const stored = this.getStoredLicense();
    if (stored) return stored;

    return {
      activated: false,
      companyId: null,
      companyName: "Unregistered",
      email: null,
      plan: "None",
      validUntil: null,
      lastOnlineCheck: null,
      gracePeriodDays: 0,
      status: "unauthenticated",
      token: null
    };
  }

  static saveLicense(license) {
    if (!license) return;
    const existing = this.getStoredLicense() || {};
    const merged = { ...existing, ...license, activated: true };
    localStorage.setItem(CLOUD_STORAGE_KEYS.LICENSE, JSON.stringify(merged));
    localStorage.setItem(CLOUD_STORAGE_KEYS.ACTIVATED, "true");
    if (merged.token && window.giDB?.configureSync) {
      window.giDB.configureSync({
        serverUrl: this.getServerUrl(),
        token: merged.token,
        enabled: true
      }).catch(() => {});
    }

    if (window.giSecureStore?.saveCredentials) {
      window.giSecureStore.saveCredentials({
        token: merged.token,
        email: merged.email,
        customerId: merged.companyId || merged.customerId,
        plan: merged.plan,
        companyName: merged.companyName,
        status: merged.status,
        validUntil: merged.validUntil,
        lastOnlineCheck: merged.lastOnlineCheck || new Date().toISOString(),
        activated: true
      }).catch(() => {});
    }
  }

  static isActivated() {
    const val = localStorage.getItem(CLOUD_STORAGE_KEYS.ACTIVATED);
    const lic = this.getStoredLicense();
    return val === "true" && Boolean(lic && lic.token && lic.email);
  }

  static setActivated(val = true) {
    localStorage.setItem(CLOUD_STORAGE_KEYS.ACTIVATED, val ? "true" : "false");
    if (!val) {
      localStorage.removeItem(CLOUD_STORAGE_KEYS.LICENSE);
    }
  }

  /**
   * Evaluates offline grace period.
   * If past validUntil, grants up to gracePeriodDays (14 days) before lock.
   */
  static checkGracePeriod() {
    const license = this.getLicense();
    if (!license || !license.validUntil) {
      return { isOverdue: true, inGracePeriod: false, daysRemaining: 0, error: "Missing license data." };
    }

    const now = Date.now();
    const expiry = new Date(license.validUntil).getTime();
    if (isNaN(expiry)) {
      return { isOverdue: true, inGracePeriod: false, daysRemaining: 0, error: "Corrupted license expiration timestamp." };
    }

    // Monotonicity / Clock-tampering check:
    // If system clock is earlier than lastOnlineCheck (with 1-minute tolerance for micro jitter)
    if (license.lastOnlineCheck) {
      const lastCheck = new Date(license.lastOnlineCheck).getTime();
      if (!isNaN(lastCheck) && now < lastCheck - 60000) {
        return {
          isOverdue: true,
          inGracePeriod: false,
          daysRemaining: 0,
          clockTampered: true,
          error: "System clock anomaly detected. Current date is earlier than last recorded online verification."
        };
      }
    }

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

  static forceLogout(reason) {
    localStorage.removeItem(CLOUD_STORAGE_KEYS.LICENSE);
    localStorage.setItem(CLOUD_STORAGE_KEYS.ACTIVATED, "false");
    if (typeof PinSecurityManager !== "undefined") {
      PinSecurityManager.disablePin();
    }
    if (window.giSecureStore?.clearCredentials) {
      window.giSecureStore.clearCredentials().catch(() => {});
    }
    if (window.giDB?.configureSync) {
      window.giDB.configureSync({ enabled: false }).catch(() => {});
    }

    ActivationUiController.showActivationModal(true);

    const errBox = document.getElementById("activationErrorMsg");
    if (errBox) {
      errBox.textContent = reason || "Your account has been revoked or suspended. Please contact the administrator.";
      errBox.classList.remove("hidden");
    }

    if (typeof showToast === "function") {
      showToast(reason || "Account revoked or suspended. Signed out.", "error");
    }

    CloudSyncWidget.updatePlanPill();
    CloudSyncWidget.updatePopoverDetails();
  }

  static signOut() {
    if (!confirm("Are you sure you want to sign out of ZynBill? Your local invoices and master data remain safely on this PC.")) {
      return;
    }
    localStorage.removeItem(CLOUD_STORAGE_KEYS.LICENSE);
    localStorage.setItem(CLOUD_STORAGE_KEYS.ACTIVATED, "false");
    if (typeof PinSecurityManager !== "undefined") {
      PinSecurityManager.disablePin();
    }
    if (window.giSecureStore?.clearCredentials) {
      window.giSecureStore.clearCredentials().catch(() => {});
    }
    if (window.giDB?.configureSync) {
      window.giDB.configureSync({ enabled: false }).catch(() => {});
    }
    if (typeof showToast === "function") {
      showToast("Signed out of ZynBill account.", "info");
    }

    ActivationUiController.showActivationModal(true);

    CloudSyncWidget.updatePlanPill();
    CloudSyncWidget.updatePopoverDetails();
  }

  static async syncLicenseWithServer() {
    const license = this.getLicense();
    const sUrl = this.getServerUrl();
    if (!navigator.onLine || !license.token) return license;

    try {
      let data = null;
      let status = 200;
      let ok = true;
      let result = null;
      if (window.giCloud?.validateLicense) {
        result = await window.giCloud.validateLicense({ serverUrl: sUrl, token: license.token });
        if (result) {
          ok = Boolean(result.ok);
          status = typeof result.status === "number" ? result.status : (typeof result.data?.status === "number" ? result.data.status : (ok ? 200 : 0));
          data = result.data || result;
        }
      }

      // Offline-First Protection:
      // Network failure, DNS error, timeout, server down, or status 0 / 5xx MUST NEVER log the user out!
      // Local activation and full offline billing capability remain 100% active.
      if (!result || status === 0 || (!ok && (status === 0 || status >= 500))) {
        return license;
      }

      // Explicit revocation / suspension ONLY if the server is reached and explicitly responds with 401/403 or suspended status
      const isRevokedOrSuspended = (status === 401 || status === 403) || (data && (
        data.status === 401 ||
        data.status === 403 ||
        data.error?.toLowerCase().includes("suspended") ||
        data.error?.toLowerCase().includes("revoked") ||
        data.error?.toLowerCase().includes("rejected") ||
        data.error?.toLowerCase().includes("invalid token") ||
        data.error?.toLowerCase().includes("account not found") ||
        (data.license && (data.license.status === "suspended" || data.license.status === "rejected" || data.license.status === "revoked"))
      ));

      if (isRevokedOrSuspended) {
        const reason = (data && data.error) ||
          (data && data.license && data.license.status === "suspended"
            ? "This business account has been suspended by the administrator."
            : "Your account registration was revoked or rejected.");
        this.forceLogout(reason);
        return null;
      }

      if (data && data.ok && data.license && data.license.status === "active") {
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
    } catch (err) {
      console.warn("License sync error (offline/unreachable):", err);
    }
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
    this.resetAttempts();
  }

  static getLockoutStatus() {
    const lockoutUntil = parseInt(localStorage.getItem(CLOUD_STORAGE_KEYS.PIN_LOCKOUT_UNTIL) || "0", 10);
    const now = Date.now();
    if (lockoutUntil && now < lockoutUntil) {
      return {
        isLocked: true,
        secondsRemaining: Math.ceil((lockoutUntil - now) / 1000)
      };
    }
    const failedAttempts = parseInt(localStorage.getItem(CLOUD_STORAGE_KEYS.PIN_ATTEMPTS) || "0", 10);
    return {
      isLocked: false,
      secondsRemaining: 0,
      failedAttempts
    };
  }

  static recordFailedAttempt() {
    const current = parseInt(localStorage.getItem(CLOUD_STORAGE_KEYS.PIN_ATTEMPTS) || "0", 10) + 1;
    localStorage.setItem(CLOUD_STORAGE_KEYS.PIN_ATTEMPTS, String(current));

    let lockoutDurationMs = 0;
    if (current >= 10) {
      lockoutDurationMs = 15 * 60 * 1000; // 15-minute lockout after 10 attempts
    } else if (current >= 5) {
      lockoutDurationMs = 60 * 1000; // 60-second lockout after 5 attempts
    }

    if (lockoutDurationMs > 0) {
      const lockoutUntil = Date.now() + lockoutDurationMs;
      localStorage.setItem(CLOUD_STORAGE_KEYS.PIN_LOCKOUT_UNTIL, String(lockoutUntil));
      return { current, lockoutUntil, isLocked: true, seconds: Math.ceil(lockoutDurationMs / 1000) };
    }

    return { current, isLocked: false, remainingBeforeLock: 5 - current };
  }

  static resetAttempts() {
    localStorage.removeItem(CLOUD_STORAGE_KEYS.PIN_ATTEMPTS);
    localStorage.removeItem(CLOUD_STORAGE_KEYS.PIN_LOCKOUT_UNTIL);
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

    // If activated and online, trigger background sync (which auto-restores if local database is empty)
    if (CloudLicenseManager.isActivated() && navigator.onLine) {
      setTimeout(() => this.triggerSyncNow(), 1500);
    }

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
      if (window.giCloud?.checkHealth) {
        const result = await window.giCloud.checkHealth({ serverUrl: sUrl });
        return Boolean(result && result.ok);
      }
      return false;
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

  static async triggerSyncNow(forceRestore = false) {
    if (this.isSyncing) return;
    this.isSyncing = true;
    this.setStatus("syncing");

    try {
      const lic = CloudLicenseManager.getLicense();
      const sUrl = CloudLicenseManager.getServerUrl();

      // Check current local database state
      let localState = null;
      try {
        if (window.giDB?.getState) {
          localState = await window.giDB.getState();
        }
      } catch (_) {}

      const localPartiesCount = (localState?.parties || []).length;
      const localInvoicesCount = (localState?.transactions || []).length;
      const isLocalEmpty = localPartiesCount === 0 && localInvoicesCount === 0;

      // If local database is empty OR forceRestore is requested, check if cloud has an existing backup snapshot
      if ((isLocalEmpty || forceRestore) && lic && lic.token && navigator.onLine && window.giCloud?.getTenantBackupStatus && window.giCloud?.restoreTenantBackup) {
        try {
          const bkpStatus = await window.giCloud.getTenantBackupStatus({ token: lic.token, serverUrl: sUrl });
          if (bkpStatus && bkpStatus.ok && bkpStatus.hasBackup && bkpStatus.latest) {
            const counts = bkpStatus.latest.recordCounts || {};
            const totalCloudRecords = (counts.invoices || 0) + (counts.parties || 0) + (counts.items || 0);
            if (totalCloudRecords > 0) {
              console.log("[CloudSync] Restoring verified cloud backup snapshot...", counts);
              if (typeof showToast === "function") showToast("Syncing business data from cloud...", "info");
              const restoreRes = await window.giCloud.restoreTenantBackup({ token: lic.token, serverUrl: sUrl });
              if (restoreRes && restoreRes.ok) {
                localStorage.setItem(CLOUD_STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
                if (typeof showToast === "function") {
                  showToast(`Cloud data restored! (${counts.invoices || 0} Invoices, ${counts.parties || 0} Parties, ${counts.items || 0} Items)`, "success");
                }
                setTimeout(() => window.location.reload(), 1200);
                return;
              }
            }
          }
        } catch (restoreErr) {
          console.warn("Auto-restore check note:", restoreErr.message);
        }
      }

      // 1. Run delta sync (outbox push & inbox pull)
      if (window.giDB?.syncNow) {
        await window.giDB.syncNow();
      } else {
        await new Promise(r => setTimeout(r, 600));
      }

      // 2. If local database has records, automatically update cloud backup snapshot
      if (!isLocalEmpty && lic && lic.token && navigator.onLine && window.giCloud?.uploadTenantBackup) {
        try {
          await window.giCloud.uploadTenantBackup({
            token: lic.token,
            serverUrl: sUrl
          });
        } catch (bErr) {
          console.warn("Background cloud backup sync note:", bErr.message);
        }
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

  static async triggerCloudRestore() {
    const lic = CloudLicenseManager.getLicense();
    if (!lic || !lic.token || !navigator.onLine) {
      if (typeof showToast === "function") showToast("Cannot restore: Check internet connection or cloud login.", "warning");
      return;
    }
    const confirmed = confirm("Are you sure you want to download and restore the latest cloud business backup? Any unsynced local data will be updated to match the cloud state.");
    if (!confirmed) return;

    await this.triggerSyncNow(true);
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

      const lic = CloudLicenseManager.getLicense();
      if (lic && lic.token && navigator.onLine && window.giCloud?.uploadTenantBackup) {
        try {
          const cloudRes = await window.giCloud.uploadTenantBackup({
            token: lic.token,
            serverUrl: CloudLicenseManager.getServerUrl()
          });
          if (cloudRes && cloudRes.ok) {
            if (typeof showToast === "function") showToast("Cloud backup synchronized successfully!", "success");
          }
        } catch (cErr) {
          console.warn("Cloud backup upload warning:", cErr.message);
        }
      }
    } catch (err) {
      if (typeof showToast === "function") showToast("Could not create backup: " + err.message, "error");
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
      let data = null;
      if (window.giCloud?.requestPinReset) {
        const result = await window.giCloud.requestPinReset({ email: license.email, serverUrl: sUrl });
        if (!result || !result.ok) throw new Error(result?.error || result?.data?.error || "Failed to dispatch reset code.");
        data = result.data || {};
      } else {
        throw new Error("Cloud IPC service unavailable.");
      }

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
      let data = null;
      if (window.giCloud?.verifyPinReset) {
        const result = await window.giCloud.verifyPinReset({ email: license.email, code, serverUrl: sUrl });
        if (!result || !result.ok) throw new Error(result?.error || result?.data?.error || "Incorrect verification code.");
        data = result.data || {};
      } else {
        throw new Error("Cloud IPC service unavailable.");
      }

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
      window.dispatchEvent(new Event("gi-account-activated"));
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

    const lockout = PinSecurityManager.getLockoutStatus();
    if (lockout.isLocked) {
      if (errorEl) {
        errorEl.textContent = `Too many failed attempts. PIN entry locked for ${lockout.secondsRemaining}s.`;
        errorEl.classList.remove("hidden");
      }
      this.currentInput = "";
      this.updateDots("pinDotsRow", 0);
      return;
    }

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
        PinSecurityManager.resetAttempts();
        this.hideLockScreen();
        if (typeof showToast === "function") showToast("PIN verified. Welcome to ZynBill!", "success");
      } else {
        const failure = PinSecurityManager.recordFailedAttempt();
        if (errorEl) {
          if (failure.isLocked) {
            errorEl.textContent = `Too many failed attempts (5/5). PIN entry locked for ${failure.seconds}s.`;
          } else {
            errorEl.textContent = `Incorrect PIN (${failure.current}/5 attempts). Please try again.`;
          }
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
          window.dispatchEvent(new Event("gi-account-activated"));
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

  static async getMachineName() {
    try {
      if (window.giApp?.getSystemInfo) {
        const info = await window.giApp.getSystemInfo();
        if (info && info.hostname) return info.hostname;
      }
    } catch (_) {}
    return "Windows Desktop PC";
  }

  static init() {
    const form = document.getElementById("cloudActivationForm");
    const advToggle = document.getElementById("activationAdvToggle");
    const serverField = document.getElementById("activationServerField");
    const regLink = document.getElementById("activationRegisterLink");

    const verifyOtpBtn = document.getElementById("activationVerifyOtpBtn");
    const backBtn = document.getElementById("activationBackBtn");
    const resendLink = document.getElementById("activationResendOtpLink");

    advToggle?.addEventListener("click", () => {
      serverField?.classList.toggle("hidden");
    });

    regLink?.addEventListener("click", (e) => {
      e.preventDefault();
      const sUrl = document.getElementById("activationServerUrl")?.value || CloudLicenseManager.getServerUrl();
      const regUrl = `${sUrl.replace(/\/$/, "")}/register.html`;
      if (window.giApp?.openExternal) window.giApp.openExternal(regUrl);
      else window.open(regUrl, "_blank");
    });

    // Step 1: Submit credentials to receive First PC Login One-Time Verification Code
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("activationEmail")?.value?.trim();
      const password = document.getElementById("activationPassword")?.value?.trim();
      const serverUrl = document.getElementById("activationServerUrl")?.value?.trim() || CloudLicenseManager.getServerUrl();
      const errorEl = document.getElementById("activationErrorMsg");
      const submitBtn = document.getElementById("activationSubmitBtn");

      errorEl?.classList.add("hidden");
      submitBtn.disabled = true;
      submitBtn.textContent = "Authorizing PC...";

      try {
        CloudLicenseManager.setServerUrl(serverUrl);
        this.pendingEmail = email;

        let data = null;
        if (window.giCloud?.initiateLogin) {
          const machineName = await this.getMachineName();
          const result = await window.giCloud.initiateLogin({ email, password, machineName, serverUrl });
          if (!result || !result.ok) {
            const status = result?.status || result?.data?.status;
            const code = result?.data?.code;
            let msg = result?.error || result?.data?.error || "Login failed.";
            if (status === "pending_approval") {
              msg = "Your business account is pending Super Admin review. You will receive an approval email shortly.";
            } else if (status === "pending_verification") {
              msg = "Email address has not been verified yet. Please complete verification on the web portal.";
            } else if (status === "rejected") {
              msg = result?.data?.error || "Your account registration was rejected. Please contact support.";
            } else if (status === "suspended") {
              msg = "This business account has been suspended by the Super Admin. Please contact customer support.";
            } else if (status === "expired") {
              msg = "Your subscription and 14-day offline grace period have expired. Please renew your plan.";
            } else if (code === "DEVICE_LIMIT_REACHED") {
              msg = result?.data?.error || "Terminal device limit reached for your plan. Please revoke an unused PC from your Customer Portal.";
            }
            throw new Error(msg);
          }
          data = result.data || {};
        } else {
          throw new Error("Cloud IPC service unavailable.");
        }

        if (data.requiresVerification) {
          form.classList.add("hidden");
          const otpStep = document.getElementById("activationOtpStep");
          otpStep?.classList.remove("hidden");

          const targetEmailEl = document.getElementById("activationTargetEmail");
          if (targetEmailEl) targetEmailEl.textContent = email;

          if (typeof showToast === "function") showToast("One-time authorization code sent to your email.", "info");
        }
      } catch (err) {
        if (errorEl) {
          errorEl.textContent = err.message || "Network error. Connect to internet or verify credentials.";
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
        let data = null;
        if (window.giCloud?.verifyDevice) {
          const machineName = await this.getMachineName();
          const result = await window.giCloud.verifyDevice({ email: this.pendingEmail, code, machineName, serverUrl });
          if (!result || !result.ok) {
            throw new Error(result?.error || result?.data?.error || "Invalid or expired verification code.");
          }
          data = result.data || {};
        } else {
          throw new Error("Cloud IPC service unavailable.");
        }

        CloudLicenseManager.saveLicense({
          activated: true,
          token: data.token,
          companyId: data.customer?.id || "default",
          companyName: data.customer?.companyName || this.pendingEmail,
          ownerName: data.customer?.ownerName,
          email: this.pendingEmail,
          plan: data.customer?.plan || "Professional",
          validUntil: data.customer?.validUntil || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          lastOnlineCheck: new Date().toISOString(),
          gracePeriodDays: 14,
          status: "active"
        });

        // Check if an existing cloud backup exists for this customer account
        let backupStatus = null;
        try {
          if (window.giCloud?.getTenantBackupStatus) {
            backupStatus = await window.giCloud.getTenantBackupStatus({
              token: data.token,
              serverUrl
            });
          }
        } catch (bkpErr) {
          console.warn("Could not check backup status:", bkpErr.message);
        }

        if (backupStatus && backupStatus.ok && backupStatus.hasBackup && backupStatus.latest) {
          document.getElementById("cloudActivationModal")?.classList.add("hidden");
          ActivationUiController.showRestorePrompt(backupStatus.latest, data.token, data.customer, serverUrl);
          return;
        }

        // Fresh installation: Initialize local company profile from cloud account
        if (window.giCloud?.initCompanyFromProfile && data.customer) {
          try {
            await window.giCloud.initCompanyFromProfile(data.customer);
          } catch (initErr) {
            console.warn("Auto-initializing company profile warning:", initErr.message);
          }
        }

        document.getElementById("cloudActivationModal")?.classList.add("hidden");
        if (typeof showToast === "function") showToast("PC Authorized & ZynBill Activated Successfully!", "success");

        CloudSyncWidget.updatePlanPill();
        CloudSyncWidget.updatePopoverDetails();
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
        let data = null;
        if (window.giCloud?.initiateLogin) {
          const machineName = await this.getMachineName();
          const result = await window.giCloud.initiateLogin({ email: this.pendingEmail, password, machineName, serverUrl });
          if (result && result.ok && result.data) data = result.data;
        }
        if (typeof showToast === "function") showToast("Fresh verification code sent to your email.", "success");
      } catch (_) {}
    });
  }

  static showRestorePrompt(latestBackup, token, customer, serverUrl) {
    const modal = document.getElementById("cloudRestoreModal");
    if (!modal) {
      PinUiController.showSetupModal();
      return;
    }

    const compEl = document.getElementById("restoreCompanyName");
    const dateEl = document.getElementById("restoreBackupDate");
    const sizeEl = document.getElementById("restoreBackupSize");
    const countsEl = document.getElementById("restoreRecordCounts");

    if (compEl) compEl.textContent = latestBackup.companyName || customer?.companyName || "Your Business Workspace";
    if (dateEl) dateEl.textContent = latestBackup.timestamp ? new Date(latestBackup.timestamp).toLocaleString() : "Recent";
    if (sizeEl) sizeEl.textContent = `${((latestBackup.sizeBytes || 0) / 1024).toFixed(1)} KB`;

    if (countsEl && latestBackup.recordCounts) {
      const parts = [];
      if (latestBackup.recordCounts.invoices !== undefined) parts.push(`${latestBackup.recordCounts.invoices} Invoices`);
      if (latestBackup.recordCounts.parties !== undefined) parts.push(`${latestBackup.recordCounts.parties} Parties`);
      if (latestBackup.recordCounts.items !== undefined) parts.push(`${latestBackup.recordCounts.items} Items`);
      if (latestBackup.recordCounts.payments !== undefined) parts.push(`${latestBackup.recordCounts.payments} Payments`);
      countsEl.textContent = parts.length ? parts.join(", ") : "Complete Database Records";
    }

    const confirmBtn = document.getElementById("btnConfirmRestoreCloud");
    const skipBtn = document.getElementById("btnSkipRestoreCloud");
    if (skipBtn) {
      skipBtn.style.display = "none";
    }

    if (confirmBtn) {
      confirmBtn.onclick = async () => {
        confirmBtn.disabled = true;
        confirmBtn.textContent = "Restoring Business Data from Cloud...";
        try {
          if (window.giCloud?.restoreTenantBackup) {
            const res = await window.giCloud.restoreTenantBackup({ token, serverUrl });
            if (!res || !res.ok) throw new Error(res?.error || "Restore failed.");
          }
          modal.classList.add("hidden");
          localStorage.setItem(CLOUD_STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
          if (typeof showToast === "function") showToast("Business data successfully restored! Loading workspace...", "success");
          CloudSyncWidget.updatePlanPill();
          CloudSyncWidget.updatePopoverDetails();
          // Reload workspace so all restored invoices, parties and items load immediately
          setTimeout(() => {
            window.location.reload();
          }, 800);
        } catch (err) {
          console.error("Cloud restore failure:", err);
          const errDiv = document.getElementById("restoreRecordCounts");
          if (errDiv) {
            errDiv.style.color = "#dc2626";
            errDiv.textContent = `Restore failed: ${err.message || 'Unknown error'}. Click Retry below.`;
          }
          confirmBtn.disabled = false;
          confirmBtn.textContent = "🔄 Retry Business Data Restore";
        }
      };
    }

    modal.classList.remove("hidden");

    // Automatically trigger data restoration so business records are restored immediately without manual friction
    setTimeout(() => {
      if (confirmBtn && !confirmBtn.disabled) {
        confirmBtn.click();
      }
    }, 400);
  }

  static showActivationModal(force = false) {
    if (!CloudLicenseManager.isActivated() || force) {
      const actModal = document.getElementById("cloudActivationModal");
      const form = document.getElementById("cloudActivationForm");
      const otpStep = document.getElementById("activationOtpStep");
      form?.classList.remove("hidden");
      otpStep?.classList.add("hidden");
      actModal?.classList.remove("hidden");
    }
  }
}

// ── 8. Global Bootstrap Initialization ─────────────────────────────────
window.addEventListener("DOMContentLoaded", async () => {
  ActivationUiController.init();
  PinUiController.init();
  PinResetInAppController.init();
  SubscriptionModalController.init();

  // Secure Windows DPAPI Storage verification & migration
  if (window.giSecureStore?.getCredentials) {
    try {
      const secRes = await window.giSecureStore.getCredentials();
      if (secRes && secRes.unauthorizedMachine) {
        alert("Security Alert: Machine Authorization Mismatch.\n\nCredential data copied from another Windows computer cannot be decrypted on this device. Please log in with your registered account.");
        localStorage.removeItem(CLOUD_STORAGE_KEYS.LICENSE);
        localStorage.setItem(CLOUD_STORAGE_KEYS.ACTIVATED, "false");
        ActivationUiController.showActivationModal(true);
        return;
      } else if (secRes && secRes.hasCredentials && secRes.credentials) {
        const c = secRes.credentials;
        if (c.token && c.email) {
          CloudLicenseManager.saveLicense(c);
        }
      } else {
        // If local storage has legacy token, migrate to DPAPI secure store
        const legacyLic = CloudLicenseManager.getStoredLicense();
        if (legacyLic?.token && window.giSecureStore?.migrateFromLocalStorage) {
          await window.giSecureStore.migrateFromLocalStorage(legacyLic);
        }
      }
    } catch (_) {}
  }

  await CloudSyncWidget.init();

  const activeLicense = CloudLicenseManager.getLicense();
  if (activeLicense?.token && window.giDB?.configureSync) {
    window.giDB.configureSync({
      serverUrl: CloudLicenseManager.getServerUrl(),
      token: activeLicense.token,
      enabled: true
    }).catch(() => {});
  }

  if (!CloudLicenseManager.isActivated()) {
    ActivationUiController.showActivationModal(true);
  } else {
    // Immediate online license validation to enforce revocation / suspension instantly
    if (navigator.onLine) {
      CloudLicenseManager.syncLicenseWithServer().catch(() => {});
    }
    if (PinSecurityManager.isPinEnabled()) {
      PinUiController.showLockScreen();
    }
  }

  // Real-time account status synchronization (revocation / suspension polling)
  setInterval(() => {
    if (navigator.onLine && CloudLicenseManager.isActivated()) {
      CloudLicenseManager.syncLicenseWithServer().catch(() => {});
    }
  }, 30000);

  window.addEventListener("focus", () => {
    if (navigator.onLine && CloudLicenseManager.isActivated()) {
      CloudLicenseManager.syncLicenseWithServer().catch(() => {});
    }
  });
});

// Export globally for renderer access
window.CloudLicenseManager = CloudLicenseManager;
window.PinSecurityManager = PinSecurityManager;
window.CloudSyncWidget = CloudSyncWidget;
window.PinUiController = PinUiController;
window.ActivationUiController = ActivationUiController;
window.SubscriptionModalController = SubscriptionModalController;
window.PinResetInAppController = PinResetInAppController;