const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");
const { EXPECTED_SCHEMA_TABLES, fileIdentity } = require("./data-integrity-dry-run");

const DATABASE_FILENAME = "gi-billing.sqlite";

function applicationMetadata(packageJson, runtime = {}) {
  const productName = packageJson.productName || packageJson.build?.productName || packageJson.name || "";
  return {
    application: packageJson.description || packageJson.name || "GI Billing",
    packageName: packageJson.name || "",
    productName,
    applicationIdentifier: packageJson.build?.appId || "Not configured",
    version: packageJson.version || "",
    packaged: Boolean(runtime.packaged),
  };
}

function expectedDatabasePath(userDataPath) {
  return path.join(userDataPath, DATABASE_FILENAME);
}

function calculateDevelopmentUserData(appDataPath, packageJson) {
  return path.join(appDataPath, packageJson.productName || packageJson.build?.productName || packageJson.name);
}

async function inspectDatabasePath(databasePath) {
  if (!databasePath || !fs.existsSync(databasePath)) {
    return { path: databasePath, exists: false, created: false, likelyActive: false };
  }
  const before = fileIdentity(databasePath);
  const bytes = fs.readFileSync(databasePath);
  const sqliteHeader = bytes.subarray(0, 16).toString("utf8") === "SQLite format 3\u0000";
  let valid = false;
  let tables = [];
  let schemaVersion = null;
  let migrationMetadata = [];
  let error = "";
  if (sqliteHeader) {
    const SQL = await initSqlJs();
    let database;
    try {
      database = new SQL.Database(bytes);
      tables = query(database, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map((row) => row.name);
      valid = query(database, "PRAGMA integrity_check").every((row) => String(row.integrity_check || Object.values(row)[0]).toLowerCase() === "ok");
      if (tables.includes("schema_migrations")) {
        migrationMetadata = query(database, "SELECT version, name, applied_at AS appliedAt FROM schema_migrations ORDER BY version");
        schemaVersion = Number(migrationMetadata.at(-1)?.version || 0);
      } else {
        schemaVersion = 0;
      }
    } catch (inspectionError) {
      error = inspectionError.message;
    } finally {
      database?.close();
    }
  }
  const after = fileIdentity(databasePath);
  const unchanged = before.hash === after.hash && before.size === after.size && before.modifiedMs === after.modifiedMs;
  if (!unchanged) throw new Error("Read-only verification failed: database identity changed during diagnostic.");
  const missingExpectedTables = EXPECTED_SCHEMA_TABLES.filter((table) => !tables.includes(table));
  return {
    path: databasePath,
    exists: true,
    created: false,
    size: before.size,
    modified: before.modified,
    sqliteHeader,
    valid,
    expectedSchemaDetected: missingExpectedTables.length === 0,
    missingExpectedTables,
    schemaVersion,
    migrationMetadata,
    likelyActive: valid && missingExpectedTables.length === 0 && path.basename(databasePath).toLowerCase() === DATABASE_FILENAME,
    before,
    after,
    unchanged,
    error,
  };
}

function formatDiagnostic({ metadata, developmentUserData, runtimeUserData, database }) {
  const packagedStatus = metadata.packaged
    ? "Packaged Electron runtime"
    : "Development Electron runtime; no packaged executable was detected";
  const lines = [
    "GI Billing Database Diagnostic",
    "",
    `Application: ${metadata.application}`,
    `Product Name: ${metadata.productName}`,
    `Application Identifier: ${metadata.applicationIdentifier}`,
    `Runtime: ${packagedStatus}`,
    "",
    `Development userData: ${developmentUserData}`,
    `Runtime userData: ${runtimeUserData}`,
    `Expected database: ${database.path}`,
    `Database exists: ${database.exists ? "YES" : "NO"}`,
  ];
  if (!database.exists) {
    lines.push("", "No existing GI Billing database was found.", "No database was created.");
    return lines.join("\n");
  }
  lines.push(
    `Database size: ${database.size}`,
    `Database modified: ${database.modified}`,
    `SQLite valid: ${database.valid ? "YES" : "NO"}`,
    `Expected schema detected: ${database.expectedSchemaDetected ? "YES" : "NO"}`,
    `Schema version: ${database.schemaVersion ?? "Unknown"}`,
    `Migration metadata: ${database.migrationMetadata.length ? database.migrationMetadata.map((row) => `${row.version}:${row.name}`).join(", ") : "None"}`,
    `Likely active database: ${database.likelyActive ? "YES" : "NO"}`,
    `Read-only hash unchanged: ${database.unchanged ? "YES" : "NO"}`,
  );
  return lines.join("\n");
}

function query(database, sql, params = []) {
  const statement = database.prepare(sql);
  statement.bind(params);
  const rows = [];
  while (statement.step()) rows.push(statement.getAsObject());
  statement.free();
  return rows;
}

module.exports = {
  DATABASE_FILENAME,
  applicationMetadata,
  calculateDevelopmentUserData,
  expectedDatabasePath,
  formatDiagnostic,
  inspectDatabasePath,
};
