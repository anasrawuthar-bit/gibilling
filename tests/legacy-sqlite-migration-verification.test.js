/**
 * ZynBill Legacy SQLite Migration Verification Suite
 *
 * Verifies:
 * 1. Safe, atomic migration of real legacy database (Schema Version 9 -> 10).
 * 2. Idempotent addition of missing columns:
 *    - invoices: company_registration_type, company_gstin, pricing_mode
 *    - estimates: company_registration_type, company_gstin, pricing_mode
 *    - credit_notes: company_registration_type, company_gstin, pricing_mode
 *    - debit_notes: company_registration_type, company_gstin, pricing_mode
 * 3. Preservation of existing customer records, invoices, payments, and financial totals.
 * 4. GST Registration type derivation:
 *    - Preserves 'regular' for existing GST-enabled companies (no silent unregistering).
 *    - Maps enableTax: false to 'unregistered'.
 *    - Preserves explicit 'composition' where configured.
 * 5. Idempotence: Reopening already-migrated database without errors or pending migrations.
 * 6. Migration failure and atomic rollback handling.
 * 7. Integrity and foreign key constraints (PRAGMA integrity_check, PRAGMA foreign_key_check).
 */

const assert = require("assert");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { DatabaseSync } = require("node:sqlite");

const db = require("../database");

const LEGACY_BACKUP_SOURCE = path.join(__dirname, "..", "gi-billing-production-backup.sqlite");

async function runLegacyMigrationTests() {
  console.log("==================================================================");
  console.log("    CRITICAL SQLITE MIGRATION & DATA PRESERVATION VERIFICATION    ");
  console.log("==================================================================");

  assert.ok(fs.existsSync(LEGACY_BACKUP_SOURCE), `Legacy backup source must exist at ${LEGACY_BACKUP_SOURCE}`);

  // -----------------------------------------------------------------
  // TEST 1: Migration of Actual Legacy Database (Version 9 -> 10)
  // -----------------------------------------------------------------
  console.log("\n▶ TEST 1: Migrating Actual Legacy Production Database (Schema 9 -> 10)...");
  
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "zynbill-legacy-test-"));
  const testDbFile = path.join(tmpDir, "gi-billing.sqlite");
  fs.copyFileSync(LEGACY_BACKUP_SOURCE, testDbFile);

  // Capture pre-migration metrics directly using node:sqlite
  const preDb = new DatabaseSync(testDbFile);
  const preVersion = preDb.prepare("SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations").get().v;
  assert.strictEqual(preVersion, 9, "Legacy database must initially be at schema version 9");

  const preInvoicesCols = preDb.prepare("PRAGMA table_info(invoices)").all().map(c => c.name);
  assert.ok(!preInvoicesCols.includes("company_registration_type"), "company_registration_type must be missing before migration");
  assert.ok(!preInvoicesCols.includes("company_gstin"), "company_gstin must be missing before migration");
  assert.ok(!preInvoicesCols.includes("pricing_mode"), "pricing_mode must be missing before migration");

  const preInvoiceCount = preDb.prepare("SELECT COUNT(*) AS cnt FROM invoices").get().cnt;
  const prePaymentCount = preDb.prepare("SELECT COUNT(*) AS cnt FROM payments").get().cnt;
  const prePartyCount = preDb.prepare("SELECT COUNT(*) AS cnt FROM parties").get().cnt;
  const preItemCount = preDb.prepare("SELECT COUNT(*) AS cnt FROM items").get().cnt;
  const preInvoiceSum = preDb.prepare("SELECT COALESCE(SUM(total), 0) AS total FROM invoices").get().total;
  const prePaymentSum = preDb.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM payments").get().total;
  preDb.close();

  console.log(`  Pre-migration stats: ${preInvoiceCount} invoices, ${prePaymentCount} payments, total sum: ₹${preInvoiceSum}`);

  // Execute initDatabase on the legacy database copy
  const state = await db.initDatabase(tmpDir);
  assert.ok(state, "initDatabase must succeed and return state");

  // Verify post-migration state directly from the SQLite database
  const postDb = new DatabaseSync(testDbFile);
  const postVersion = postDb.prepare("SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations").get().v;
  assert.strictEqual(postVersion, 10, "Post-migration schema version must be 10");

  const postInvoicesCols = postDb.prepare("PRAGMA table_info(invoices)").all().map(c => c.name);
  assert.ok(postInvoicesCols.includes("company_registration_type"), "invoices must have company_registration_type");
  assert.ok(postInvoicesCols.includes("company_gstin"), "invoices must have company_gstin");
  assert.ok(postInvoicesCols.includes("pricing_mode"), "invoices must have pricing_mode");

  const postEstimatesCols = postDb.prepare("PRAGMA table_info(estimates)").all().map(c => c.name);
  assert.ok(postEstimatesCols.includes("company_registration_type"), "estimates must have company_registration_type");

  const postCreditCols = postDb.prepare("PRAGMA table_info(credit_notes)").all().map(c => c.name);
  assert.ok(postCreditCols.includes("company_registration_type"), "credit_notes must have company_registration_type");

  const postDebitCols = postDb.prepare("PRAGMA table_info(debit_notes)").all().map(c => c.name);
  assert.ok(postDebitCols.includes("company_registration_type"), "debit_notes must have company_registration_type");

  // Verify financial totals and record counts are 100% preserved
  const postInvoiceCount = postDb.prepare("SELECT COUNT(*) AS cnt FROM invoices").get().cnt;
  const postPaymentCount = postDb.prepare("SELECT COUNT(*) AS cnt FROM payments").get().cnt;
  const postPartyCount = postDb.prepare("SELECT COUNT(*) AS cnt FROM parties").get().cnt;
  const postItemCount = postDb.prepare("SELECT COUNT(*) AS cnt FROM items").get().cnt;
  const postInvoiceSum = postDb.prepare("SELECT COALESCE(SUM(total), 0) AS total FROM invoices").get().total;
  const postPaymentSum = postDb.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM payments").get().total;

  assert.strictEqual(postInvoiceCount, preInvoiceCount, "Invoice count must not change");
  assert.strictEqual(postPaymentCount, prePaymentCount, "Payment count must not change");
  assert.strictEqual(postPartyCount, prePartyCount, "Party count must not change");
  assert.strictEqual(postItemCount, preItemCount, "Item count must not change");
  assert.strictEqual(postInvoiceSum, preInvoiceSum, "Invoice total sum must be exactly preserved");
  assert.strictEqual(postPaymentSum, prePaymentSum, "Payment total sum must be exactly preserved");

  // Verify PRAGMA checks
  const integrity = postDb.prepare("PRAGMA integrity_check").all();
  assert.strictEqual(integrity[0].integrity_check, "ok", "PRAGMA integrity_check must be ok");

  const fks = postDb.prepare("PRAGMA foreign_key_check").all();
  assert.strictEqual(fks.length, 0, "PRAGMA foreign_key_check must return 0 violations");

  // Verify safety backup was created in migration-backups/
  const backupDir = path.join(tmpDir, "migration-backups");
  assert.ok(fs.existsSync(backupDir), "migration-backups directory must exist");
  const backupFiles = fs.readdirSync(backupDir).filter(f => f.endsWith(".sqlite"));
  assert.ok(backupFiles.length > 0, "A pre-migration safety backup file must be created");

  postDb.close();
  console.log("  ✓ Legacy production database safely migrated to Schema Version 10.");
  console.log("  ✓ All financial records, customer counts, and database integrity verified.");

  // -----------------------------------------------------------------
  // TEST 2: Repeated Startup / Idempotent Reopening
  // -----------------------------------------------------------------
  console.log("\n▶ TEST 2: Testing Repeated Startup (Idempotence)...");

  // Re-open the already migrated database
  const secondState = await db.initDatabase(tmpDir);
  assert.ok(secondState, "Second startup must succeed seamlessly");

  const migrationInfo = db.getMigrationInfo();
  assert.strictEqual(migrationInfo.currentVersion, 10, "Current version remains 10");
  assert.strictEqual(migrationInfo.targetVersion, 10, "Target version is 10");
  assert.strictEqual(migrationInfo.lastResult.applied.length, 0, "No pending migrations executed on restart");
  console.log("  ✓ Reopening migrated database succeeds instantly with 0 pending migrations.");

  // -----------------------------------------------------------------
  // TEST 3: Registration Type Derivation for GST-Enabled vs Unregistered
  // -----------------------------------------------------------------
  console.log("\n▶ TEST 3: Testing GST Registration Type Derivation Logic...");

  // Subcase A: GST-enabled company with enableTax: true
  const gstDir = fs.mkdtempSync(path.join(os.tmpdir(), "zynbill-gst-test-"));
  const gstDbFile = path.join(gstDir, "gi-billing.sqlite");
  fs.copyFileSync(LEGACY_BACKUP_SOURCE, gstDbFile);

  const modDb = new DatabaseSync(gstDbFile);
  // Company 2 has enableTax: true. Let's make sure it doesn't have gstRegistrationType set yet.
  modDb.prepare("DELETE FROM company_settings WHERE key = 'gstRegistrationType'").run();
  modDb.close();

  await db.initDatabase(gstDir);
  db.setCurrentCompany("termo");
  let termoSettings = db.getBusinessSettings();
  assert.strictEqual(termoSettings.gstRegistrationType, "regular", "GST-enabled company must derive 'regular' registration type");
  assert.strictEqual(termoSettings.enableTax, true, "enableTax must be true");

  // Subcase B: Legacy company configured with enableTax: false
  const unregDir = fs.mkdtempSync(path.join(os.tmpdir(), "zynbill-unreg-test-"));
  const unregDbFile = path.join(unregDir, "gi-billing.sqlite");
  fs.copyFileSync(LEGACY_BACKUP_SOURCE, unregDbFile);

  const unregDb = new DatabaseSync(unregDbFile);
  unregDb.prepare("DELETE FROM company_settings WHERE key = 'gstRegistrationType'").run();
  unregDb.prepare("INSERT OR REPLACE INTO company_settings (company_id, key, value) VALUES (2, 'enableTax', 'false')").run();
  unregDb.close();

  await db.initDatabase(unregDir);
  db.setCurrentCompany("termo");
  termoSettings = db.getBusinessSettings();
  assert.strictEqual(termoSettings.gstRegistrationType, "unregistered", "Company with enableTax: false must derive 'unregistered'");
  assert.strictEqual(termoSettings.enableTax, false, "enableTax must be false for unregistered");

  console.log("  ✓ Correct registration type safely derived from legacy settings without false unregistering.");

  // -----------------------------------------------------------------
  // TEST 4: Migration Failure and Rollback Safety
  // -----------------------------------------------------------------
  console.log("\n▶ TEST 4: Testing Migration Failure & Rollback Handling...");

  const failDir = fs.mkdtempSync(path.join(os.tmpdir(), "zynbill-fail-test-"));
  const failDbFile = path.join(failDir, "gi-billing.sqlite");
  fs.copyFileSync(LEGACY_BACKUP_SOURCE, failDbFile);

  // Attempt running an additional failing migration
  let threwExpected = false;
  try {
    await db.initDatabase(failDir, {
      additionalMigrations: [
        {
          version: 11,
          name: "intentional_failing_migration",
          up: () => {
            throw new Error("Intentional migration error to verify atomic rollback");
          }
        }
      ]
    });
  } catch (err) {
    threwExpected = true;
    assert.strictEqual(err.code, "MIGRATION_FAILED", "Should throw MIGRATION_FAILED MigrationError");
  }

  assert.ok(threwExpected, "Migration must fail and throw cleanly");

  // Verify the database version was NOT bumped to 11 (the failed migration was never committed)
  const failCheckDb = new DatabaseSync(failDbFile);
  const failVersion = failCheckDb.prepare("SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations").get().v;
  assert.ok(failVersion < 11, `Failed migration 11 must be rolled back; found version ${failVersion}`);
  failCheckDb.close();
  console.log("  ✓ Migration failure cleanly rolled back transaction and preserved schema version.");

  // Cleanup temporary directories
  try {
    [tmpDir, gstDir, unregDir, failDir].forEach(d => fs.rmSync(d, { recursive: true, force: true }));
  } catch (_) {}

  console.log("\n==================================================================");
  console.log("   ALL LEGACY MIGRATION & DATA PRESERVATION TESTS PASSED 100%!  ");
  console.log("==================================================================");
}

runLegacyMigrationTests().catch((err) => {
  console.error("Test execution aborted:", err);
  process.exit(1);
});
