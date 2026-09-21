const fs = require("fs");
const crypto = require("crypto");
const initSqlJs = require("sql.js");

const EXPECTED_SCHEMA_TABLES = ["companies", "parties", "items", "transactions", "invoices", "invoice_items"];

const PARTY_REFERENCE_SOURCES = [
  { table: "invoices", id: "id", company: "company_id", party: "party", label: "Invoice" },
  { table: "transactions", id: "id", company: "company_id", party: "party", label: "Transaction" },
  { table: "payments", id: "id", company: "company_id", party: "party", label: "Payment" },
  { table: "estimates", id: "id", company: "company_id", party: "party", label: "Estimate" },
  { table: "credit_notes", id: "id", company: "company_id", party: "party", label: "Credit note" },
  { table: "debit_notes", id: "id", company: "company_id", party: "party", label: "Debit note" },
];

async function analyzeDatabaseFile(databasePath) {
  if (!databasePath || !fs.existsSync(databasePath)) throw new Error("Database file was not found.");
  const before = fileIdentity(databasePath);
  const SQL = await initSqlJs();
  const bytes = fs.readFileSync(databasePath);
  const database = new SQL.Database(bytes);
  let report;
  try {
    report = analyzeDatabase(database, { databasePath, size: bytes.length });
  } finally {
    database.close();
  }
  const after = fileIdentity(databasePath);
  const unchanged = before.hash === after.hash
    && before.size === after.size
    && before.modifiedMs === after.modifiedMs;
  if (!unchanged) throw new Error("Read-only verification failed: the database file changed during analysis.");
  return { ...report, readOnlyVerification: { before, after, unchanged } };
}

function analyzeDatabase(database, source = {}) {
  const tables = new Set(query(database, "SELECT name FROM sqlite_master WHERE type='table'").map((row) => row.name));
  const partyFindings = analyzePartyReferences(database, tables);
  const invoiceFindings = analyzeInvoiceNumbers(database, tables);
  const companyFindings = analyzeCompanyIsolation(database, tables);
  const integrity = query(database, "PRAGMA integrity_check").map((row) => String(row.integrity_check || Object.values(row)[0] || ""));
  const missingExpectedTables = EXPECTED_SCHEMA_TABLES.filter((table) => !tables.has(table));

  return {
    generatedAt: new Date().toISOString(),
    source,
    readOnly: true,
    integrity,
    expectedSchemaDetected: missingExpectedTables.length === 0,
    missingExpectedTables,
    partyReferences: partyFindings,
    invoiceNumbers: invoiceFindings,
    companyIsolation: companyFindings,
    canBackfillPartyIds: partyFindings.ambiguous.length === 0 && partyFindings.unmatched.length === 0,
    canEnforceInvoiceUniqueness: invoiceFindings.exactCollisions.length === 0,
  };
}

function fileIdentity(filePath) {
  const stat = fs.statSync(filePath);
  return {
    hash: crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex").toUpperCase(),
    size: stat.size,
    modified: stat.mtime.toISOString(),
    modifiedMs: stat.mtimeMs,
  };
}

function analyzePartyReferences(database, tables) {
  const parties = tables.has("parties")
    ? query(database, "SELECT id, company_id AS companyId, name FROM parties ORDER BY company_id, id")
    : [];
  const exactIndex = groupBy(parties, (party) => `${party.companyId}\u0000${String(party.name || "")}`);
  const normalizedIndex = groupBy(parties, (party) => `${party.companyId}\u0000${normalizeName(party.name)}`);
  const safeMatches = [];
  const ambiguous = [];
  const unmatched = [];
  const scannedByTable = {};

  for (const source of PARTY_REFERENCE_SOURCES) {
    if (!tables.has(source.table)) continue;
    const rows = query(
      database,
      `SELECT ${source.id} AS id, ${source.company} AS companyId, ${source.party} AS partyName FROM ${source.table} ORDER BY ${source.company}, ${source.id}`,
    );
    scannedByTable[source.table] = rows.length;
    for (const row of rows) {
      const exact = exactIndex.get(`${row.companyId}\u0000${String(row.partyName || "")}`) || [];
      const normalized = normalizedIndex.get(`${row.companyId}\u0000${normalizeName(row.partyName)}`) || [];
      const finding = {
        table: source.table,
        recordType: source.label,
        recordId: row.id,
        companyId: row.companyId,
        partyName: String(row.partyName || ""),
      };
      if (exact.length === 1) {
        safeMatches.push({ ...finding, partyId: exact[0].id, match: "exact" });
      } else if (exact.length > 1) {
        ambiguous.push({ ...finding, reason: "duplicate_exact_master", candidatePartyIds: exact.map((party) => party.id) });
      } else if (normalized.length) {
        ambiguous.push({
          ...finding,
          reason: normalized.length > 1 ? "multiple_normalized_candidates" : "case_or_whitespace_variation",
          candidatePartyIds: normalized.map((party) => party.id),
          candidateNames: normalized.map((party) => party.name),
        });
      } else {
        unmatched.push({ ...finding, reason: "missing_party_master" });
      }
    }
  }

  const duplicateMasters = [...normalizedIndex.values()]
    .filter((rows) => rows.length > 1)
    .map((rows) => ({
      companyId: rows[0].companyId,
      normalizedName: normalizeName(rows[0].name),
      partyIds: rows.map((row) => row.id),
      names: rows.map((row) => row.name),
      exactDuplicate: new Set(rows.map((row) => String(row.name || ""))).size === 1,
    }));

  return {
    scannedByTable,
    scanned: Object.values(scannedByTable).reduce((sum, count) => sum + count, 0),
    safeMatches,
    ambiguous,
    unmatched,
    duplicateMasters,
    summary: {
      safe: safeMatches.length,
      ambiguous: ambiguous.length,
      unmatched: unmatched.length,
      duplicateMasterGroups: duplicateMasters.length,
    },
  };
}

function analyzeInvoiceNumbers(database, tables) {
  const documents = [];
  if (tables.has("invoices")) {
    documents.push(...query(database, "SELECT id, company_id AS companyId, type AS documentType, invoice_no AS documentNo FROM invoices"));
  }
  if (tables.has("estimates")) {
    documents.push(...query(database, "SELECT id, company_id AS companyId, 'estimate' AS documentType, quote_no AS documentNo FROM estimates"));
  }
  if (tables.has("credit_notes")) {
    documents.push(...query(database, "SELECT id, company_id AS companyId, 'credit_note' AS documentType, credit_no AS documentNo FROM credit_notes"));
  }
  if (tables.has("debit_notes")) {
    documents.push(...query(database, "SELECT id, company_id AS companyId, 'debit_note' AS documentType, debit_no AS documentNo FROM debit_notes"));
  }

  const exactGroups = groupBy(documents, (row) => `${row.companyId}\u0000${row.documentType}\u0000${row.documentNo}`);
  const companyNumberGroups = groupBy(documents, (row) => `${row.companyId}\u0000${row.documentNo}`);
  const numberGroups = groupBy(documents, (row) => String(row.documentNo || ""));
  const exactCollisions = collisionRows(exactGroups, "same_company_document_type_number");
  const crossDocumentType = [...companyNumberGroups.values()]
    .filter((rows) => new Set(rows.map((row) => row.documentType)).size > 1)
    .map((rows) => summarizeCollision(rows, "same_company_number_different_document_type"));
  const crossCompany = [...numberGroups.values()]
    .filter((rows) => new Set(rows.map((row) => row.companyId)).size > 1)
    .map((rows) => summarizeCollision(rows, "same_number_different_company"));

  return {
    scanned: documents.length,
    exactCollisions,
    crossDocumentType,
    crossCompany,
    summary: {
      exactCollisions: exactCollisions.length,
      crossDocumentTypeUses: crossDocumentType.length,
      crossCompanyUses: crossCompany.length,
    },
  };
}

function analyzeCompanyIsolation(database, tables) {
  const checks = [
    ["invoices", "transactions", "transaction_id", "id"],
    ["payments", "invoices", "invoice_id", "id"],
    ["payments", "transactions", "transaction_id", "id"],
    ["stock_movements", "invoices", "invoice_id", "id"],
    ["stock_movements", "transactions", "transaction_id", "id"],
    ["ledger_entries", "transactions", "transaction_id", "id"],
  ];
  const ownershipMismatches = [];
  for (const [child, parent, childKey, parentKey] of checks) {
    if (!tables.has(child) || !tables.has(parent)) continue;
    const count = Number(query(database, `
      SELECT COUNT(*) AS count FROM ${child} child
      JOIN ${parent} parent ON parent.${parentKey} = child.${childKey}
      WHERE child.company_id <> parent.company_id
    `)[0]?.count || 0);
    if (count) ownershipMismatches.push({ child, parent, childKey, count });
  }
  const unscopedTables = ["invoice_items", "estimate_items", "credit_note_items", "debit_note_items", "app_settings"].filter((table) => tables.has(table));
  const foreignKeyIssues = query(database, "PRAGMA foreign_key_check");
  return {
    ownershipMismatches,
    foreignKeyIssues,
    unscopedTables,
    summary: {
      ownershipMismatches: ownershipMismatches.reduce((sum, row) => sum + row.count, 0),
      foreignKeyIssues: foreignKeyIssues.length,
      unscopedTables: unscopedTables.length,
    },
  };
}

function formatReport(report) {
  const party = report.partyReferences.summary;
  const numbers = report.invoiceNumbers.summary;
  const isolation = report.companyIsolation.summary;
  return [
    "PHASE 1 DATA INTEGRITY DRY RUN",
    "",
    `Database: ${report.source.databasePath || "in-memory fixture"}`,
    `Read only: ${report.readOnly ? "yes" : "no"}`,
    `Integrity: ${report.integrity.join(", ")}`,
    "",
    "A. Party Reference Findings",
    `References scanned: ${report.partyReferences.scanned}`,
    `Safe exact matches: ${party.safe}`,
    `Ambiguous matches: ${party.ambiguous}`,
    `Unmatched references: ${party.unmatched}`,
    `Duplicate master groups: ${party.duplicateMasterGroups}`,
    "",
    "B. Invoice Number Findings",
    `Documents scanned: ${report.invoiceNumbers.scanned}`,
    `Exact collisions: ${numbers.exactCollisions}`,
    `Cross-document-type reuse: ${numbers.crossDocumentTypeUses}`,
    `Cross-company reuse: ${numbers.crossCompanyUses}`,
    "",
    "C. Company Isolation Findings",
    `Ownership mismatches: ${isolation.ownershipMismatches}`,
    `Foreign-key issues: ${isolation.foreignKeyIssues}`,
    `Tables requiring inherited/global scope review: ${isolation.unscopedTables}`,
    "",
    `Party-ID backfill gate: ${report.canBackfillPartyIds ? "SAFE" : "BLOCKED"}`,
    `Invoice uniqueness gate: ${report.canEnforceInvoiceUniqueness ? "SAFE" : "BLOCKED"}`,
  ].join("\n");
}

function normalizeName(value) {
  return String(value || "").trim().toLocaleLowerCase("en-IN");
}

function groupBy(rows, keyFor) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFor(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

function collisionRows(groups, reason) {
  return [...groups.values()].filter((rows) => rows.length > 1).map((rows) => summarizeCollision(rows, reason));
}

function summarizeCollision(rows, reason) {
  return {
    reason,
    companyIds: [...new Set(rows.map((row) => row.companyId))],
    documentTypes: [...new Set(rows.map((row) => row.documentType))],
    documentNo: rows[0].documentNo,
    count: rows.length,
    recordIds: rows.map((row) => row.id),
  };
}

function query(database, sql, params = []) {
  const statement = database.prepare(sql);
  statement.bind(params);
  const rows = [];
  while (statement.step()) rows.push(statement.getAsObject());
  statement.free();
  return rows;
}

if (require.main === module) {
  const path = require("path");
  const explicitPath = process.argv.slice(2).find((value) => !value.startsWith("--"));
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Roaming");
  const defaultPath = path.join(appData, "gi-billing-software", "gi-billing.sqlite");
  const databasePath = explicitPath ? path.resolve(explicitPath) : defaultPath;
  analyzeDatabaseFile(databasePath)
    .then((report) => {
      console.log(process.argv.includes("--json") ? JSON.stringify(report, null, 2) : formatReport(report));
    })
    .catch((error) => {
      console.error(`Data-integrity dry run failed: ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = { EXPECTED_SCHEMA_TABLES, analyzeDatabase, analyzeDatabaseFile, fileIdentity, formatReport };
