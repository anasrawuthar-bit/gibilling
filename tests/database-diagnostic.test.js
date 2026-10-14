const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const initSqlJs = require("sql.js");
const packageJson = require("../package.json");
const database = require("../database");
const {
  applicationMetadata,
  calculateDevelopmentUserData,
  expectedDatabasePath,
  inspectDatabasePath,
} = require("../database-diagnostic-core");
const { analyzeDatabaseFile } = require("../data-integrity-dry-run");
const { assessMigrationReadiness } = require("../migration-readiness");

async function run() {
  testPathCalculation();
  await testMissingDatabase();
  await testInvalidDatabase();
  await testWrongApplicationDatabase();
  await testValidDatabaseAndReadOnlyGuarantee();
  console.log("Database diagnostic tests passed.");
}

function testPathCalculation() {
  const appData = "C:\\Users\\Fixture\\AppData\\Roaming";
  const userData = calculateDevelopmentUserData(appData, packageJson);
  assert.equal(userData, path.join(appData, "GI Billing"));
  assert.equal(expectedDatabasePath(userData), path.join(appData, "GI Billing", "gi-billing.sqlite"));
  const development = applicationMetadata(packageJson, { packaged: false });
  const packaged = applicationMetadata(packageJson, { packaged: true });
  assert.equal(development.productName, "GI Billing");
  assert.equal(development.applicationIdentifier, "com.gibilling.desktop");
  assert.equal(packaged.packaged, true);
}

async function testMissingDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gi-diagnostic-missing-"));
  const missing = path.join(root, "missing", "gi-billing.sqlite");
  try {
    const result = await inspectDatabasePath(missing);
    assert.equal(result.exists, false);
    assert.equal(fs.existsSync(missing), false, "diagnostic must not create the database");
    assert.equal(fs.existsSync(path.dirname(missing)), false, "diagnostic must not create parent directories");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testInvalidDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gi-diagnostic-invalid-"));
  const file = path.join(root, "invalid.sqlite");
  try {
    fs.writeFileSync(file, "not a sqlite database");
    const before = fs.readFileSync(file);
    const result = await inspectDatabasePath(file);
    assert.equal(result.sqliteHeader, false);
    assert.equal(result.valid, false);
    assert.deepEqual(fs.readFileSync(file), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testWrongApplicationDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gi-diagnostic-wrong-"));
  const file = path.join(root, "other.sqlite");
  const SQL = await initSqlJs();
  const wrong = new SQL.Database();
  try {
    wrong.run("CREATE TABLE unrelated_records (id INTEGER PRIMARY KEY, value TEXT)");
    fs.writeFileSync(file, Buffer.from(wrong.export()));
    const result = await inspectDatabasePath(file);
    assert.equal(result.valid, true);
    assert.equal(result.expectedSchemaDetected, false);
    assert.equal(result.likelyActive, false);
  } finally {
    wrong.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testValidDatabaseAndReadOnlyGuarantee() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gi-diagnostic-valid-"));
  try {
    await database.initDatabase(root);
    const file = database.getDatabasePath();
    const before = fs.readFileSync(file);
    const diagnostic = await inspectDatabasePath(file);
    assert.equal(diagnostic.valid, true);
    assert.equal(diagnostic.expectedSchemaDetected, true);
    assert.equal(diagnostic.schemaVersion, 9);
    assert.equal(diagnostic.unchanged, true);

    const audit = await analyzeDatabaseFile(file);
    assert.equal(audit.readOnlyVerification.unchanged, true);
    assert.deepEqual(fs.readFileSync(file), before, "explicit audit path must remain unchanged");

    const readiness = await assessMigrationReadiness(file);
    assert.equal(readiness.gates.integrityPass, true);
    assert.equal(readiness.gates.preservationPass, true);
    assert.equal(readiness.ready, true);
    assert.equal(database.getMigrationInfo().targetVersion, 9, "current target migration should be 9");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
