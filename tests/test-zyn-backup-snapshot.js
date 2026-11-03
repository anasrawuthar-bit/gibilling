const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const database = require("../database");

async function testZynBackupAndRestore() {
  console.log("=== Testing .zyn Backup and Snapshot Integrity ===");
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "gi-zyn-test-"));
  await database.initDatabase(testDir);

  // Create sample company and transaction
  const company = database.createCompany({ name: "Malabar Traders" });
  database.setCurrentCompany("Malabar Traders");

  database.createParty({
    name: "Calicut Retail Hub",
    type: "customer",
    phone: "9847012345"
  });

  database.createItem({
    name: "Basmati Rice 25kg",
    salePrice: 2400,
    purchasePrice: 1950,
    unit: "Bag"
  });

  // Step 1: Export to .zyn
  const zynPath = path.join(testDir, "Malabar_Traders-backup.zyn");
  const backupRes = database.backupTo(zynPath);
  assert.strictEqual(backupRes.path, zynPath, "Path must match .zyn export path");
  assert(fs.existsSync(zynPath), "File must exist on disk with .zyn extension");

  // Step 2: Preview the .zyn backup
  const preview = await database.previewBackup(zynPath);
  assert.strictEqual(preview.valid, true, ".zyn backup preview must be valid");
  assert(preview.companies.includes("Malabar Traders"), "Must contain Malabar Traders");
  assert.strictEqual(preview.filename, "Malabar_Traders-backup.zyn", "Filename must end with .zyn");
  console.log("  ✓ .zyn backup created & verified with preview");

  // Step 3: Mutate current database
  database.createParty({ name: "Temporary Party to Wipe", type: "customer" });
  assert((database.getState().parties || []).some(p => p.name === "Temporary Party to Wipe"));

  // Step 4: Restore from .zyn
  const restoreRes = await database.restoreBackup(zynPath, { userDataPath: testDir });
  assert.strictEqual(restoreRes.success, true, "Restore success must be true");

  const restoredParties = database.getState().parties || [];
  assert(!restoredParties.some(p => p.name === "Temporary Party to Wipe"), "Temporary party should be gone after restore");
  assert(restoredParties.some(p => p.name === "Calicut Retail Hub"), "Original party must be present");
  console.log("  ✓ Successfully restored from .zyn file");

  // Clean up
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch (_) {}

  console.log("=== ALL .ZYN BACKUP AND RESTORE TESTS PASSED 100% ===");
}

testZynBackupAndRestore().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
