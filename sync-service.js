class SyncService {
  constructor({ database, adapter, enabled = false, intervalMs = 30000, logger = console }) {
    this.database = database;
    this.adapter = adapter;
    this.enabled = enabled;
    this.intervalMs = Math.max(5000, intervalMs);
    this.logger = logger;
    this.timer = null;
    this.running = null;
  }

  start() {
    if (!this.enabled || this.timer) return;
    this.syncNow().catch(() => {});
    this.timer = setInterval(() => this.syncNow().catch(() => {}), this.intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  getStatus() {
    return { enabled: this.enabled, running: Boolean(this.running), ...this.database.getSyncStatus() };
  }

  async syncNow() {
    if (!this.enabled) return this.getStatus();
    if (this.running) return this.running;
    this.running = this.runCycle().finally(() => { this.running = null; });
    return this.running;
  }

  async runCycle() {
    const status = this.database.getSyncStatus();
    const identity = await this.adapter.registerDevice({ companyId: status.companyId, device: status.device });
    const events = this.database.claimSyncOutbox(50, status.companyId);
    try {
      if (events.length) {
        const response = await this.adapter.push({ companyId: status.companyId, deviceId: status.device.id, events });
        const ids = new Set(events.map((event) => event.id));
        const seen = new Set();
        if (!Array.isArray(response?.results)) throw new Error('Invalid sync push response.');
        for (const result of response.results) {
          if (!result || !ids.has(result.id) || seen.has(result.id) ||
              !['accepted', 'already_applied', 'conflict', 'rejected', 'retry'].includes(result.status)) {
            throw new Error('Invalid sync acknowledgement.');
          }
          seen.add(result.id);
        }
        this.database.completeSyncPush(response.results);
        this.database.retryClaimedSyncEvents(events.filter((event) => !seen.has(event.id)).map((event) => event.id), 'MISSING_ACK');
      }
    } catch (error) {
      this.database.retryClaimedSyncEvents(events.map((event) => event.id), error.code || "NETWORK_ERROR");
      this.logger.warn?.("Sync push deferred", { code: error.code || "NETWORK_ERROR" });
      throw error;
    }

    const current = this.database.getSyncStatus(status.companyId);
    const pulled = await this.adapter.pull({ companyId: current.companyId, deviceId: current.device.id, cursor: current.cursor, limit: 100 });
    if (!pulled || !Array.isArray(pulled.changes) || typeof pulled.cursor !== 'string') throw new Error('Invalid sync pull response.');
    this.database.applySyncPull({ companyId: status.companyId, changes: pulled.changes, cursor: pulled.cursor });
    this.database.markDeviceSynced(Boolean(identity));
    return this.getStatus();
  }
}

class DisabledSyncAdapter {
  async registerDevice() { throw Object.assign(new Error("Cloud sync is not configured."), { code: "SYNC_DISABLED" }); }
  async push() { throw Object.assign(new Error("Cloud sync is not configured."), { code: "SYNC_DISABLED" }); }
  async pull() { throw Object.assign(new Error("Cloud sync is not configured."), { code: "SYNC_DISABLED" }); }
}

class HttpSyncAdapter {
  constructor({ baseUrl = "http://localhost:4000", getToken = () => "", getDeviceId = () => "" } = {}) {
    this.baseUrl = (baseUrl || "http://localhost:4000").replace(/\/$/, "");
    this.getToken = typeof getToken === "function" ? getToken : () => getToken;
    this.getDeviceId = typeof getDeviceId === "function" ? getDeviceId : () => getDeviceId;
  }

  setBaseUrl(url) {
    if (url) this.baseUrl = url.replace(/\/$/, "");
  }

  async registerDevice({ companyId, device }) {
    return { registered: true, deviceId: device?.id || this.getDeviceId() };
  }

  async push({ companyId, deviceId, events }) {
    const token = this.getToken();
    if (!token) {
      throw Object.assign(new Error("Device is not activated or missing authentication token."), { code: "AUTH_REQUIRED" });
    }
    const res = await fetch(`${this.baseUrl}/api/v1/sync/push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ events, companyId, deviceId })
    });
    const data = await res.json();
    if (!data.ok) {
      throw Object.assign(new Error(data.error || "Sync push failed."), { code: data.code || "SERVER_ERROR" });
    }
    const acknowledgedIds = new Set(data.acknowledgedIds || []);
    const results = Array.isArray(data.results)
      ? data.results
      : (events || []).map((ev) => ({
          id: ev.id,
          status: acknowledgedIds.has(ev.id) ? "accepted" : "rejected"
        }));
    return { results, serverTimestamp: data.serverTimestamp || new Date().toISOString() };
  }

  async pull({ companyId, deviceId, cursor, limit = 100 }) {
    const token = this.getToken();
    if (!token) {
      throw Object.assign(new Error("Device is not activated or missing authentication token."), { code: "AUTH_REQUIRED" });
    }
    const url = new URL(`${this.baseUrl}/api/v1/sync/pull`);
    if (cursor) url.searchParams.set("since", cursor);
    if (limit) url.searchParams.set("limit", String(limit));

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });
    const data = await res.json();
    if (!data.ok) {
      throw Object.assign(new Error(data.error || "Sync pull failed."), { code: data.code || "SERVER_ERROR" });
    }
    const rawEvents = Array.isArray(data.changes) ? data.changes : (Array.isArray(data.events) ? data.events : []);
    const supportedEntities = new Set(["unit", "item_category"]);
    const changes = rawEvents.map((ev) => {
      let payload = ev.payload;
      if (typeof payload === "string") {
        try { payload = JSON.parse(payload); } catch (_) { payload = {}; }
      }
      return {
        eventId: ev.eventId || ev.id,
        id: ev.id || ev.eventId,
        entityType: ev.entityType || ev.entity_type,
        entityId: ev.entityId || ev.entity_id,
        operation: ev.operation || "upsert",
        serverVersion: Number(ev.serverVersion || ev.server_version || 1),
        payload: payload || {},
        deviceId: ev.deviceId || ev.device_id || null,
        companyId: ev.companyId || ev.company_id || companyId,
        idempotencyKey: ev.idempotencyKey || ev.idempotency_key,
        serverTimestamp: ev.serverTimestamp || ev.server_timestamp
      };
    }).filter((c) => supportedEntities.has(c.entityType));

    return {
      changes,
      cursor: data.cursor || cursor || new Date().toISOString()
    };
  }
}

module.exports = { SyncService, DisabledSyncAdapter, HttpSyncAdapter };
