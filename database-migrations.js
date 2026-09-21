class MigrationError extends Error {
  constructor(code, message, details = {}, cause = null) {
    super(message);
    this.name = "MigrationError";
    this.code = code;
    this.details = details;
    this.userMessage = userMessageFor(code);
    if (cause) this.cause = cause;
  }
}

function runMigrations({
  db,
  migrations,
  databaseExists = false,
  createBackup = null,
  captureSnapshot = () => ({}),
  validateDatabase = () => ({}),
  compareSnapshots = defaultCompareSnapshots,
  logger = defaultLogger,
}) {
  const ordered = normalizeMigrations(migrations);
  const targetVersion = ordered.at(-1)?.version || 0;
  const appliedBefore = readAppliedMigrations(db);
  const currentVersion = appliedBefore.at(-1)?.version || 0;

  if (currentVersion > targetVersion) {
    throw new MigrationError(
      "UNSUPPORTED_DATABASE_VERSION",
      `Database schema version ${currentVersion} is newer than application version ${targetVersion}.`,
      { currentVersion, targetVersion },
    );
  }

  const appliedVersions = new Set(appliedBefore.map((row) => row.version));
  const pending = ordered.filter((migration) => !appliedVersions.has(migration.version));
  logger("migration_check", { currentVersion, targetVersion, pending: pending.map((item) => item.version) });

  if (!pending.length) {
    const validation = validateDatabase(db, targetVersion);
    logger("migration_validation_complete", { version: currentVersion, validation });
    return { currentVersion, targetVersion, applied: [], backup: null, validation };
  }

  let backup = null;
  if (databaseExists) {
    if (typeof createBackup !== "function") {
      throw new MigrationError("BACKUP_FAILED", "A pre-migration backup provider was not configured.");
    }
    try {
      backup = createBackup({ currentVersion, targetVersion });
      logger("migration_backup_complete", { currentVersion, targetVersion, path: backup?.path || "" });
    } catch (error) {
      logger("migration_backup_failed", { currentVersion, targetVersion, error: error.message });
      throw new MigrationError("BACKUP_FAILED", "Unable to create or validate the pre-migration backup.", {}, error);
    }
  }

  const before = captureSnapshot(db);
  ensureMigrationTable(db);
  const applied = [];

  db.run("PRAGMA foreign_keys = OFF;");
  for (const migration of pending) {
    logger("migration_started", { version: migration.version, name: migration.name });
    db.run("BEGIN TRANSACTION");
    try {
      migration.up(db);
      db.run(
        "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
        [migration.version, migration.name, new Date().toISOString()],
      );
      db.run("COMMIT");
      applied.push(migration.version);
      logger("migration_completed", { version: migration.version, name: migration.name });
    } catch (error) {
      try { db.run("ROLLBACK"); } catch { /* The transaction may already have ended. */ }
      db.run("PRAGMA foreign_keys = ON;");
      logger("migration_failed", { version: migration.version, name: migration.name, error: error.message });
      throw new MigrationError(
        "MIGRATION_FAILED",
        `Migration ${migration.version} (${migration.name}) failed.`,
        { version: migration.version, name: migration.name, backupPath: backup?.path || "" },
        error,
      );
    }
  }
  db.run("PRAGMA foreign_keys = ON;");

  try {
    const after = captureSnapshot(db);
    compareSnapshots(before, after);
    const validation = validateDatabase(db, targetVersion);
    logger("migration_validation_complete", { version: targetVersion, validation });
    return { currentVersion, targetVersion, applied, backup, validation };
  } catch (error) {
    logger("migration_validation_failed", { version: targetVersion, error: error.message });
    if (error instanceof MigrationError) throw error;
    throw new MigrationError("VALIDATION_FAILED", "The migrated database did not pass validation.", {
      backupPath: backup?.path || "",
    }, error);
  }
}

function normalizeMigrations(migrations = []) {
  const ordered = [...migrations].sort((left, right) => left.version - right.version);
  const seen = new Set();
  for (const migration of ordered) {
    if (!Number.isInteger(migration.version) || migration.version < 1 || !migration.name || typeof migration.up !== "function") {
      throw new MigrationError("INVALID_MIGRATION", "A migration definition is invalid.");
    }
    if (seen.has(migration.version)) {
      throw new MigrationError("INVALID_MIGRATION", `Duplicate migration version ${migration.version}.`);
    }
    seen.add(migration.version);
  }
  return ordered;
}

function readAppliedMigrations(db) {
  if (!tableExists(db, "schema_migrations")) return [];
  return queryRows(db, "SELECT version, name, applied_at AS appliedAt FROM schema_migrations ORDER BY version");
}

function ensureMigrationTable(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    )
  `);
}

function tableExists(db, name) {
  return Boolean(queryRows(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [name])[0]);
}

function queryRows(db, sql, params = []) {
  const statement = db.prepare(sql);
  statement.bind(params);
  const rows = [];
  while (statement.step()) rows.push(statement.getAsObject());
  statement.free();
  return rows;
}

function defaultCompareSnapshots(before, after) {
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new MigrationError("DATA_PRESERVATION_FAILED", "Representative business values changed during migration.", {
      before,
      after,
    });
  }
}

function defaultLogger(event, details) {
  console.info(JSON.stringify({ scope: "database_migration", event, ...details }));
}

function userMessageFor(code) {
  return {
    BACKUP_FAILED: "GI Billing could not create a safe database backup. Your original database was not changed.",
    MIGRATION_FAILED: "GI Billing could not update the database. Your original database and safety backup were preserved.",
    VALIDATION_FAILED: "The database update could not be verified. GI Billing did not replace the original database.",
    DATA_PRESERVATION_FAILED: "Database values changed unexpectedly during the update. The original database was preserved.",
    UNSUPPORTED_DATABASE_VERSION: "This database was created by a newer version of GI Billing.",
  }[code] || "GI Billing could not safely update the database.";
}

module.exports = {
  MigrationError,
  runMigrations,
  readAppliedMigrations,
  queryRows,
  tableExists,
};
