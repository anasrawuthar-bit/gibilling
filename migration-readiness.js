const path = require("path");
const { analyzeDatabaseFile } = require("./data-integrity-dry-run");

async function assessMigrationReadiness(databasePath) {
  const report = await analyzeDatabaseFile(databasePath);
  const integrityPass = report.integrity.length === 1 && report.integrity[0].toLowerCase() === "ok" && report.expectedSchemaDetected;
  const partyPass = report.partyReferences.summary.ambiguous === 0 && report.partyReferences.summary.unmatched === 0;
  const numberingPass = report.invoiceNumbers.summary.exactCollisions === 0;
  const isolationPass = report.companyIsolation.summary.ownershipMismatches === 0
    && report.companyIsolation.summary.foreignKeyIssues === 0;
  const preservationPass = Boolean(report.readOnlyVerification?.unchanged);
  const ready = integrityPass && partyPass && numberingPass && isolationPass && preservationPass;
  return { report, gates: { integrityPass, partyPass, numberingPass, isolationPass, preservationPass }, ready };
}

function formatReadiness(result, databasePath) {
  const { report, gates, ready } = result;
  return [
    "PHASE 1 MIGRATION READINESS",
    "",
    `Database: ${databasePath}`,
    `Integrity: ${gates.integrityPass ? "PASS" : "FAIL"}`,
    `Party references: ${gates.partyPass ? "PASS" : "BLOCKED"}`,
    `Invoice numbering: ${gates.numberingPass ? "PASS" : "BLOCKED"}`,
    `Company isolation: ${gates.isolationPass ? "PASS" : "BLOCKED"}`,
    `Data preservation: ${gates.preservationPass ? "PASS" : "BLOCKED"}`,
    `Ambiguous records: ${report.partyReferences.summary.ambiguous}`,
    `Unmatched records: ${report.partyReferences.summary.unmatched}`,
    `Invoice collisions: ${report.invoiceNumbers.summary.exactCollisions}`,
    "",
    `Recommendation: ${ready ? "READY FOR MIGRATION DESIGN" : "BLOCKED - RESOLUTION REQUIRED"}`,
  ].join("\n");
}

if (require.main === module) {
  const suppliedPath = process.argv[2];
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Roaming");
  const defaultPath = path.join(appData, "gi-billing-software", "gi-billing.sqlite");
  const databasePath = path.resolve(suppliedPath || defaultPath);
  assessMigrationReadiness(databasePath)
    .then((result) => console.log(formatReadiness(result, databasePath)))
    .catch((error) => {
      console.error(`Migration readiness failed: ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = { assessMigrationReadiness, formatReadiness };
