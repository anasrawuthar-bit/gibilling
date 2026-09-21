const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const initSqlJs = require("sql.js");
const database = require("../database");
const { analyzeDatabase, analyzeDatabaseFile, formatReport } = require("../data-integrity-dry-run");
const { createFixture, sampleInvoice, seedMasters } = require("./database-fixtures");

async function run() {
  await testAmbiguityAndCollisionDetection();
  await testHealthyDatabaseDryRunAndReadOnlyFile();
  await testExpandedCompanyIsolation();
  await testPartySnapshotsAndDocumentSequence();
  console.log("Phase 1 data-integrity dry-run tests passed.");
}

async function testPartySnapshotsAndDocumentSequence() {
  const fixture = await createFixture("gi-billing-phase1-integrity-");
  try {
    const { customer, item } = seedMasters({ customerName: "Original Party", itemName: "Sequence Item" });
    const first = sampleInvoice({ type: "sale", party: customer, item, id: "sequence-one", qty: 1 });
    first.invoiceNo = "";
    first.received = 10;
    let state = database.createTransaction(first);
    const firstInvoice = state.invoices.find((invoice) => invoice.id === first.invoiceId);
    const firstNumber = firstInvoice.invoiceNo;
    database.updateParty({ id: customer.id, name: "Renamed Party", type: "customer" });
    state = database.getState();
    assert.equal(state.invoices.find((invoice) => invoice.id === first.invoiceId).party, "Original Party", "invoice party name should remain a historical snapshot");
    assert.equal(state.payments.find((payment) => payment.invoiceId === first.invoiceId).party, "Original Party", "payment party name should remain a historical snapshot");

    assert.throws(() => database.deleteInvoice({ invoiceId: first.invoiceId }), /recorded payments/);
    const renamed = database.getState().parties.find((party) => party.id === customer.id);
    const second = sampleInvoice({ type: "sale", party: renamed, item, id: "sequence-two", qty: 1 });
    second.invoiceNo = "";
    state = database.createTransaction(second);
    const secondNumber = state.invoices.find((invoice) => invoice.id === second.invoiceId).invoiceNo;
    assert.notEqual(secondNumber, firstNumber, "deleting an invoice must not release its sequence number");
    database.deleteInvoice({ invoiceId: second.invoiceId });
    const third = sampleInvoice({ type: 'sale', party: renamed, item, id: 'sequence-three', qty: 1 });
    third.invoiceNo = '';
    state = database.createTransaction(third);
    assert.notEqual(state.invoices.find((invoice) => invoice.id === third.invoiceId).invoiceNo, secondNumber);
  } finally {
    fixture.cleanup();
  }
}

async function testAmbiguityAndCollisionDetection() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  createAnalysisSchema(db);
  seedAmbiguousData(db);

  const report = analyzeDatabase(db, { fixture: "ambiguous" });
  assert.equal(report.readOnly, true);
  assert.ok(report.partyReferences.duplicateMasters.some((group) => group.companyId === 1), "same-company normalized duplicates should be reported");
  assert.ok(report.partyReferences.ambiguous.some((row) => row.reason === "duplicate_exact_master"), "exact duplicate masters should block automatic matching");
  assert.ok(report.partyReferences.ambiguous.some((row) => row.reason === "multiple_normalized_candidates"), "case and whitespace candidates should remain ambiguous");
  assert.ok(report.partyReferences.unmatched.some((row) => row.partyName === "Missing Party"), "missing party should be reported");
  assert.equal(report.canBackfillPartyIds, false, "ambiguity should block a complete backfill");
  assert.equal(report.invoiceNumbers.exactCollisions.length, 1, "same company/type/number should be a collision");
  assert.ok(report.invoiceNumbers.crossCompany.length >= 1, "same number in another company should be reported separately");
  assert.ok(report.invoiceNumbers.crossDocumentType.length >= 1, "same number across document types should be informationally reported");
  assert.equal(report.canEnforceInvoiceUniqueness, false);
  assert.equal(report.companyIsolation.summary.ownershipMismatches, 1, "cross-company linked transaction should be detected");
  assert.match(formatReport(report), /Party-ID backfill gate: BLOCKED/);
  db.close();
}

async function testHealthyDatabaseDryRunAndReadOnlyFile() {
  const fixture = await createFixture("gi-billing-phase1-healthy-");
  try {
    const { customer, item } = seedMasters({ customerName: "Safe Customer", itemName: "Safe Item" });
    database.createTransaction(sampleInvoice({ type: "sale", party: customer, item, id: "safe-party-reference", qty: 1 }));
    const before = fs.readFileSync(fixture.databasePath);
    const report = await analyzeDatabaseFile(fixture.databasePath);
    const after = fs.readFileSync(fixture.databasePath);
    assert.deepEqual(after, before, "dry run must not modify the inspected database file");
    assert.equal(report.integrity[0].toLowerCase(), "ok");
    assert.equal(report.partyReferences.summary.ambiguous, 0);
    assert.equal(report.partyReferences.summary.unmatched, 0);
    assert.equal(report.invoiceNumbers.summary.exactCollisions, 0);
    assert.equal(report.companyIsolation.summary.ownershipMismatches, 0);
  } finally {
    fixture.cleanup();
  }
}

async function testExpandedCompanyIsolation() {
  const fixture = await createFixture("gi-billing-phase1-company-");
  try {
    const companyA = seedMasters({ customerName: "A Customer", supplierName: "A Supplier", itemName: "A Item" });
    database.updateBusinessSettings({ businessName: "Company A Business", invoicePrefix: "A" });
    let state = database.createTransaction(sampleInvoice({ type: "sale", party: companyA.customer, item: companyA.item, id: "company-a", qty: 1 }));
    const companyAInvoice = state.invoices.find((invoice) => invoice.id === "inv-company-a");
    database.recordInvoicePayment({ invoiceId: companyAInvoice.id, amount: 10, method: "Cash" });

    database.setCurrentCompany("Company B");
    const companyB = seedMasters({ customerName: "B Customer", supplierName: "B Supplier", itemName: "B Item" });
    database.updateBusinessSettings({ businessName: "Company B Business", invoicePrefix: "B" });
    state = database.createTransaction(sampleInvoice({ type: "sale", party: companyB.customer, item: companyB.item, id: "company-b", qty: 1 }));
    assert.equal(state.parties.some((party) => party.name === "A Customer"), false);
    assert.equal(state.items.some((item) => item.name === "A Item"), false);
    assert.equal(state.invoices.some((invoice) => invoice.id === "inv-company-a"), false);
    assert.equal(state.payments.some((payment) => payment.invoiceId === "inv-company-a"), false);
    assert.equal(state.stockMovements.some((movement) => movement.invoiceId === "inv-company-a"), false);
    assert.equal(state.businessSettings.businessName, "Company B Business");

    database.setCurrentCompany("testt");
    state = database.getState();
    assert.ok(state.invoices.some((invoice) => invoice.id === "inv-company-a"));
    assert.equal(state.invoices.some((invoice) => invoice.id === "inv-company-b"), false);
    assert.equal(
      state.businessSettings.businessName,
      "Company A Business",
      "business settings should remain scoped to the active company",
    );
  } finally {
    fixture.cleanup();
  }
}

function createAnalysisSchema(db) {
  db.run(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE companies (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE parties (id INTEGER PRIMARY KEY, company_id INTEGER, name TEXT);
    CREATE TABLE transactions (id TEXT PRIMARY KEY, company_id INTEGER, party TEXT);
    CREATE TABLE invoices (id TEXT PRIMARY KEY, company_id INTEGER, transaction_id TEXT, type TEXT, invoice_no TEXT, party TEXT);
    CREATE TABLE payments (id TEXT PRIMARY KEY, company_id INTEGER, invoice_id TEXT, transaction_id TEXT, party TEXT);
    CREATE TABLE estimates (id TEXT PRIMARY KEY, company_id INTEGER, quote_no TEXT, party TEXT);
    CREATE TABLE credit_notes (id TEXT PRIMARY KEY, company_id INTEGER, credit_no TEXT, party TEXT);
    CREATE TABLE stock_movements (id TEXT PRIMARY KEY, company_id INTEGER, invoice_id TEXT, transaction_id TEXT);
    CREATE TABLE ledger_entries (id INTEGER PRIMARY KEY, company_id INTEGER, transaction_id TEXT);
    CREATE TABLE invoice_items (id INTEGER PRIMARY KEY, invoice_id TEXT);
    CREATE TABLE estimate_items (id INTEGER PRIMARY KEY, estimate_id TEXT);
    CREATE TABLE credit_note_items (id INTEGER PRIMARY KEY, credit_note_id TEXT);
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT);
  `);
}

function seedAmbiguousData(db) {
  db.run("INSERT INTO companies VALUES (1, 'Company A'), (2, 'Company B')");
  db.run(`INSERT INTO parties VALUES
    (1, 1, 'ABC Traders'),
    (2, 1, 'ABC Traders'),
    (3, 1, 'abc traders'),
    (4, 1, 'ABC Traders '),
    (5, 1, 'Safe Customer'),
    (6, 2, 'ABC Traders')`);
  db.run(`INSERT INTO transactions VALUES
    ('tx-safe', 1, 'Safe Customer'),
    ('tx-wrong-company', 2, 'ABC Traders')`);
  db.run(`INSERT INTO invoices VALUES
    ('i-safe', 1, 'tx-safe', 'sale', 'INV-1', 'Safe Customer'),
    ('i-duplicate', 1, NULL, 'sale', 'INV-1', 'ABC Traders'),
    ('i-case', 1, NULL, 'sale', 'INV-2', 'Abc Traders'),
    ('i-missing', 1, NULL, 'sale', 'INV-3', 'Missing Party'),
    ('i-cross-company', 2, 'tx-wrong-company', 'sale', 'INV-1', 'ABC Traders'),
    ('i-cross-type', 1, NULL, 'purchase', 'INV-1', 'Safe Customer'),
    ('i-company-mismatch', 1, 'tx-wrong-company', 'sale', 'INV-4', 'Safe Customer')`);
  db.run("INSERT INTO estimates VALUES ('e1', 1, 'INV-1', 'Safe Customer')");
  db.run("INSERT INTO credit_notes VALUES ('c1', 1, 'CN-1', 'Safe Customer')");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
