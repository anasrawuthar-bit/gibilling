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

module.exports = { SyncService, DisabledSyncAdapter };
