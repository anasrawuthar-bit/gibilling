const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const initSqlJs = require("sql.js");
const { MigrationError, runMigrations, queryRows, tableExists } = require("./database-migrations");

let SQL;
let db;
let dbPath;
let transactionDepth = 0;
let lastMigrationResult = null;

const SCHEMA_VERSION = 9;

function enforceForeignKeys(database = db) {
  if (!database) return;
  database.run("PRAGMA foreign_keys = ON;");
  const rows = queryRows(database, "PRAGMA foreign_keys;");
  const enabled = Number(rows[0]?.foreign_keys ?? Object.values(rows[0] || {})[0] ?? 0);
  if (enabled !== 1) {
    throw new Error("Unable to enforce PRAGMA foreign_keys = ON; on database connection.");
  }
}

function isForeignKeyEnforced(database = db) {
  const target = database || db;
  if (!target) return false;
  const rows = queryRows(target, "PRAGMA foreign_keys;");
  return Number(rows[0]?.foreign_keys ?? Object.values(rows[0] || {})[0] ?? 0) === 1;
}

const DEFAULT_UNITS = [
  "Pcs",
  "Nos",
  "Box",
  "Pack",
  "Set",
  "Pair",
  "Kg",
  "Gram",
  "Litre",
  "ML",
  "Meter",
  "Sq Ft",
  "Bundle",
  "Roll",
  "Hr",
  "Day",
  "Month",
  "Service",
];

const STANDARD_UNIT_METADATA = {
  Pcs: { short_name: "pcs", code: "PCS", allows_decimal: 0, description: "Pieces" },
  Nos: { short_name: "nos", code: "NOS", allows_decimal: 0, description: "Numbers" },
  Box: { short_name: "box", code: "BOX", allows_decimal: 0, description: "Boxes" },
  Pack: { short_name: "pack", code: "PAC", allows_decimal: 0, description: "Packs" },
  Set: { short_name: "set", code: "SET", allows_decimal: 0, description: "Sets" },
  Pair: { short_name: "pair", code: "PRS", allows_decimal: 0, description: "Pairs" },
  Kg: { short_name: "kg", code: "KGS", allows_decimal: 1, description: "Kilograms" },
  Gram: { short_name: "g", code: "GRM", allows_decimal: 1, description: "Grams" },
  Litre: { short_name: "ltr", code: "LTR", allows_decimal: 1, description: "Litres" },
  ML: { short_name: "ml", code: "MLT", allows_decimal: 1, description: "Millilitres" },
  Meter: { short_name: "m", code: "MTR", allows_decimal: 1, description: "Meters" },
  "Sq Ft": { short_name: "sq ft", code: "SQF", allows_decimal: 1, description: "Square Feet" },
  Bundle: { short_name: "bdl", code: "BDL", allows_decimal: 0, description: "Bundles" },
  Roll: { short_name: "roll", code: "ROL", allows_decimal: 0, description: "Rolls" },
  Hr: { short_name: "hr", code: "HRS", allows_decimal: 1, description: "Hours (Service/Labor)" },
  Day: { short_name: "day", code: "DAY", allows_decimal: 1, description: "Days" },
  Month: { short_name: "mo", code: "MON", allows_decimal: 0, description: "Months" },
  Service: { short_name: "srv", code: "OTH", allows_decimal: 0, description: "Other Services" },
};

const DEFAULT_ITEM_CATEGORIES = [
  "Electronics",
  "Computer Accessories",
  "Mobile Accessories",
  "Stationery",
  "Grocery",
  "Food & Beverage",
  "Apparel",
  "Hardware",
  "Electrical",
  "Plumbing",
  "Furniture",
  "Packaging",
  "Service",
  "Labour",
  "Repairs & Maintenance",
  "Rent",
  "Transport",
  "Other",
];

const STANDARD_CATEGORY_METADATA = {
  Electronics: { code: "ELEC", description: "Electronic devices & gadgets" },
  "Computer Accessories": { code: "COMP", description: "Peripherals, storage & PC accessories" },
  "Mobile Accessories": { code: "MOBA", description: "Cases, chargers, earphones & mobile gear" },
  Stationery: { code: "STAT", description: "Office stationery, books & papers" },
  Grocery: { code: "GROC", description: "Daily provisions & packaged food" },
  "Food & Beverage": { code: "FNB", description: "Food items, snacks & drinks" },
  Apparel: { code: "APPR", description: "Clothing, garments & fashion items" },
  Hardware: { code: "HDW", description: "Tools, fasteners & general hardware" },
  Electrical: { code: "ELC", description: "Wiring, switches, lights & panels" },
  Plumbing: { code: "PLUM", description: "Pipes, valves, taps & plumbing fixtures" },
  Furniture: { code: "FURN", description: "Desks, chairs & office/home furniture" },
  Packaging: { code: "PACK", description: "Boxes, tape, wraps & packing materials" },
  Service: { code: "SERV", description: "Professional, consulting & digital services" },
  Labour: { code: "LABR", description: "Installation, manual & technician labour" },
  "Repairs & Maintenance": { code: "REP", description: "Equipment servicing & maintenance" },
  Rent: { code: "RENT", description: "Space, machinery or vehicle rental" },
  Transport: { code: "TRN", description: "Freight, delivery & courier transport" },
  Other: { code: "OTHR", description: "Miscellaneous unclassified items" },
};

function getMigrations(additionalMigrations = []) {
  return [
    { version: 1, name: "initial_schema_metadata", up: migrate },
    { version: 2, name: "party_settings_and_document_sequences", up: migrateDataIntegrityFoundation },
    { version: 3, name: "local_sync_foundation", up: migrateLocalSyncFoundation },
    { version: 4, name: "gst_tax_entries_and_double_entry", up: migrateGstTaxEntriesAndDoubleEntry },
    { version: 5, name: "audit_trail_and_credit_tax_entries", up: migrateAuditTrailAndCreditTaxEntries },
    { version: 6, name: "payments_nullable_and_journal_unification", up: migratePaymentsNullableAndJournalUnification },
    { version: 7, name: "operational_document_type", up: () => addColumnIfMissing("estimates", "document_type", "TEXT NOT NULL DEFAULT 'estimate'") },
    { version: 8, name: "units_and_categories_upgrade", up: migrateUnitsAndCategoriesUpgrade },
    { version: 9, name: "gst_compliance_and_journal_tables", up: migrateGstComplianceAndJournalTables },
    ...(additionalMigrations || []),
  ];
}

async function initDatabase(userDataPath, options = {}) {
  SQL = await initSqlJs();
  dbPath = path.join(userDataPath, "gi-billing.sqlite");
  const databaseExists = fs.existsSync(dbPath);

  if (databaseExists) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }

  enforceForeignKeys(db);

  const migrations = getMigrations(options.additionalMigrations);

  try {
    lastMigrationResult = runMigrations({
      db,
      migrations,
      databaseExists,
      createBackup: () => createPreMigrationBackup(userDataPath),
      captureSnapshot: captureBusinessSnapshot,
      validateDatabase,
      logger: options.migrationLogger,
    });
    enforceForeignKeys(db);
    seedDefaults();
    ensureDebitNoteSchema();
    ensureLocalSyncIdentity();
    ensureUsersSchema();
    cleanupOrphanExpenseItems();
    run("UPDATE sync_outbox SET status = 'retry', next_attempt_at = NULL, last_error_code = 'INTERRUPTED' WHERE status = 'uploading'");
    persist();
    return getState();
  } catch (error) {
    db = null;
    if (error instanceof MigrationError) throw error;
    throw new MigrationError("DATABASE_UNREADABLE", "The database could not be initialized safely.", {}, error);
  }
}

function migrateLocalSyncFoundation() {
  db.run(`
    CREATE TABLE IF NOT EXISTS sync_devices (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      installation_id TEXT NOT NULL UNIQUE,
      registered_at TEXT,
      last_sync_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_outbox (
      id TEXT PRIMARY KEY,
      company_id INTEGER NOT NULL,
      device_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      base_version INTEGER,
      payload_json TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK(status IN ('pending','uploading','acknowledged','retry','conflict','rejected')),
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT,
      created_at TEXT NOT NULL,
      acknowledged_at TEXT,
      last_error_code TEXT,
      FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY(device_id) REFERENCES sync_devices(id) ON DELETE RESTRICT
    );
    CREATE TABLE IF NOT EXISTS sync_cursors (
      company_id INTEGER PRIMARY KEY,
      pull_cursor TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS sync_inbox (
      event_id TEXT PRIMARY KEY,
      company_id INTEGER NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      server_version INTEGER NOT NULL,
      applied_at TEXT NOT NULL,
      FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS sync_conflicts (
      id TEXT PRIMARY KEY,
      company_id INTEGER NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      local_version INTEGER,
      server_version INTEGER,
      local_payload_json TEXT,
      server_payload_json TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      resolution TEXT,
      FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sync_outbox_pending ON sync_outbox(status, next_attempt_at, created_at);
    CREATE INDEX IF NOT EXISTS idx_sync_outbox_company ON sync_outbox(company_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_sync_conflicts_company_status ON sync_conflicts(company_id, status, created_at);
  `);
  ["parties", "items", "units", "item_categories"].forEach((table) => {
    addColumnIfMissing(table, "sync_id", "TEXT");
    addColumnIfMissing(table, "sync_version", "INTEGER NOT NULL DEFAULT 1");
    addColumnIfMissing(table, "origin_device_id", "TEXT");
    addColumnIfMissing(table, "sync_updated_at", "TEXT");
    addColumnIfMissing(table, "deleted_at", "TEXT");
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS uq_${table}_company_sync_id ON ${table}(company_id, sync_id)`);
  });
}

function ensureLocalSyncIdentity() {
  if (!tableExists(db, "sync_devices")) return;
  let device = one("SELECT id FROM sync_devices ORDER BY created_at LIMIT 1");
  if (!device) {
    const id = randomUUID();
    run(
      "INSERT INTO sync_devices (id, display_name, installation_id, created_at) VALUES (?, ?, ?, ?)",
      [id, "This Device", randomUUID(), new Date().toISOString()],
    );
    device = { id };
  }
  const now = new Date().toISOString();
  ["parties", "items", "units", "item_categories"].forEach((table) => {
    all(`SELECT id FROM ${table} WHERE sync_id IS NULL OR sync_id = ''`).forEach((row) => {
      run(`UPDATE ${table} SET sync_id = ?, origin_device_id = COALESCE(origin_device_id, ?), sync_updated_at = COALESCE(sync_updated_at, ?) WHERE id = ?`,
        [randomUUID(), device.id, now, row.id]);
    });
  });
}

function migrateGstTaxEntriesAndDoubleEntry() {
  db.run(`
    CREATE TABLE IF NOT EXISTS tax_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      document_no TEXT NOT NULL,
      document_date TEXT NOT NULL,
      party_id INTEGER,
      party_name TEXT,
      party_gstin TEXT,
      place_of_supply TEXT,
      supply_type TEXT NOT NULL DEFAULT 'b2c',
      hsn_sac TEXT,
      tax_rate REAL NOT NULL DEFAULT 0,
      taxable_value REAL NOT NULL DEFAULT 0,
      cgst REAL NOT NULL DEFAULT 0,
      sgst REAL NOT NULL DEFAULT 0,
      igst REAL NOT NULL DEFAULT 0,
      cess REAL NOT NULL DEFAULT 0,
      is_reverse_charge INTEGER NOT NULL DEFAULT 0,
      is_cancelled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_tax_entries_company_date ON tax_entries(company_id, document_date);
    CREATE INDEX IF NOT EXISTS idx_tax_entries_source ON tax_entries(company_id, source_type, source_id);
  `);

  if (tableExists(db, "invoices") && tableExists(db, "invoice_items")) {
    const existingInvoices = queryRows(db, `
      SELECT id, company_id, type, invoice_no, invoice_date, party_id, party,
             party_gstin, place_of_supply, supply_type, status, created_at
      FROM invoices
    `);

    for (const inv of existingInvoices) {
      const items = queryRows(db, `
        SELECT item_name, hsn_sac, tax_rate, taxable_value, cgst_amount, sgst_amount, igst_amount, cess_amount
        FROM invoice_items
        WHERE invoice_id = ?
      `, [inv.id]);

      const isCancelled = String(inv.status || "").toLowerCase() === "cancelled" ? 1 : 0;

      for (const line of items) {
        db.run(`
          INSERT INTO tax_entries
            (company_id, source_type, source_id, document_no, document_date, party_id,
             party_name, party_gstin, place_of_supply, supply_type, hsn_sac, tax_rate,
             taxable_value, cgst, sgst, igst, cess, is_reverse_charge, is_cancelled, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
        `, [
          inv.company_id,
          inv.type,
          inv.id,
          inv.invoice_no,
          inv.invoice_date,
          inv.party_id,
          inv.party,
          inv.party_gstin,
          inv.place_of_supply,
          inv.supply_type || 'b2c',
          line.hsn_sac || '',
          Number(line.tax_rate || 0),
          Number(line.taxable_value || 0),
          Number(line.cgst_amount || 0),
          Number(line.sgst_amount || 0),
          Number(line.igst_amount || 0),
          Number(line.cess_amount || 0),
          isCancelled,
          inv.created_at || new Date().toISOString()
        ]);
      }
    }
  }
}

function migrateAuditTrailAndCreditTaxEntries() {
  db.run(`
    CREATE TABLE IF NOT EXISTS audit_trail (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      document_no TEXT,
      details_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_audit_trail_company_date ON audit_trail(company_id, created_at);
  `);

  if (tableExists(db, "credit_notes") && tableExists(db, "credit_note_items")) {
    const notes = queryRows(db, `
      SELECT id, company_id, credit_no, credit_date, party_id, party,
             party_gstin, place_of_supply, supply_type, status, created_at
      FROM credit_notes
    `);

    for (const cn of notes) {
      const items = queryRows(db, `
        SELECT item_name, hsn_sac, tax_rate, taxable_value, cgst_amount, sgst_amount, igst_amount, cess_amount
        FROM credit_note_items
        WHERE credit_note_id = ?
      `, [cn.id]);

      const isCancelled = String(cn.status || "").toLowerCase() === "cancelled" ? 1 : 0;

      for (const line of items) {
        db.run(`
          INSERT INTO tax_entries
            (company_id, source_type, source_id, document_no, document_date, party_id,
             party_name, party_gstin, place_of_supply, supply_type, hsn_sac, tax_rate,
             taxable_value, cgst, sgst, igst, cess, is_reverse_charge, is_cancelled, created_at)
          VALUES (?, 'credit_note', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
        `, [
          cn.company_id,
          cn.id,
          cn.credit_no,
          cn.credit_date,
          cn.party_id,
          cn.party,
          cn.party_gstin,
          cn.place_of_supply,
          cn.supply_type || 'b2c',
          line.hsn_sac || '',
          Number(line.tax_rate || 0),
          Number(line.taxable_value || 0),
          Number(line.cgst_amount || 0),
          Number(line.sgst_amount || 0),
          Number(line.igst_amount || 0),
          Number(line.cess_amount || 0),
          isCancelled,
          cn.created_at || new Date().toISOString()
        ]);
      }
    }
  }
}

function migratePaymentsNullableAndJournalUnification(targetDb = db) {
  if (tableExists(targetDb, "transactions")) {
    const txSql = queryRows(targetDb, "SELECT sql FROM sqlite_master WHERE type='table' AND name='transactions'")[0]?.sql || "";
    if (!txSql.includes("credit_note") || !txSql.includes("debit_note")) {
      const txCountBefore = Number(queryRows(targetDb, "SELECT COUNT(*) AS c FROM transactions")[0]?.c || 0);
      targetDb.run(`
        CREATE TABLE transactions_v6 (
          id TEXT PRIMARY KEY,
          company_id INTEGER NOT NULL,
          invoice_id TEXT,
          invoice_no TEXT,
          type TEXT NOT NULL CHECK(type IN ('sale', 'purchase', 'expense', 'payment_in', 'payment_out', 'credit_note', 'debit_note')),
          party TEXT NOT NULL,
          party_id INTEGER,
          item TEXT,
          amount REAL NOT NULL DEFAULT 0,
          payment_type TEXT NOT NULL DEFAULT 'cash',
          status TEXT NOT NULL DEFAULT 'paid',
          notes TEXT,
          meta_json TEXT,
          transaction_date TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT,
          FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
          FOREIGN KEY(party_id) REFERENCES parties(id) ON DELETE SET NULL
        );
      `);
      const existingTxCols = new Set(queryRows(targetDb, "PRAGMA table_info(transactions)").map((c) => c.name));
      const hasPartyId = existingTxCols.has("party_id");
      if (hasPartyId) {
        targetDb.run(`
          INSERT INTO transactions_v6 (id, company_id, invoice_id, invoice_no, type, party, party_id, item, amount, payment_type, status, notes, meta_json, transaction_date, created_at, updated_at)
          SELECT id, company_id, invoice_id, invoice_no, type, party, party_id, item, amount, payment_type, status, notes, meta_json, transaction_date, created_at, updated_at FROM transactions;
        `);
      } else {
        targetDb.run(`
          INSERT INTO transactions_v6 (id, company_id, invoice_id, invoice_no, type, party, party_id, item, amount, payment_type, status, notes, meta_json, transaction_date, created_at, updated_at)
          SELECT id, company_id, invoice_id, invoice_no, type, party, NULL, item, amount, payment_type, status, notes, meta_json, transaction_date, created_at, updated_at FROM transactions;
        `);
      }
      const txCountAfter = Number(queryRows(targetDb, "SELECT COUNT(*) AS c FROM transactions_v6")[0]?.c || 0);
      if (txCountAfter !== txCountBefore) {
        throw new MigrationError("DATA_PRESERVATION_FAILED", `Transactions table migration row mismatch: expected ${txCountBefore}, got ${txCountAfter}`);
      }
      targetDb.run("DROP TABLE transactions;");
      targetDb.run("ALTER TABLE transactions_v6 RENAME TO transactions;");
      targetDb.run("CREATE INDEX IF NOT EXISTS idx_transactions_company_date ON transactions(company_id, transaction_date);");
      targetDb.run("CREATE INDEX IF NOT EXISTS idx_transactions_company_type ON transactions(company_id, type);");
      targetDb.run("CREATE INDEX IF NOT EXISTS idx_transactions_company_party_id ON transactions(company_id, party_id);");
    }
  }

  if (tableExists(targetDb, "credit_notes") && tableExists(targetDb, "transactions")) {
    const missingCNs = queryRows(targetDb, `
      SELECT cn.id, cn.company_id, cn.original_invoice_id, cn.credit_no, cn.party, cn.party_id,
             cn.total, cn.payment_method, cn.status, cn.notes, cn.meta_json, cn.credit_date, cn.created_at
      FROM credit_notes cn
      WHERE NOT EXISTS (SELECT 1 FROM transactions t WHERE t.company_id = cn.company_id AND t.id = cn.id)
    `);
    for (const cn of missingCNs) {
      targetDb.run(`
        INSERT INTO transactions
          (id, company_id, invoice_id, invoice_no, type, party, party_id, item, amount,
           payment_type, status, notes, meta_json, transaction_date, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'credit_note', ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        cn.id, cn.company_id, cn.original_invoice_id || null, cn.credit_no, cn.party, cn.party_id,
        Number(cn.total || 0), cn.payment_method || 'Adjustment', cn.status || 'open', cn.notes || '',
        cn.meta_json || '{}', cn.credit_date || cn.created_at, cn.created_at, cn.created_at
      ]);
    }
  }

  if (tableExists(targetDb, "debit_notes") && tableExists(targetDb, "transactions")) {
    const missingDNs = queryRows(targetDb, `
      SELECT dn.id, dn.company_id, dn.original_purchase_id, dn.debit_no, dn.party, dn.party_id,
             dn.total, dn.payment_method, dn.status, dn.notes, dn.meta_json, dn.debit_date, dn.created_at
      FROM debit_notes dn
      WHERE NOT EXISTS (SELECT 1 FROM transactions t WHERE t.company_id = dn.company_id AND t.id = dn.id)
    `);
    for (const dn of missingDNs) {
      targetDb.run(`
        INSERT INTO transactions
          (id, company_id, invoice_id, invoice_no, type, party, party_id, item, amount,
           payment_type, status, notes, meta_json, transaction_date, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'debit_note', ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        dn.id, dn.company_id, dn.original_purchase_id || null, dn.debit_no, dn.party, dn.party_id,
        Number(dn.total || 0), dn.payment_method || 'Adjustment', dn.status || 'open', dn.notes || '',
        dn.meta_json || '{}', dn.debit_date || dn.created_at, dn.created_at, dn.created_at
      ]);
    }
  }

  if (tableExists(targetDb, "payments")) {
    const countBefore = Number(queryRows(targetDb, "SELECT COUNT(*) AS c FROM payments")[0]?.c || 0);

    targetDb.run(`
      CREATE TABLE payments_v6 (
        id TEXT PRIMARY KEY,
        company_id INTEGER NOT NULL,
        invoice_id TEXT,
        transaction_id TEXT,
        type TEXT NOT NULL CHECK(type IN ('payment_in', 'payment_out')),
        party TEXT NOT NULL,
        party_id INTEGER,
        amount REAL NOT NULL DEFAULT 0,
        method TEXT NOT NULL DEFAULT 'Cash',
        payment_date TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
        FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
        FOREIGN KEY(transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
        FOREIGN KEY(party_id) REFERENCES parties(id) ON DELETE SET NULL
      );
    `);

    const existingCols = new Set(queryRows(targetDb, "PRAGMA table_info(payments)").map((c) => c.name));
    const hasPartyId = existingCols.has("party_id");

    if (hasPartyId) {
      targetDb.run(`
        INSERT INTO payments_v6 (id, company_id, invoice_id, transaction_id, type, party, party_id, amount, method, payment_date, notes, created_at)
        SELECT id, company_id, invoice_id, transaction_id, type, party, party_id, amount, method, payment_date, notes, created_at FROM payments
      `);
    } else {
      targetDb.run(`
        INSERT INTO payments_v6 (id, company_id, invoice_id, transaction_id, type, party, party_id, amount, method, payment_date, notes, created_at)
        SELECT id, company_id, invoice_id, transaction_id, type, party, NULL, amount, method, payment_date, notes, created_at FROM payments
      `);
    }

    const countAfter = Number(queryRows(targetDb, "SELECT COUNT(*) AS c FROM payments_v6")[0]?.c || 0);
    if (countAfter !== countBefore) {
      throw new MigrationError("DATA_PRESERVATION_FAILED", `Payments table migration row mismatch: expected ${countBefore}, got ${countAfter}`);
    }

    targetDb.run("DROP TABLE payments;");
    targetDb.run("ALTER TABLE payments_v6 RENAME TO payments;");
    targetDb.run("CREATE INDEX IF NOT EXISTS idx_payments_company_date ON payments(company_id, payment_date);");
    targetDb.run("CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);");
    targetDb.run("CREATE INDEX IF NOT EXISTS idx_payments_company_party_id ON payments(company_id, party_id);");
    targetDb.run(`
      CREATE TRIGGER IF NOT EXISTS trg_payments_party_id_insert AFTER INSERT ON payments
      WHEN NEW.party_id IS NULL BEGIN
        UPDATE payments SET party_id = (SELECT id FROM parties WHERE company_id = NEW.company_id AND name = NEW.party)
        WHERE id = NEW.id;
      END;
    `);
  }
}

function recordAuditLog(companyId, action, entityType, entityId, documentNo = null, details = null) {
  if (!db || !tableExists(db, "audit_trail")) return;
  try {
    const targetCompanyId = companyId || getCurrentCompany()?.id;
    if (!targetCompanyId) return;
    run(
      `INSERT INTO audit_trail (company_id, action, entity_type, entity_id, document_no, details_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        targetCompanyId,
        String(action || "").trim(),
        String(entityType || "").trim(),
        String(entityId || "").trim(),
        documentNo ? String(documentNo) : null,
        details ? JSON.stringify(details) : null,
        new Date().toISOString(),
      ]
    );
  } catch {
    // Audit logging is non-fatal
  }
}

function migrateDataIntegrityFoundation() {
  ["transactions", "invoices", "payments", "estimates", "credit_notes", "debit_notes"].forEach((table) => {
    addColumnIfMissing(table, "party_id", "INTEGER REFERENCES parties(id) ON DELETE SET NULL");
    run(`UPDATE ${table} SET party_id = (
      SELECT MIN(p.id) FROM parties p
      WHERE p.company_id = ${table}.company_id AND p.name = ${table}.party
      HAVING COUNT(*) = 1
    ) WHERE party_id IS NULL`);
  });
  addColumnIfMissing("estimates", "document_type", "TEXT NOT NULL DEFAULT 'estimate'");

  db.run(`
    CREATE TABLE IF NOT EXISTS company_settings (
      company_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY(company_id, key),
      FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
    );
    INSERT OR IGNORE INTO company_settings (company_id, key, value)
      SELECT c.id, s.key, s.value FROM companies c CROSS JOIN app_settings s;

    CREATE TABLE IF NOT EXISTS document_sequences (
      company_id INTEGER NOT NULL,
      document_type TEXT NOT NULL,
      financial_year TEXT NOT NULL,
      prefix TEXT NOT NULL,
      next_number INTEGER NOT NULL CHECK(next_number > 0),
      updated_at TEXT NOT NULL,
      PRIMARY KEY(company_id, document_type, financial_year, prefix),
      FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_company_party_id ON transactions(company_id, party_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_company_party_id ON invoices(company_id, party_id);
    CREATE INDEX IF NOT EXISTS idx_payments_company_party_id ON payments(company_id, party_id);
    CREATE INDEX IF NOT EXISTS idx_estimates_company_party_id ON estimates(company_id, party_id);
    CREATE INDEX IF NOT EXISTS idx_credit_notes_company_party_id ON credit_notes(company_id, party_id);
    CREATE INDEX IF NOT EXISTS idx_debit_notes_company_party_id ON debit_notes(company_id, party_id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_company_type_number ON invoices(company_id, type, invoice_no);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_estimates_company_number ON estimates(company_id, quote_no);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_notes_company_number ON credit_notes(company_id, credit_no);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_debit_notes_company_number ON debit_notes(company_id, debit_no);

    CREATE TRIGGER IF NOT EXISTS trg_transactions_party_id_insert AFTER INSERT ON transactions
    WHEN NEW.party_id IS NULL BEGIN
      UPDATE transactions SET party_id = (SELECT id FROM parties WHERE company_id = NEW.company_id AND name = NEW.party)
      WHERE id = NEW.id;
    END;
    CREATE TRIGGER IF NOT EXISTS trg_transactions_party_id_update AFTER UPDATE OF party ON transactions BEGIN
      UPDATE transactions SET party_id = (SELECT id FROM parties WHERE company_id = NEW.company_id AND name = NEW.party)
      WHERE id = NEW.id;
    END;
    CREATE TRIGGER IF NOT EXISTS trg_invoices_party_id_insert AFTER INSERT ON invoices
    WHEN NEW.party_id IS NULL BEGIN
      UPDATE invoices SET party_id = (SELECT id FROM parties WHERE company_id = NEW.company_id AND name = NEW.party)
      WHERE id = NEW.id;
    END;
    CREATE TRIGGER IF NOT EXISTS trg_invoices_party_id_update AFTER UPDATE OF party ON invoices BEGIN
      UPDATE invoices SET party_id = (SELECT id FROM parties WHERE company_id = NEW.company_id AND name = NEW.party)
      WHERE id = NEW.id;
    END;
    CREATE TRIGGER IF NOT EXISTS trg_payments_party_id_insert AFTER INSERT ON payments
    WHEN NEW.party_id IS NULL BEGIN
      UPDATE payments SET party_id = (SELECT id FROM parties WHERE company_id = NEW.company_id AND name = NEW.party)
      WHERE id = NEW.id;
    END;
    CREATE TRIGGER IF NOT EXISTS trg_estimates_party_id_insert AFTER INSERT ON estimates
    WHEN NEW.party_id IS NULL BEGIN
      UPDATE estimates SET party_id = (SELECT id FROM parties WHERE company_id = NEW.company_id AND name = NEW.party)
      WHERE id = NEW.id;
    END;
    CREATE TRIGGER IF NOT EXISTS trg_estimates_party_id_update AFTER UPDATE OF party ON estimates BEGIN
      UPDATE estimates SET party_id = (SELECT id FROM parties WHERE company_id = NEW.company_id AND name = NEW.party)
      WHERE id = NEW.id;
    END;
    CREATE TRIGGER IF NOT EXISTS trg_credit_notes_party_id_insert AFTER INSERT ON credit_notes
    WHEN NEW.party_id IS NULL BEGIN
      UPDATE credit_notes SET party_id = (SELECT id FROM parties WHERE company_id = NEW.company_id AND name = NEW.party)
      WHERE id = NEW.id;
    END;
    CREATE TRIGGER IF NOT EXISTS trg_credit_notes_party_id_update AFTER UPDATE OF party ON credit_notes BEGIN
      UPDATE credit_notes SET party_id = (SELECT id FROM parties WHERE company_id = NEW.company_id AND name = NEW.party)
      WHERE id = NEW.id;
    END;
    CREATE TRIGGER IF NOT EXISTS trg_debit_notes_party_id_insert AFTER INSERT ON debit_notes
    WHEN NEW.party_id IS NULL BEGIN
      UPDATE debit_notes SET party_id = (SELECT id FROM parties WHERE company_id = NEW.company_id AND name = NEW.party)
      WHERE id = NEW.id;
    END;
    CREATE TRIGGER IF NOT EXISTS trg_debit_notes_party_id_update AFTER UPDATE OF party ON debit_notes BEGIN
      UPDATE debit_notes SET party_id = (SELECT id FROM parties WHERE company_id = NEW.company_id AND name = NEW.party)
      WHERE id = NEW.id;
    END;
  `);
}

function migrateUnitsAndCategoriesUpgrade() {
  if (!db) return;

  try { db.run(`ALTER TABLE units ADD COLUMN short_name TEXT;`); } catch (_) {}
  try { db.run(`ALTER TABLE units ADD COLUMN code TEXT;`); } catch (_) {}
  try { db.run(`ALTER TABLE units ADD COLUMN description TEXT;`); } catch (_) {}
  try { db.run(`ALTER TABLE units ADD COLUMN allows_decimal_quantity INTEGER NOT NULL DEFAULT 0;`); } catch (_) {}
  try { db.run(`ALTER TABLE units ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;`); } catch (_) {}
  try { db.run(`ALTER TABLE units ADD COLUMN updated_at TEXT;`); } catch (_) {}

  try { db.run(`ALTER TABLE item_categories ADD COLUMN code TEXT;`); } catch (_) {}
  try { db.run(`ALTER TABLE item_categories ADD COLUMN description TEXT;`); } catch (_) {}
  try { db.run(`ALTER TABLE item_categories ADD COLUMN parent_category_id INTEGER;`); } catch (_) {}
  try { db.run(`ALTER TABLE item_categories ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;`); } catch (_) {}
  try { db.run(`ALTER TABLE item_categories ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;`); } catch (_) {}
  try { db.run(`ALTER TABLE item_categories ADD COLUMN updated_at TEXT;`); } catch (_) {}

  try { db.run(`ALTER TABLE items ADD COLUMN category_id INTEGER;`); } catch (_) {}
  try { db.run(`ALTER TABLE items ADD COLUMN unit_id INTEGER;`); } catch (_) {}

  const allCompanies = all("SELECT id FROM companies");
  for (const company of allCompanies) {
    const cid = company.id;

    const existingUnits = all("SELECT id, name FROM units WHERE company_id = ?", [cid]);
    const unitMap = {};
    for (const u of existingUnits) {
      unitMap[u.name.toLowerCase().trim()] = u.id;
    }

    const existingCategories = all("SELECT id, name FROM item_categories WHERE company_id = ?", [cid]);
    const catMap = {};
    for (const c of existingCategories) {
      catMap[c.name.toLowerCase().trim()] = c.id;
    }

    const items = all("SELECT id, category, unit FROM items WHERE company_id = ?", [cid]);
    for (const item of items) {
      let unitId = null;
      if (item.unit && item.unit.trim()) {
        const key = item.unit.trim().toLowerCase();
        if (!unitMap[key]) {
          run("INSERT OR IGNORE INTO units (company_id, name, created_at) VALUES (?, ?, ?)", [cid, item.unit.trim(), new Date().toISOString()]);
          const created = one("SELECT id FROM units WHERE company_id = ? AND LOWER(name) = LOWER(?)", [cid, item.unit.trim()]);
          if (created) {
            unitMap[key] = created.id;
          }
        }
        unitId = unitMap[key] || null;
      }

      let categoryId = null;
      if (item.category && item.category.trim()) {
        const key = item.category.trim().toLowerCase();
        if (!catMap[key]) {
          run("INSERT OR IGNORE INTO item_categories (company_id, name, created_at) VALUES (?, ?, ?)", [cid, item.category.trim(), new Date().toISOString()]);
          const created = one("SELECT id FROM item_categories WHERE company_id = ? AND LOWER(name) = LOWER(?)", [cid, item.category.trim()]);
          if (created) {
            catMap[key] = created.id;
          }
        }
        categoryId = catMap[key] || null;
      }

      if (unitId || categoryId) {
        const sets = [];
        const params = [];
        if (unitId) { sets.push("unit_id = ?"); params.push(unitId); }
        if (categoryId) { sets.push("category_id = ?"); params.push(categoryId); }
        params.push(item.id);
        run(`UPDATE items SET ${sets.join(", ")} WHERE id = ?`, params);
      }
    }
  }

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_units_company_active ON units(company_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_item_categories_company_active ON item_categories(company_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_item_categories_parent ON item_categories(parent_category_id);
    CREATE INDEX IF NOT EXISTS idx_items_category_id ON items(category_id);
    CREATE INDEX IF NOT EXISTS idx_items_unit_id ON items(unit_id);
  `);
}

function migrate() {
  db.run(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      email TEXT,
      country TEXT,
      is_current INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS parties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'both',
      phone TEXT,
      email TEXT,
      contact_person TEXT,
      tax_type TEXT NOT NULL DEFAULT 'unregistered',
      gstin TEXT,
      legal_name TEXT,
      state TEXT,
      pan TEXT,
      billing_address TEXT,
      shipping_address TEXT,
      opening_balance REAL NOT NULL DEFAULT 0,
      opening_balance_type TEXT NOT NULL DEFAULT 'receivable',
      credit_limit REAL NOT NULL DEFAULT 0,
      payment_terms TEXT,
      due_days INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(company_id, name),
      FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      item_type TEXT NOT NULL DEFAULT 'product',
      sku TEXT,
      category TEXT,
      unit TEXT,
      hsn_sac TEXT,
      sale_price REAL NOT NULL DEFAULT 0,
      sale_tax_type TEXT NOT NULL DEFAULT 'without_tax',
      purchase_price REAL NOT NULL DEFAULT 0,
      purchase_tax_type TEXT NOT NULL DEFAULT 'without_tax',
      tax_rate REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      opening_stock REAL NOT NULL DEFAULT 0,
      opening_stock_date TEXT,
      opening_stock_value REAL NOT NULL DEFAULT 0,
      storage_location TEXT,
      low_stock_alert REAL NOT NULL DEFAULT 0,
      description TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(company_id, name),
      FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(company_id, name),
      FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS item_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(company_id, name),
      FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bank_accounts (
      id TEXT PRIMARY KEY,
      company_id INTEGER NOT NULL,
      display_name TEXT NOT NULL,
      bank_name TEXT,
      account_no TEXT,
      ifsc TEXT,
      upi_id TEXT,
      opening_balance REAL NOT NULL DEFAULT 0,
      current_balance REAL NOT NULL DEFAULT 0,
      as_of_date TEXT,
      print_upi_qr INTEGER NOT NULL DEFAULT 0,
      print_bank_details INTEGER NOT NULL DEFAULT 1,
      is_default INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      company_id INTEGER NOT NULL,
      invoice_id TEXT,
      invoice_no TEXT,
      type TEXT NOT NULL CHECK(type IN ('sale', 'purchase', 'expense', 'payment_in', 'payment_out', 'credit_note', 'debit_note')),
      party TEXT NOT NULL,
      item TEXT,
      amount REAL NOT NULL DEFAULT 0,
      payment_type TEXT NOT NULL DEFAULT 'cash',
      status TEXT NOT NULL DEFAULT 'paid',
      notes TEXT,
      meta_json TEXT,
      transaction_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      company_id INTEGER NOT NULL,
      transaction_id TEXT,
      invoice_no TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('sale', 'purchase')),
      party TEXT NOT NULL,
      phone TEXT,
      billing_address TEXT,
      invoice_date TEXT NOT NULL,
      due_date TEXT,
      payment_terms TEXT,
      payment_type TEXT NOT NULL DEFAULT 'cash',
      supply_type TEXT NOT NULL DEFAULT 'b2c',
      place_of_supply TEXT,
      party_gstin TEXT,
      party_tax_type TEXT NOT NULL DEFAULT 'unregistered',
      subtotal REAL NOT NULL DEFAULT 0,
      discount_total REAL NOT NULL DEFAULT 0,
      tax_total REAL NOT NULL DEFAULT 0,
      cgst_total REAL NOT NULL DEFAULT 0,
      sgst_total REAL NOT NULL DEFAULT 0,
      igst_total REAL NOT NULL DEFAULT 0,
      cess_total REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      received REAL NOT NULL DEFAULT 0,
      balance REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'unpaid',
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY(transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id TEXT NOT NULL,
      item_id INTEGER,
      line_no INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      description TEXT,
      quantity REAL NOT NULL DEFAULT 0,
      unit TEXT,
      price REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      hsn_sac TEXT,
      taxable_value REAL NOT NULL DEFAULT 0,
      tax_rate REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      cgst_amount REAL NOT NULL DEFAULT 0,
      sgst_amount REAL NOT NULL DEFAULT 0,
      igst_amount REAL NOT NULL DEFAULT 0,
      cess_amount REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL DEFAULT 0,
      FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
      FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS estimates (
      id TEXT PRIMARY KEY,
      company_id INTEGER NOT NULL,
      quote_no TEXT NOT NULL,
      party TEXT NOT NULL,
      phone TEXT,
      billing_address TEXT,
      quote_date TEXT NOT NULL,
      valid_until TEXT,
      payment_terms TEXT,
      supply_type TEXT NOT NULL DEFAULT 'b2c',
      place_of_supply TEXT,
      party_gstin TEXT,
      party_tax_type TEXT NOT NULL DEFAULT 'unregistered',
      subtotal REAL NOT NULL DEFAULT 0,
      discount_total REAL NOT NULL DEFAULT 0,
      tax_total REAL NOT NULL DEFAULT 0,
      cgst_total REAL NOT NULL DEFAULT 0,
      sgst_total REAL NOT NULL DEFAULT 0,
      igst_total REAL NOT NULL DEFAULT 0,
      cess_total REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft',
      notes TEXT,
      converted_invoice_id TEXT,
      document_type TEXT NOT NULL DEFAULT 'estimate',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS estimate_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      estimate_id TEXT NOT NULL,
      item_id INTEGER,
      line_no INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      description TEXT,
      quantity REAL NOT NULL DEFAULT 0,
      unit TEXT,
      price REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      hsn_sac TEXT,
      taxable_value REAL NOT NULL DEFAULT 0,
      tax_rate REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      cgst_amount REAL NOT NULL DEFAULT 0,
      sgst_amount REAL NOT NULL DEFAULT 0,
      igst_amount REAL NOT NULL DEFAULT 0,
      cess_amount REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL DEFAULT 0,
      FOREIGN KEY(estimate_id) REFERENCES estimates(id) ON DELETE CASCADE,
      FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS credit_notes (
      id TEXT PRIMARY KEY,
      company_id INTEGER NOT NULL,
      credit_no TEXT NOT NULL,
      original_invoice_id TEXT,
      original_invoice_no TEXT,
      party TEXT NOT NULL,
      phone TEXT,
      billing_address TEXT,
      credit_date TEXT NOT NULL,
      refund_date TEXT,
      payment_terms TEXT,
      payment_method TEXT NOT NULL DEFAULT 'Adjustment',
      supply_type TEXT NOT NULL DEFAULT 'b2c',
      place_of_supply TEXT,
      party_gstin TEXT,
      party_tax_type TEXT NOT NULL DEFAULT 'unregistered',
      subtotal REAL NOT NULL DEFAULT 0,
      discount_total REAL NOT NULL DEFAULT 0,
      tax_total REAL NOT NULL DEFAULT 0,
      cgst_total REAL NOT NULL DEFAULT 0,
      sgst_total REAL NOT NULL DEFAULT 0,
      igst_total REAL NOT NULL DEFAULT 0,
      cess_total REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      adjusted REAL NOT NULL DEFAULT 0,
      balance REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open',
      reason TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY(original_invoice_id) REFERENCES invoices(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS credit_note_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      credit_note_id TEXT NOT NULL,
      item_id INTEGER,
      line_no INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      description TEXT,
      quantity REAL NOT NULL DEFAULT 0,
      unit TEXT,
      price REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      hsn_sac TEXT,
      taxable_value REAL NOT NULL DEFAULT 0,
      tax_rate REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      cgst_amount REAL NOT NULL DEFAULT 0,
      sgst_amount REAL NOT NULL DEFAULT 0,
      igst_amount REAL NOT NULL DEFAULT 0,
      cess_amount REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL DEFAULT 0,
      FOREIGN KEY(credit_note_id) REFERENCES credit_notes(id) ON DELETE CASCADE,
      FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS debit_notes (
      id TEXT PRIMARY KEY,
      company_id INTEGER NOT NULL,
      debit_no TEXT NOT NULL,
      original_purchase_id TEXT,
      original_purchase_no TEXT,
      party TEXT NOT NULL,
      phone TEXT,
      billing_address TEXT,
      debit_date TEXT NOT NULL,
      refund_date TEXT,
      payment_terms TEXT,
      payment_method TEXT NOT NULL DEFAULT 'Adjustment',
      supply_type TEXT NOT NULL DEFAULT 'b2b',
      place_of_supply TEXT,
      party_gstin TEXT,
      party_tax_type TEXT NOT NULL DEFAULT 'unregistered',
      subtotal REAL NOT NULL DEFAULT 0,
      discount_total REAL NOT NULL DEFAULT 0,
      tax_total REAL NOT NULL DEFAULT 0,
      cgst_total REAL NOT NULL DEFAULT 0,
      sgst_total REAL NOT NULL DEFAULT 0,
      igst_total REAL NOT NULL DEFAULT 0,
      cess_total REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      adjusted REAL NOT NULL DEFAULT 0,
      balance REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open',
      reason TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY(original_purchase_id) REFERENCES transactions(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS debit_note_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      debit_note_id TEXT NOT NULL,
      item_id INTEGER,
      line_no INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      description TEXT,
      quantity REAL NOT NULL DEFAULT 0,
      unit TEXT,
      price REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      hsn_sac TEXT,
      taxable_value REAL NOT NULL DEFAULT 0,
      tax_rate REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      cgst_amount REAL NOT NULL DEFAULT 0,
      sgst_amount REAL NOT NULL DEFAULT 0,
      igst_amount REAL NOT NULL DEFAULT 0,
      cess_amount REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL DEFAULT 0,
      FOREIGN KEY(debit_note_id) REFERENCES debit_notes(id) ON DELETE CASCADE,
      FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      company_id INTEGER NOT NULL,
      invoice_id TEXT,
      transaction_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('payment_in', 'payment_out')),
      party TEXT NOT NULL,
      party_id INTEGER,
      amount REAL NOT NULL DEFAULT 0,
      method TEXT NOT NULL DEFAULT 'Cash',
      payment_date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
      FOREIGN KEY(transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
      FOREIGN KEY(party_id) REFERENCES parties(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      company_id INTEGER NOT NULL,
      invoice_id TEXT,
      transaction_id TEXT,
      item_id INTEGER,
      item_name TEXT NOT NULL,
      movement_type TEXT NOT NULL CHECK(movement_type IN ('in', 'out', 'adjustment')),
      quantity REAL NOT NULL DEFAULT 0,
      unit TEXT,
      rate REAL NOT NULL DEFAULT 0,
      movement_date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
      FOREIGN KEY(transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
      FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS ledger_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      transaction_id TEXT NOT NULL,
      account TEXT NOT NULL,
      debit REAL NOT NULL DEFAULT 0,
      credit REAL NOT NULL DEFAULT 0,
      entry_date TEXT NOT NULL,
      narration TEXT,
      FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY(transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
  addColumnIfMissing("transactions", "invoice_no", "TEXT");
  addColumnIfMissing("transactions", "invoice_id", "TEXT");
  addColumnIfMissing("transactions", "payment_type", "TEXT NOT NULL DEFAULT 'cash'");
  addColumnIfMissing("parties", "type", "TEXT NOT NULL DEFAULT 'both'");
  addColumnIfMissing("parties", "phone", "TEXT");
  addColumnIfMissing("parties", "email", "TEXT");
  addColumnIfMissing("parties", "contact_person", "TEXT");
  addColumnIfMissing("parties", "tax_type", "TEXT NOT NULL DEFAULT 'unregistered'");
  addColumnIfMissing("parties", "gstin", "TEXT");
  addColumnIfMissing("parties", "legal_name", "TEXT");
  addColumnIfMissing("parties", "state", "TEXT");
  addColumnIfMissing("parties", "pan", "TEXT");
  addColumnIfMissing("parties", "billing_address", "TEXT");
  addColumnIfMissing("parties", "shipping_address", "TEXT");
  addColumnIfMissing("parties", "opening_balance", "REAL NOT NULL DEFAULT 0");
  addColumnIfMissing("parties", "opening_balance_type", "TEXT NOT NULL DEFAULT 'receivable'");
  addColumnIfMissing("parties", "credit_limit", "REAL NOT NULL DEFAULT 0");
  addColumnIfMissing("parties", "payment_terms", "TEXT");
  addColumnIfMissing("parties", "due_days", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("items", "item_type", "TEXT NOT NULL DEFAULT 'product'");
  addColumnIfMissing("items", "sku", "TEXT");
  addColumnIfMissing("items", "category", "TEXT");
  addColumnIfMissing("items", "unit", "TEXT");
  addColumnIfMissing("items", "hsn_sac", "TEXT");
  addColumnIfMissing("items", "sale_price", "REAL NOT NULL DEFAULT 0");
  addColumnIfMissing("items", "sale_tax_type", "TEXT NOT NULL DEFAULT 'without_tax'");
  addColumnIfMissing("items", "purchase_price", "REAL NOT NULL DEFAULT 0");
  addColumnIfMissing("items", "purchase_tax_type", "TEXT NOT NULL DEFAULT 'without_tax'");
  addColumnIfMissing("items", "tax_rate", "REAL NOT NULL DEFAULT 0");
  addColumnIfMissing("items", "discount", "REAL NOT NULL DEFAULT 0");
  addColumnIfMissing("items", "opening_stock", "REAL NOT NULL DEFAULT 0");
  addColumnIfMissing("items", "opening_stock_date", "TEXT");
  addColumnIfMissing("items", "opening_stock_value", "REAL NOT NULL DEFAULT 0");
  addColumnIfMissing("items", "storage_location", "TEXT");
  addColumnIfMissing("items", "low_stock_alert", "REAL NOT NULL DEFAULT 0");
  addColumnIfMissing("items", "description", "TEXT");
  addColumnIfMissing("invoice_items", "item_id", "INTEGER");
  addColumnIfMissing("invoices", "payment_type", "TEXT NOT NULL DEFAULT 'cash'");
  addColumnIfMissing("invoices", "supply_type", "TEXT NOT NULL DEFAULT 'b2c'");
  addColumnIfMissing("invoices", "place_of_supply", "TEXT");
  addColumnIfMissing("invoices", "party_gstin", "TEXT");
  addColumnIfMissing("invoices", "party_tax_type", "TEXT NOT NULL DEFAULT 'unregistered'");
  addColumnIfMissing("invoices", "cgst_total", "REAL NOT NULL DEFAULT 0");
  addColumnIfMissing("invoices", "sgst_total", "REAL NOT NULL DEFAULT 0");
  addColumnIfMissing("invoices", "igst_total", "REAL NOT NULL DEFAULT 0");
  addColumnIfMissing("invoices", "cess_total", "REAL NOT NULL DEFAULT 0");
  addColumnIfMissing("invoices", "meta_json", "TEXT");
  addColumnIfMissing("estimates", "meta_json", "TEXT");
  addColumnIfMissing("credit_notes", "meta_json", "TEXT");
  addColumnIfMissing("debit_notes", "meta_json", "TEXT");
  addColumnIfMissing("invoice_items", "hsn_sac", "TEXT");
  addColumnIfMissing("invoice_items", "taxable_value", "REAL NOT NULL DEFAULT 0");
  addColumnIfMissing("invoice_items", "cgst_amount", "REAL NOT NULL DEFAULT 0");
  addColumnIfMissing("invoice_items", "sgst_amount", "REAL NOT NULL DEFAULT 0");
  addColumnIfMissing("invoice_items", "igst_amount", "REAL NOT NULL DEFAULT 0");
  addColumnIfMissing("invoice_items", "cess_amount", "REAL NOT NULL DEFAULT 0");
  addColumnIfMissing("stock_movements", "item_id", "INTEGER");
  addColumnIfMissing("stock_movements", "credit_note_id", "TEXT");
  addColumnIfMissing("stock_movements", "debit_note_id", "TEXT");
  addColumnIfMissing("transactions", "meta_json", "TEXT");
  addColumnIfMissing("transactions", "updated_at", "TEXT");
  addColumnIfMissing("bank_accounts", "bank_name", "TEXT");
  addColumnIfMissing("bank_accounts", "account_no", "TEXT");
  addColumnIfMissing("bank_accounts", "ifsc", "TEXT");
  addColumnIfMissing("bank_accounts", "upi_id", "TEXT");
  addColumnIfMissing("bank_accounts", "current_balance", "REAL NOT NULL DEFAULT 0");
  addColumnIfMissing("bank_accounts", "print_upi_qr", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("bank_accounts", "print_bank_details", "INTEGER NOT NULL DEFAULT 1");
  addColumnIfMissing("bank_accounts", "is_default", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("bank_accounts", "notes", "TEXT");
  addColumnIfMissing("bank_accounts", "updated_at", "TEXT");
  addColumnIfMissing("estimates", "converted_invoice_id", "TEXT");
  addColumnIfMissing("estimates", "updated_at", "TEXT");
  run("UPDATE transactions SET updated_at = created_at WHERE updated_at IS NULL OR updated_at = ''");
  run("UPDATE bank_accounts SET updated_at = created_at WHERE updated_at IS NULL OR updated_at = ''");
  run("UPDATE bank_accounts SET current_balance = opening_balance WHERE current_balance IS NULL");
  run("UPDATE estimates SET updated_at = created_at WHERE updated_at IS NULL OR updated_at = ''");
  createIndexes();
}

function createIndexes() {
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_transactions_company_type_date ON transactions(company_id, type, transaction_date);
    CREATE INDEX IF NOT EXISTS idx_transactions_company_party ON transactions(company_id, party);
    CREATE INDEX IF NOT EXISTS idx_invoices_company_type_date ON invoices(company_id, type, invoice_date);
    CREATE INDEX IF NOT EXISTS idx_invoices_company_party ON invoices(company_id, party);
    CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_invoice_items_item ON invoice_items(item_id);
    CREATE INDEX IF NOT EXISTS idx_estimates_company_status_date ON estimates(company_id, status, quote_date);
    CREATE INDEX IF NOT EXISTS idx_estimates_company_party ON estimates(company_id, party);
    CREATE INDEX IF NOT EXISTS idx_estimate_items_estimate ON estimate_items(estimate_id);
    CREATE INDEX IF NOT EXISTS idx_estimate_items_item ON estimate_items(item_id);
    CREATE INDEX IF NOT EXISTS idx_credit_notes_company_status_date ON credit_notes(company_id, status, credit_date);
    CREATE INDEX IF NOT EXISTS idx_credit_notes_company_party ON credit_notes(company_id, party);
    CREATE INDEX IF NOT EXISTS idx_credit_note_items_note ON credit_note_items(credit_note_id);
    CREATE INDEX IF NOT EXISTS idx_credit_note_items_item ON credit_note_items(item_id);
    CREATE INDEX IF NOT EXISTS idx_debit_notes_company_status_date ON debit_notes(company_id, status, debit_date);
    CREATE INDEX IF NOT EXISTS idx_debit_notes_company_party ON debit_notes(company_id, party);
    CREATE INDEX IF NOT EXISTS idx_debit_note_items_note ON debit_note_items(debit_note_id);
    CREATE INDEX IF NOT EXISTS idx_debit_note_items_item ON debit_note_items(item_id);
    CREATE INDEX IF NOT EXISTS idx_payments_company_date ON payments(company_id, payment_date);
    CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_company_item_date ON stock_movements(company_id, item_id, movement_date);
    CREATE INDEX IF NOT EXISTS idx_ledger_company_date ON ledger_entries(company_id, entry_date);
    CREATE INDEX IF NOT EXISTS idx_parties_company_name ON parties(company_id, name);
    CREATE INDEX IF NOT EXISTS idx_items_company_name ON items(company_id, name);
    CREATE INDEX IF NOT EXISTS idx_units_company_name ON units(company_id, name);
    CREATE INDEX IF NOT EXISTS idx_item_categories_company_name ON item_categories(company_id, name);
    CREATE INDEX IF NOT EXISTS idx_bank_accounts_company_default ON bank_accounts(company_id, is_default, display_name);
  `);
}

function migrateGstComplianceAndJournalTables() {
  if (!db) return;

  // e-Invoice log — stores IRN, QR code, ack details per invoice
  db.run(`
    CREATE TABLE IF NOT EXISTS einvoice_log (
      id TEXT PRIMARY KEY,
      company_id INTEGER NOT NULL,
      invoice_id TEXT NOT NULL,
      irn TEXT,
      ack_no TEXT,
      ack_date TEXT,
      qr_code TEXT,
      signed_invoice TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      request_json TEXT,
      response_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_einvoice_company_invoice ON einvoice_log(company_id, invoice_id);
  `);

  // e-Way Bill log — stores EWB number and validity per invoice
  db.run(`
    CREATE TABLE IF NOT EXISTS ewaybill_log (
      id TEXT PRIMARY KEY,
      company_id INTEGER NOT NULL,
      invoice_id TEXT NOT NULL,
      ewb_no TEXT,
      ewb_date TEXT,
      valid_upto TEXT,
      transporter_id TEXT,
      transport_doc_no TEXT,
      vehicle_no TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      request_json TEXT,
      response_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_ewaybill_company_invoice ON ewaybill_log(company_id, invoice_id);
  `);

  // Extend ledger_entries to support manual journal vouchers
  addColumnIfMissing("ledger_entries", "voucher_no", "TEXT");
  addColumnIfMissing("ledger_entries", "entry_type", "TEXT NOT NULL DEFAULT 'auto'");
  // entry_type: 'auto' = system-posted, 'journal' = manual voucher

  // ITC register — eligibility per purchase invoice line
  db.run(`
    CREATE TABLE IF NOT EXISTS itc_register (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      invoice_id TEXT NOT NULL,
      invoice_no TEXT,
      invoice_date TEXT,
      party TEXT,
      party_gstin TEXT,
      item_name TEXT,
      hsn_sac TEXT,
      taxable_value REAL NOT NULL DEFAULT 0,
      cgst_eligible REAL NOT NULL DEFAULT 0,
      sgst_eligible REAL NOT NULL DEFAULT 0,
      igst_eligible REAL NOT NULL DEFAULT 0,
      cgst_blocked REAL NOT NULL DEFAULT 0,
      sgst_blocked REAL NOT NULL DEFAULT 0,
      igst_blocked REAL NOT NULL DEFAULT 0,
      block_reason TEXT,
      period TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_itc_company_period ON itc_register(company_id, period);
  `);
}

function ensureDebitNoteSchema() {
  if (!db) return;
  db.run(`
    CREATE TABLE IF NOT EXISTS debit_notes (
      id TEXT PRIMARY KEY,
      company_id INTEGER NOT NULL,
      debit_no TEXT NOT NULL,
      original_purchase_id TEXT,
      original_purchase_no TEXT,
      party TEXT NOT NULL,
      party_id INTEGER,
      phone TEXT,
      billing_address TEXT,
      debit_date TEXT NOT NULL,
      refund_date TEXT,
      payment_terms TEXT,
      payment_method TEXT NOT NULL DEFAULT 'Adjustment',
      supply_type TEXT NOT NULL DEFAULT 'b2b',
      place_of_supply TEXT,
      party_gstin TEXT,
      party_tax_type TEXT NOT NULL DEFAULT 'unregistered',
      subtotal REAL NOT NULL DEFAULT 0,
      discount_total REAL NOT NULL DEFAULT 0,
      tax_total REAL NOT NULL DEFAULT 0,
      cgst_total REAL NOT NULL DEFAULT 0,
      sgst_total REAL NOT NULL DEFAULT 0,
      igst_total REAL NOT NULL DEFAULT 0,
      cess_total REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      adjusted REAL NOT NULL DEFAULT 0,
      balance REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open',
      reason TEXT,
      notes TEXT,
      meta_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY(original_purchase_id) REFERENCES transactions(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS debit_note_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      debit_note_id TEXT NOT NULL,
      item_id INTEGER,
      line_no INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      description TEXT,
      quantity REAL NOT NULL DEFAULT 0,
      unit TEXT,
      price REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      hsn_sac TEXT,
      taxable_value REAL NOT NULL DEFAULT 0,
      tax_rate REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      cgst_amount REAL NOT NULL DEFAULT 0,
      sgst_amount REAL NOT NULL DEFAULT 0,
      igst_amount REAL NOT NULL DEFAULT 0,
      cess_amount REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL DEFAULT 0,
      FOREIGN KEY(debit_note_id) REFERENCES debit_notes(id) ON DELETE CASCADE,
      FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_debit_notes_company_status_date ON debit_notes(company_id, status, debit_date);
    CREATE INDEX IF NOT EXISTS idx_debit_notes_company_party ON debit_notes(company_id, party);
    CREATE INDEX IF NOT EXISTS idx_debit_notes_company_party_id ON debit_notes(company_id, party_id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_debit_notes_company_number ON debit_notes(company_id, debit_no);
    CREATE INDEX IF NOT EXISTS idx_debit_note_items_note ON debit_note_items(debit_note_id);
    CREATE INDEX IF NOT EXISTS idx_debit_note_items_item ON debit_note_items(item_id);

    CREATE TRIGGER IF NOT EXISTS trg_debit_notes_party_id_insert AFTER INSERT ON debit_notes
    WHEN NEW.party_id IS NULL BEGIN
      UPDATE debit_notes SET party_id = (SELECT id FROM parties WHERE company_id = NEW.company_id AND name = NEW.party)
      WHERE id = NEW.id;
    END;
    CREATE TRIGGER IF NOT EXISTS trg_debit_notes_party_id_update AFTER UPDATE OF party ON debit_notes BEGIN
      UPDATE debit_notes SET party_id = (SELECT id FROM parties WHERE company_id = NEW.company_id AND name = NEW.party)
      WHERE id = NEW.id;
    END;
  `);
  addColumnIfMissing("stock_movements", "debit_note_id", "TEXT");
}

function ensureUsersSchema() {
  if (!db) return;
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      company_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      pin_hash TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_users_company_username ON users(company_id, username);
  `);
  if (tableExists(db, "companies")) {
    const companies = all("SELECT id FROM companies");
    for (const c of companies) {
      const existing = one("SELECT id FROM users WHERE company_id = ?", [c.id]);
      if (!existing) {
        const now = new Date().toISOString();
        run(
          "INSERT OR IGNORE INTO users (id, company_id, username, display_name, role, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [makeId(), c.id, "admin", "Primary Administrator", "admin", 1, now, now]
        );
      }
    }
  }
}

function seedDefaults() {
  const now = new Date().toISOString();
  run("DELETE FROM companies WHERE name LIKE '%.vyp'");
  if (!one("SELECT id FROM companies LIMIT 1")) {
    run(
      "INSERT INTO companies (name, email, country, is_current, created_at) VALUES (?, ?, ?, ?, ?)",
      ["testt", "demo@gibilling.local", "", 1, now],
    );
  }
  run("UPDATE companies SET email = ? WHERE email IS NULL OR email = '' OR email LIKE '%badgerhole.com'", ["demo@gibilling.local"]);
  if (!one("SELECT id FROM companies WHERE is_current = 1")) {
    run("UPDATE companies SET is_current = 1 WHERE id = (SELECT id FROM companies ORDER BY id LIMIT 1)");
  }
  seedMasterDefaultsForAllCompanies();
  backfillStandardUnitsAndCategoriesMetadata();
}

function seedMasterDefaultsForAllCompanies() {
  all("SELECT id FROM companies").forEach((company) => seedMasterDefaults(company.id));
}

function seedMasterDefaults(companyId) {
  if (one("SELECT value FROM company_settings WHERE company_id = ? AND key = 'master_defaults_seeded'", [companyId])) return;
  const now = new Date().toISOString();
  DEFAULT_UNITS.forEach((unit) => {
    const meta = STANDARD_UNIT_METADATA[unit] || {};
    run(
      "INSERT OR IGNORE INTO units (company_id, name, short_name, code, allows_decimal_quantity, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [companyId, unit, meta.short_name || null, meta.code || null, meta.allows_decimal || 0, meta.description || null, now]
    );
  });
  DEFAULT_ITEM_CATEGORIES.forEach((category) => {
    const meta = STANDARD_CATEGORY_METADATA[category] || {};
    run(
      "INSERT OR IGNORE INTO item_categories (company_id, name, code, description, created_at) VALUES (?, ?, ?, ?, ?)",
      [companyId, category, meta.code || null, meta.description || null, now]
    );
  });
  run("INSERT INTO company_settings (company_id, key, value) VALUES (?, 'master_defaults_seeded', '1')", [companyId]);
}

function backfillStandardUnitsAndCategoriesMetadata() {
  for (const [unitName, meta] of Object.entries(STANDARD_UNIT_METADATA)) {
    run(
      `UPDATE units SET
        short_name = COALESCE(NULLIF(short_name, ''), ?),
        code = COALESCE(NULLIF(code, ''), ?),
        description = COALESCE(NULLIF(description, ''), ?),
        allows_decimal_quantity = CASE WHEN allows_decimal_quantity = 0 AND ? = 1 THEN 1 ELSE allows_decimal_quantity END
       WHERE LOWER(TRIM(name)) = LOWER(?)`,
      [meta.short_name, meta.code, meta.description, meta.allows_decimal, unitName]
    );
  }

  for (const [catName, meta] of Object.entries(STANDARD_CATEGORY_METADATA)) {
    run(
      `UPDATE item_categories SET
        code = COALESCE(NULLIF(code, ''), ?),
        description = COALESCE(NULLIF(description, ''), ?)
       WHERE LOWER(TRIM(name)) = LOWER(?)`,
      [meta.code, meta.description, catName]
    );
  }
}

function getState() {
  const currentCompany = getCurrentCompany();
  const companyRows = all("SELECT id, name, email, country, is_current AS isCurrent, created_at AS createdAt FROM companies ORDER BY id");
  const enrichedCompanies = companyRows.map((c) => {
    const s = getBusinessSettings(c.id);
    return {
      ...c,
      businessName: s.businessName || c.name,
      legalName: s.legalName || "",
      gstin: s.gstin || "",
      pan: s.pan || "",
      state: s.state || "",
      address: s.address || "",
      phone: s.phone || (c.email === "demo@gibilling.local" ? "" : (c.email || "")),
    };
  });
  return {
    activeCompany: currentCompany?.name || "testt",
    country: currentCompany?.country || "",
    businessSettings: getBusinessSettings(),
    companies: enrichedCompanies,
    parties: all(
      `SELECT p.id, p.name, p.type, p.phone, p.email AS email,
        p.contact_person AS contactPerson, p.tax_type AS taxType, p.gstin,
        p.legal_name AS legalName, p.state, p.pan,
        p.billing_address AS billingAddress, p.shipping_address AS shippingAddress,
        p.opening_balance AS openingBalance, p.opening_balance_type AS openingBalanceType,
        p.credit_limit AS creditLimit, p.payment_terms AS paymentTerms,
        p.due_days AS dueDays, p.notes, p.created_at AS createdAt,
        COALESCE(pb.receivable, 0) + CASE WHEN p.opening_balance_type = 'receivable' THEN p.opening_balance ELSE 0 END AS receivable,
        COALESCE(pb.payable, 0) + CASE WHEN p.opening_balance_type = 'payable' THEN p.opening_balance ELSE 0 END AS payable,
        (COALESCE(pb.receivable, 0) + CASE WHEN p.opening_balance_type = 'receivable' THEN p.opening_balance ELSE 0 END)
          - (COALESCE(pb.payable, 0) + CASE WHEN p.opening_balance_type = 'payable' THEN p.opening_balance ELSE 0 END) AS balance,
        pb.last_activity AS lastActivity
       FROM parties p
       LEFT JOIN (
        SELECT party_id,
          SUM(receivable) AS receivable,
          SUM(payable) AS payable,
          MAX(activity_date) AS last_activity
        FROM (
          SELECT COALESCE(party_id, (SELECT id FROM parties WHERE company_id = invoices.company_id AND name = invoices.party)) AS party_id,
            CASE WHEN type = 'sale' THEN balance ELSE 0 END AS receivable,
            CASE WHEN type = 'purchase' THEN balance ELSE 0 END AS payable,
            invoice_date AS activity_date
          FROM invoices
          WHERE company_id = ? AND status <> 'cancelled'
          UNION ALL
          SELECT COALESCE(party_id, (SELECT id FROM parties WHERE company_id = credit_notes.company_id AND name = credit_notes.party)) AS party_id,
            -total AS receivable,
            0 AS payable,
            credit_date AS activity_date
          FROM credit_notes
          WHERE company_id = ? AND status <> 'cancelled'
          UNION ALL
          SELECT COALESCE(party_id, (SELECT id FROM parties WHERE company_id = debit_notes.company_id AND name = debit_notes.party)) AS party_id,
            0 AS receivable,
            -total AS payable,
            debit_date AS activity_date
          FROM debit_notes
          WHERE company_id = ? AND status <> 'cancelled'
          UNION ALL
          SELECT COALESCE(party_id, (SELECT id FROM parties WHERE company_id = payments.company_id AND name = payments.party)) AS party_id,
            CASE WHEN type = 'payment_in' THEN -amount ELSE 0 END AS receivable,
            CASE WHEN type = 'payment_out' THEN -amount ELSE 0 END AS payable,
            payment_date AS activity_date
          FROM payments
          WHERE company_id = ? AND invoice_id IS NULL
        )
        WHERE party_id IS NOT NULL
        GROUP BY party_id
       ) pb ON pb.party_id = p.id
       WHERE p.company_id = ?
       ORDER BY p.id DESC`,
      [currentCompany.id, currentCompany.id, currentCompany.id, currentCompany.id, currentCompany.id],
    ),
    items: all(
      `SELECT i.id, i.name, i.item_type AS itemType, i.sku, i.category, i.unit,
        i.hsn_sac AS hsnSac, i.sale_price AS salePrice, i.sale_tax_type AS saleTaxType,
        i.purchase_price AS purchasePrice, i.purchase_tax_type AS purchaseTaxType,
        i.tax_rate AS taxRate, i.discount, i.opening_stock AS openingStock,
        i.opening_stock_date AS openingStockDate, i.opening_stock_value AS openingStockValue,
        i.storage_location AS storageLocation, i.low_stock_alert AS lowStockAlert,
        i.description, i.notes, i.created_at AS createdAt,
        CASE WHEN i.item_type = 'service' THEN 0 ELSE i.opening_stock + COALESCE(sb.quantity, 0) END AS currentStock,
        CASE WHEN i.item_type <> 'service' AND i.low_stock_alert > 0 AND (i.opening_stock + COALESCE(sb.quantity, 0)) <= i.low_stock_alert THEN 1 ELSE 0 END AS isLowStock
       FROM items i
       LEFT JOIN (
        SELECT item_id,
          SUM(CASE
            WHEN movement_type = 'in' THEN quantity
            WHEN movement_type = 'out' THEN -quantity
            ELSE quantity
          END) AS quantity
        FROM stock_movements
        WHERE company_id = ? AND item_id IS NOT NULL
        GROUP BY item_id
       ) sb ON sb.item_id = i.id
       WHERE i.company_id = ?
         AND NOT (
           EXISTS (SELECT 1 FROM transactions t WHERE t.company_id = i.company_id AND t.type = 'expense' AND LOWER(TRIM(t.item)) = LOWER(TRIM(i.name)))
           AND NOT EXISTS (SELECT 1 FROM invoice_items ii WHERE ii.item_id = i.id OR LOWER(TRIM(ii.item_name)) = LOWER(TRIM(i.name)))
           AND NOT EXISTS (SELECT 1 FROM estimate_items ei WHERE ei.item_id = i.id OR LOWER(TRIM(ei.item_name)) = LOWER(TRIM(i.name)))
           AND NOT EXISTS (SELECT 1 FROM credit_note_items cni WHERE cni.item_id = i.id OR LOWER(TRIM(cni.item_name)) = LOWER(TRIM(i.name)))
           AND NOT EXISTS (SELECT 1 FROM debit_note_items dni WHERE dni.item_id = i.id OR LOWER(TRIM(dni.item_name)) = LOWER(TRIM(i.name)))
           AND NOT EXISTS (SELECT 1 FROM stock_movements sm WHERE sm.item_id = i.id)
           AND COALESCE(i.opening_stock, 0) = 0
           AND COALESCE(i.sale_price, 0) = 0
           AND COALESCE(i.purchase_price, 0) = 0
         )
       ORDER BY i.id DESC`,
      [currentCompany.id, currentCompany.id],
    ),
    units: getUnitsList(),
    itemCategories: getCategoriesWithHierarchy(),
    bankAccounts: all(
      `SELECT id, display_name AS displayName, bank_name AS bankName, account_no AS accountNo,
        ifsc, upi_id AS upiId, opening_balance AS openingBalance,
        current_balance AS currentBalance, as_of_date AS asOfDate,
        print_upi_qr AS printUpiQr, print_bank_details AS printBankDetails,
        is_default AS isDefault, notes, created_at AS createdAt, updated_at AS updatedAt
       FROM bank_accounts WHERE company_id = ? ORDER BY is_default DESC, display_name`,
      [currentCompany.id],
    ),
    transactions: all(
      `SELECT id, invoice_id AS invoiceId, invoice_no AS invoiceNo, type, party, item, amount,
        payment_type AS paymentType, status, notes, meta_json AS metaJson,
        transaction_date AS date, created_at AS createdAt, updated_at AS updatedAt
       FROM transactions WHERE company_id = ? ORDER BY created_at DESC`,
      [currentCompany.id],
    ),
    invoices: all(
      `SELECT id, transaction_id AS transactionId, invoice_no AS invoiceNo, type, party, phone,
        billing_address AS billingAddress, invoice_date AS date, due_date AS dueDate,
        payment_terms AS paymentTerms, payment_type AS paymentType, subtotal, discount_total AS discountTotal,
        supply_type AS supplyType, place_of_supply AS placeOfSupply, party_gstin AS partyGstin,
        party_tax_type AS partyTaxType, tax_total AS taxTotal, cgst_total AS cgstTotal,
        sgst_total AS sgstTotal, igst_total AS igstTotal, cess_total AS cessTotal,
        total, received, balance, status, notes, meta_json AS metaJson, created_at AS createdAt
       FROM invoices WHERE company_id = ? ORDER BY created_at DESC`,
      [currentCompany.id],
    ),
    estimates: all(
      `SELECT id, quote_no AS quoteNo, party, phone, billing_address AS billingAddress,
        quote_date AS date, valid_until AS validUntil, payment_terms AS paymentTerms,
        supply_type AS supplyType, place_of_supply AS placeOfSupply, party_gstin AS partyGstin,
        party_tax_type AS partyTaxType, subtotal, discount_total AS discountTotal,
        tax_total AS taxTotal, cgst_total AS cgstTotal, sgst_total AS sgstTotal,
        igst_total AS igstTotal, cess_total AS cessTotal, total, status, notes, meta_json AS metaJson,
        converted_invoice_id AS convertedInvoiceId, COALESCE(document_type, 'estimate') AS documentType,
        created_at AS createdAt, updated_at AS updatedAt
       FROM estimates WHERE company_id = ? ORDER BY created_at DESC`,
      [currentCompany.id],
    ),
    creditNotes: all(
      `SELECT id, credit_no AS creditNo, original_invoice_id AS originalInvoiceId,
        original_invoice_no AS originalInvoiceNo, party, party_id AS partyId, phone, billing_address AS billingAddress,
        credit_date AS date, refund_date AS refundDate, payment_terms AS paymentTerms,
        payment_method AS paymentMethod, supply_type AS supplyType, place_of_supply AS placeOfSupply,
        party_gstin AS partyGstin, party_tax_type AS partyTaxType, subtotal,
        discount_total AS discountTotal, tax_total AS taxTotal, cgst_total AS cgstTotal,
        sgst_total AS sgstTotal, igst_total AS igstTotal, cess_total AS cessTotal,
        total, adjusted, balance, status, reason, notes, meta_json AS metaJson, created_at AS createdAt,
        updated_at AS updatedAt
       FROM credit_notes WHERE company_id = ? ORDER BY created_at DESC`,
      [currentCompany.id],
    ),
    debitNotes: all(
      `SELECT id, debit_no AS debitNo, original_purchase_id AS originalPurchaseId,
        original_purchase_id AS originalInvoiceId,
        original_purchase_no AS originalPurchaseNo,
        original_purchase_no AS originalInvoiceNo,
        party, party_id AS partyId, phone, billing_address AS billingAddress,
        debit_date AS date, refund_date AS refundDate, payment_terms AS paymentTerms,
        payment_method AS paymentMethod, supply_type AS supplyType, place_of_supply AS placeOfSupply,
        party_gstin AS partyGstin, party_tax_type AS partyTaxType, subtotal,
        discount_total AS discountTotal, tax_total AS taxTotal, cgst_total AS cgstTotal,
        sgst_total AS sgstTotal, igst_total AS igstTotal, cess_total AS cessTotal,
        total, adjusted, balance, status, reason, notes, meta_json AS metaJson, created_at AS createdAt,
        updated_at AS updatedAt
       FROM debit_notes WHERE company_id = ? ORDER BY created_at DESC`,
      [currentCompany.id],
    ),
    invoiceItems: all(
      `SELECT ii.id, ii.invoice_id AS invoiceId, ii.item_id AS itemId, ii.line_no AS lineNo, ii.item_name AS item,
        ii.description, ii.quantity AS qty, ii.unit, ii.price, ii.discount,
        ii.hsn_sac AS hsnSac, ii.taxable_value AS taxableValue, ii.tax_rate AS taxRate,
        ii.tax_amount AS taxAmount, ii.cgst_amount AS cgstAmount, ii.sgst_amount AS sgstAmount,
        ii.igst_amount AS igstAmount, ii.cess_amount AS cessAmount, ii.line_total AS lineTotal
       FROM invoice_items ii
       JOIN invoices i ON i.id = ii.invoice_id
       WHERE i.company_id = ?
       ORDER BY ii.invoice_id, ii.line_no`,
      [currentCompany.id],
    ),
    estimateItems: all(
      `SELECT ei.id, ei.estimate_id AS estimateId, ei.item_id AS itemId, ei.line_no AS lineNo, ei.item_name AS item,
        ei.description, ei.quantity AS qty, ei.unit, ei.price, ei.discount,
        ei.hsn_sac AS hsnSac, ei.taxable_value AS taxableValue, ei.tax_rate AS taxRate,
        ei.tax_amount AS taxAmount, ei.cgst_amount AS cgstAmount, ei.sgst_amount AS sgstAmount,
        ei.igst_amount AS igstAmount, ei.cess_amount AS cessAmount, ei.line_total AS lineTotal
       FROM estimate_items ei
       JOIN estimates e ON e.id = ei.estimate_id
       WHERE e.company_id = ?
       ORDER BY ei.estimate_id, ei.line_no`,
      [currentCompany.id],
    ),
    creditNoteItems: all(
      `SELECT cni.id, cni.credit_note_id AS creditNoteId, cni.item_id AS itemId,
        cni.line_no AS lineNo, cni.item_name AS item, cni.description,
        cni.quantity AS qty, cni.unit, cni.price, cni.discount,
        cni.hsn_sac AS hsnSac, cni.taxable_value AS taxableValue,
        cni.tax_rate AS taxRate, cni.tax_amount AS taxAmount,
        cni.cgst_amount AS cgstAmount, cni.sgst_amount AS sgstAmount,
        cni.igst_amount AS igstAmount, cni.cess_amount AS cessAmount,
        cni.line_total AS lineTotal
       FROM credit_note_items cni
       JOIN credit_notes cn ON cn.id = cni.credit_note_id
       WHERE cn.company_id = ?
       ORDER BY cni.credit_note_id, cni.line_no`,
      [currentCompany.id],
    ),
    debitNoteItems: all(
      `SELECT dni.id, dni.debit_note_id AS debitNoteId, dni.item_id AS itemId,
        dni.line_no AS lineNo, dni.item_name AS item, dni.description,
        dni.quantity AS qty, dni.unit, dni.price, dni.discount,
        dni.hsn_sac AS hsnSac, dni.taxable_value AS taxableValue,
        dni.tax_rate AS taxRate, dni.tax_amount AS taxAmount,
        dni.cgst_amount AS cgstAmount, dni.sgst_amount AS sgstAmount,
        dni.igst_amount AS igstAmount, dni.cess_amount AS cessAmount,
        dni.line_total AS lineTotal
       FROM debit_note_items dni
       JOIN debit_notes dn ON dn.id = dni.debit_note_id
       WHERE dn.company_id = ?
       ORDER BY dni.debit_note_id, dni.line_no`,
      [currentCompany.id],
    ),
    payments: all(
      `SELECT id, invoice_id AS invoiceId, transaction_id AS transactionId, type, party, party_id AS partyId,
        amount, method, payment_date AS paymentDate, notes, created_at AS createdAt
       FROM payments WHERE company_id = ? ORDER BY created_at DESC`,
      [currentCompany.id],
    ),
    stockMovements: all(
      `SELECT id, invoice_id AS invoiceId, transaction_id AS transactionId, credit_note_id AS creditNoteId, debit_note_id AS debitNoteId,
        item_id AS itemId, item_name AS item,
        movement_type AS movementType, quantity, unit, rate, movement_date AS movementDate,
        notes, created_at AS createdAt
       FROM stock_movements WHERE company_id = ? ORDER BY created_at DESC`,
      [currentCompany.id],
    ),
    stockBalances: all(
      `SELECT COALESCE(i.name, sm.item_name) AS item,
        sm.item_id AS itemId,
        SUM(CASE
          WHEN sm.movement_type = 'in' THEN sm.quantity
          WHEN sm.movement_type = 'out' THEN -sm.quantity
          ELSE sm.quantity
        END) AS quantity
       FROM stock_movements sm
       LEFT JOIN items i ON i.id = sm.item_id
       WHERE sm.company_id = ?
       GROUP BY sm.item_id, sm.item_name
       ORDER BY COALESCE(i.name, sm.item_name)`,
      [currentCompany.id],
    ),
    ledgerEntries: all(
      `SELECT id, transaction_id AS transactionId, account, debit, credit, entry_date AS entryDate,
        narration, voucher_no AS voucherNo,
        COALESCE(entry_type, 'auto') AS entryType
       FROM ledger_entries WHERE company_id = ? ORDER BY entry_date DESC, id DESC`,
      [currentCompany.id],
    ),
    eInvoiceLogs: tableExists(db, "einvoice_log") ? all(
      `SELECT id, invoice_id AS invoiceId, irn, ack_no AS ackNo, ack_date AS ackDate,
        qr_code AS qrCode, status, created_at AS createdAt
       FROM einvoice_log WHERE company_id = ? ORDER BY created_at DESC`,
      [currentCompany.id],
    ) : [],
    eWayBillLogs: tableExists(db, "ewaybill_log") ? all(
      `SELECT id, invoice_id AS invoiceId, ewb_no AS ewbNo, ewb_date AS ewbDate,
        valid_upto AS validUpto, vehicle_no AS vehicleNo, status, created_at AS createdAt
       FROM ewaybill_log WHERE company_id = ? ORDER BY created_at DESC`,
      [currentCompany.id],
    ) : [],
    taxEntries: all(
      `SELECT id, source_type AS sourceType, source_id AS sourceId, document_no AS documentNo,
        document_date AS documentDate, party_id AS partyId, party_name AS partyName,
        party_gstin AS partyGstin, place_of_supply AS placeOfSupply, supply_type AS supplyType,
        hsn_sac AS hsnSac, tax_rate AS taxRate, taxable_value AS taxableValue,
        cgst, sgst, igst, cess, is_reverse_charge AS isReverseCharge, is_cancelled AS isCancelled,
        created_at AS createdAt
       FROM tax_entries WHERE company_id = ? ORDER BY id DESC`,
      [currentCompany.id],
    ),
  };
}

function setCurrentCompany(name) {
  const now = new Date().toISOString();
  run(
    "INSERT OR IGNORE INTO companies (name, email, country, is_current, created_at) VALUES (?, ?, ?, ?, ?)",
    [name, "", "India", 0, now],
  );
  run("UPDATE companies SET is_current = 0");
  run("UPDATE companies SET is_current = 1 WHERE name = ?", [name]);
  const company = one("SELECT id FROM companies WHERE name = ?", [name]);
  if (company?.id) {
    seedMasterDefaults(company.id);
    cleanupOrphanExpenseItems(company.id);
  }
  persist();
  return getState();
}

function setCountry(country) {
  const company = getCurrentCompany();
  run("UPDATE companies SET country = ? WHERE id = ?", [country, company.id]);
  persist();
  return getState();
}

function createCompany(payload = {}) {
  const name = String(payload.businessName || payload.name || "").trim();
  if (!name) throw new Error("Business name is required.");
  const existing = one("SELECT id FROM companies WHERE LOWER(name) = LOWER(?)", [name]);
  if (existing) throw new Error(`A company named "${name}" already exists.`);

  const now = new Date().toISOString();
  run(
    "INSERT INTO companies (name, email, country, is_current, created_at) VALUES (?, ?, ?, 0, ?)",
    [name, payload.email || "", payload.country || "India", now]
  );
  const company = one("SELECT id FROM companies WHERE name = ?", [name]);
  if (company?.id) {
    seedMasterDefaults(company.id);
    const settings = {
      businessName: name,
      legalName: String(payload.legalName || "").trim(),
      gstin: String(payload.gstin || "").trim().toUpperCase(),
      pan: String(payload.pan || "").trim().toUpperCase(),
      state: String(payload.state || "Karnataka").trim(),
      address: String(payload.address || "").trim(),
      city: String(payload.city || "").trim(),
      pincode: String(payload.pincode || "").trim(),
      phone: String(payload.phone || "").trim(),
      email: String(payload.email || "").trim(),
      bankDetails: {
        bankName: String(payload.bankName || "").trim(),
        accountNo: String(payload.accountNo || "").trim(),
        ifsc: String(payload.ifsc || "").trim().toUpperCase(),
        upiId: String(payload.upiId || "").trim(),
      },
      invoicePrefix: "INV",
      startingNo: 1,
      terms: "",
    };
    Object.entries(settings).forEach(([key, value]) => {
      run("INSERT OR REPLACE INTO company_settings (company_id, key, value) VALUES (?, ?, ?)", [company.id, key, JSON.stringify(value)]);
    });
  }

  run("UPDATE companies SET is_current = 0");
  run("UPDATE companies SET is_current = 1 WHERE id = ?", [company.id]);
  persist();
  return getState();
}

function updateCompanyProfile(arg1 = {}, arg2 = null) {
  const payload = (arg2 && typeof arg2 === "object") ? { ...arg2, companyId: arg1 } : (typeof arg1 === "object" ? arg1 : { companyId: arg1 });
  const companyId = Number(payload.companyId || payload.id || getCurrentCompany().id);
  const company = one("SELECT id, name FROM companies WHERE id = ?", [companyId]);
  if (!company) throw new Error("Company not found.");

  const newName = String(payload.businessName || payload.name || "").trim();
  if (newName && newName !== company.name) {
    const existing = one("SELECT id FROM companies WHERE LOWER(name) = LOWER(?) AND id != ?", [newName, companyId]);
    if (existing) throw new Error(`Another company named "${newName}" already exists.`);
    run("UPDATE companies SET name = ? WHERE id = ?", [newName, companyId]);
  }

  const current = getBusinessSettings(companyId);
  const settings = {
    businessName: newName || company.name,
    legalName: String(payload.legalName ?? current.legalName ?? "").trim(),
    gstin: String(payload.gstin ?? current.gstin ?? "").trim().toUpperCase(),
    pan: String(payload.pan ?? current.pan ?? "").trim().toUpperCase(),
    state: String(payload.state ?? current.state ?? "Karnataka").trim(),
    address: String(payload.address ?? current.address ?? "").trim(),
    city: String(payload.city ?? current.city ?? "").trim(),
    pincode: String(payload.pincode ?? current.pincode ?? "").trim(),
    phone: String(payload.phone ?? current.phone ?? "").trim(),
    email: String(payload.email ?? current.email ?? "").trim(),
    bankDetails: {
      bankName: String(payload.bankName ?? current.bankDetails?.bankName ?? "").trim(),
      accountNo: String(payload.accountNo ?? current.bankDetails?.accountNo ?? "").trim(),
      ifsc: String(payload.ifsc ?? current.bankDetails?.ifsc ?? "").trim().toUpperCase(),
      upiId: String(payload.upiId ?? current.bankDetails?.upiId ?? "").trim(),
    },
    invoicePrefix: String(payload.invoicePrefix ?? current.invoicePrefix ?? "INV").trim().toUpperCase() || "INV",
    startingNo: Math.max(1, Number(payload.startingNo ?? current.startingNo ?? 1) || 1),
    terms: String(payload.terms ?? current.terms ?? "").trim(),
  };

  Object.entries(settings).forEach(([key, value]) => {
    run("INSERT OR REPLACE INTO company_settings (company_id, key, value) VALUES (?, ?, ?)", [companyId, key, JSON.stringify(value)]);
  });

  persist();
  return getState();
}

function deleteCompany(companyId) {
  return inDatabaseTransaction(() => deleteCompanyUnsafe(companyId));
}

function deleteCompanyUnsafe(companyId) {
  const total = Number(one("SELECT COUNT(*) AS count FROM companies").count || 0);
  if (total <= 1) throw new Error("Cannot delete the only remaining company.");

  const id = Number(companyId);
  const company = one("SELECT id, is_current AS isCurrent FROM companies WHERE id = ?", [id]);
  if (!company) throw new Error("Company not found.");

  run("DELETE FROM tax_entries WHERE company_id = ?", [id]);
  run("DELETE FROM ledger_entries WHERE company_id = ?", [id]);
  run("DELETE FROM stock_movements WHERE company_id = ?", [id]);
  run("DELETE FROM payments WHERE company_id = ?", [id]);
  run("DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = ?)", [id]);
  run("DELETE FROM invoices WHERE company_id = ?", [id]);
  run("DELETE FROM transactions WHERE company_id = ?", [id]);
  run("DELETE FROM items WHERE company_id = ?", [id]);
  run("DELETE FROM parties WHERE company_id = ?", [id]);
  run("DELETE FROM company_settings WHERE company_id = ?", [id]);
  run("DELETE FROM document_sequences WHERE company_id = ?", [id]);
  run("DELETE FROM companies WHERE id = ?", [id]);

  if (company.isCurrent) {
    run("UPDATE companies SET is_current = 1 WHERE id = (SELECT id FROM companies ORDER BY id LIMIT 1)");
  }

  persist();
  return getState();
}

function getTaxEntries(filter = {}) {
  const company = getCurrentCompany();
  let sql = `
    SELECT id, company_id AS companyId, source_type AS sourceType, source_id AS sourceId,
           document_no AS documentNo, document_date AS documentDate, party_id AS partyId,
           party_name AS partyName, party_gstin AS partyGstin, place_of_supply AS placeOfSupply,
           supply_type AS supplyType, hsn_sac AS hsnSac, tax_rate AS taxRate,
           taxable_value AS taxableValue, cgst, sgst, igst, cess,
           is_reverse_charge AS isReverseCharge, is_cancelled AS isCancelled, created_at AS createdAt
    FROM tax_entries
    WHERE company_id = ?
  `;
  const params = [company.id];
  if (filter.dateFrom) {
    sql += " AND document_date >= ?";
    params.push(filter.dateFrom);
  }
  if (filter.dateTo) {
    sql += " AND document_date <= ?";
    params.push(filter.dateTo);
  }
  if (filter.sourceType) {
    sql += " AND source_type = ?";
    params.push(filter.sourceType);
  }
  if (filter.sourceId) {
    sql += " AND source_id = ?";
    params.push(filter.sourceId);
  }
  if (filter.excludeCancelled) {
    sql += " AND is_cancelled = 0";
  }
  sql += " ORDER BY document_date DESC, id DESC";
  return all(sql, params);
}

function getAuditTrail(filter = {}) {
  const company = getCurrentCompany();
  let sql = `
    SELECT id, company_id AS companyId, action, entity_type AS entityType,
           entity_id AS entityId, document_no AS documentNo, details_json AS detailsJson,
           created_at AS createdAt
    FROM audit_trail
    WHERE company_id = ?
  `;
  const params = [company.id];
  if (filter.entityType) {
    sql += " AND entity_type = ?";
    params.push(filter.entityType);
  }
  if (filter.action) {
    sql += " AND action = ?";
    params.push(filter.action);
  }
  sql += " ORDER BY id DESC";
  return all(sql, params).map((row) => {
    let details = null;
    try {
      details = row.detailsJson ? JSON.parse(row.detailsJson) : null;
    } catch {
      details = null;
    }
    return {
      ...row,
      details,
    };
  });
}

function postTaxEntries(companyId, transaction, invoiceItems, now) {
  run("DELETE FROM tax_entries WHERE company_id = ? AND source_type = ? AND source_id = ?", [companyId, transaction.type, transaction.invoiceId]);

  const placeOfSupply = String(transaction.placeOfSupply || "").trim();
  const supplyType = String(transaction.supplyType || (transaction.partyGstin ? "b2b" : "b2c"));

  for (const item of invoiceItems) {
    const taxable = Number(item.taxableValue ?? item.taxableAmount ?? (Number(item.qty || 0) * Number(item.price || 0) - Number(item.discount || 0)) ?? 0);
    const rate = Number(item.taxRate || 0);
    const lineCgst = Number(item.cgstAmount ?? item.cgst ?? 0);
    const lineSgst = Number(item.sgstAmount ?? item.sgst ?? 0);
    const lineIgst = Number(item.igstAmount ?? item.igst ?? 0);
    const lineCess = Number(item.cessAmount ?? item.cess ?? 0);

    run(`
      INSERT INTO tax_entries
        (company_id, source_type, source_id, document_no, document_date, party_id,
         party_name, party_gstin, place_of_supply, supply_type, hsn_sac, tax_rate,
         taxable_value, cgst, sgst, igst, cess, is_reverse_charge, is_cancelled, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
    `, [
      companyId,
      transaction.type,
      transaction.invoiceId,
      transaction.invoiceNo,
      transaction.date,
      transaction.partyId,
      transaction.party,
      transaction.partyGstin || "",
      placeOfSupply,
      supplyType,
      item.hsnSac || "",
      rate,
      taxable,
      lineCgst,
      lineSgst,
      lineIgst,
      lineCess,
      now
    ]);
  }
}

function defaultBusinessSettings(companyName = "testt") {
  return {
    businessName: companyName,
    legalName: "",
    gstin: "",
    pan: "",
    state: "Karnataka",
    address: "",
    city: "",
    pincode: "",
    phone: "",
    email: "",
    bankDetails: {
      bankName: "",
      accountNo: "",
      ifsc: "",
      upiId: "",
    },
    invoicePrefix: "INV",
    startingNo: 1,
    terms: "",
    customFields: defaultCustomFields(),
    printerType: "regular",
    thermalWidth: "80mm",
    a4Template: "modern",
    thermalTemplate: "retail",
    printCompanyLogo: true,
    printBankDetails: true,
    printUpiQr: true,
    printGstSummary: true,
    printTerms: true,
    printSignature: true,
    stopSaleOnNegativeStock: false,
    defaultTaxInclusive: false,
    enableHsn: true,
    whatsappSettings: {
      mode: "direct",
      autoShareOnSave: false,
      phoneNumberId: "",
      wabaId: "",
      accessToken: "",
      templateName: "invoice_notification",
      languageCode: "en",
      customMessageTemplate: "",
    },
  };
}

function defaultCustomFields() {
  return [
    { id: "sale-po-number", module: "sale", label: "PO Number", fieldKey: "poNumber", fieldType: "text", required: false, showOnPrint: true, showInList: false, active: true, sortOrder: 10 },
    { id: "sale-vehicle-number", module: "sale", label: "Vehicle Number", fieldKey: "vehicleNumber", fieldType: "text", required: false, showOnPrint: true, showInList: false, active: true, sortOrder: 20 },
    { id: "sale-delivery-date", module: "sale", label: "Delivery Date", fieldKey: "deliveryDate", fieldType: "date", required: false, showOnPrint: true, showInList: false, active: true, sortOrder: 30 },
    { id: "sale-reference-number", module: "sale", label: "Reference Number", fieldKey: "referenceNumber", fieldType: "text", required: false, showOnPrint: true, showInList: false, active: true, sortOrder: 40 },
    { id: "purchase-supplier-bill-ref", module: "purchase", label: "Supplier Bill Ref", fieldKey: "supplierBillRef", fieldType: "text", required: false, showOnPrint: true, showInList: false, active: true, sortOrder: 10 },
    { id: "purchase-po-number", module: "purchase", label: "PO Number", fieldKey: "poNumber", fieldType: "text", required: false, showOnPrint: true, showInList: false, active: true, sortOrder: 20 },
    { id: "estimate-project-name", module: "estimate", label: "Project Name", fieldKey: "projectName", fieldType: "text", required: false, showOnPrint: true, showInList: false, active: true, sortOrder: 10 },
    { id: "estimate-followup-date", module: "estimate", label: "Follow-up Date", fieldKey: "followupDate", fieldType: "date", required: false, showOnPrint: false, showInList: false, active: true, sortOrder: 20 },
  ];
}

function getBusinessSettings(explicitCompanyId = null) {
  const company = explicitCompanyId ? one("SELECT id, name FROM companies WHERE id = ?", [explicitCompanyId]) : getCurrentCompany();
  const defaults = defaultBusinessSettings(company?.name || "testt");
  const saved = {};
  if (!company) return defaults;
  const settingsTable = tableExists(db, "company_settings") ? "company_settings" : "app_settings";
  const rows = settingsTable === "company_settings"
    ? all("SELECT key, value FROM company_settings WHERE company_id = ?", [company.id])
    : all("SELECT key, value FROM app_settings");
  rows.forEach((row) => {
    try {
      saved[row.key] = JSON.parse(row.value);
    } catch {
      saved[row.key] = row.value;
    }
  });
  return {
    ...defaults,
    ...saved,
    bankDetails: {
      ...defaults.bankDetails,
      ...(saved.bankDetails || {}),
    },
    whatsappSettings: {
      ...defaults.whatsappSettings,
      ...(saved.whatsappSettings || {}),
    },
    customFields: normalizeCustomFields(saved.customFields || defaults.customFields),
  };
}

function updateBusinessSettings(settings = {}) {
  const company = getCurrentCompany();
  const current = getBusinessSettings();
  const next = {
    businessName: String(settings.businessName ?? current.businessName ?? "").trim(),
    legalName: String(settings.legalName ?? current.legalName ?? "").trim(),
    gstin: String(settings.gstin ?? current.gstin ?? "").trim().toUpperCase(),
    pan: String(settings.pan ?? current.pan ?? "").trim().toUpperCase(),
    state: String(settings.state ?? current.state ?? "Karnataka").trim(),
    address: String(settings.address ?? current.address ?? "").trim(),
    city: String(settings.city ?? current.city ?? "").trim(),
    pincode: String(settings.pincode ?? current.pincode ?? "").trim(),
    phone: String(settings.phone ?? current.phone ?? "").trim(),
    email: String(settings.email ?? current.email ?? "").trim(),
    bankDetails: {
      bankName: String(settings.bankDetails?.bankName ?? current.bankDetails.bankName ?? "").trim(),
      accountNo: String(settings.bankDetails?.accountNo ?? current.bankDetails.accountNo ?? "").trim(),
      ifsc: String(settings.bankDetails?.ifsc ?? current.bankDetails.ifsc ?? "").trim().toUpperCase(),
      upiId: String(settings.bankDetails?.upiId ?? current.bankDetails.upiId ?? "").trim(),
    },
    invoicePrefix: String(settings.invoicePrefix ?? current.invoicePrefix ?? "INV").trim().toUpperCase() || "INV",
    startingNo: Math.max(1, Number(settings.startingNo ?? current.startingNo ?? 1) || 1),
    terms: String(settings.terms ?? current.terms ?? "").trim(),
    customFields: normalizeCustomFields(settings.customFields ?? current.customFields),
    printerType: String(settings.printerType ?? current.printerType ?? "regular").trim(),
    thermalWidth: String(settings.thermalWidth ?? current.thermalWidth ?? "80mm").trim(),
    a4Template: String(settings.a4Template ?? current.a4Template ?? "modern").trim(),
    thermalTemplate: String(settings.thermalTemplate ?? current.thermalTemplate ?? "retail").trim(),
    printCompanyLogo: settings.printCompanyLogo !== undefined ? Boolean(settings.printCompanyLogo) : Boolean(current.printCompanyLogo ?? true),
    printBankDetails: settings.printBankDetails !== undefined ? Boolean(settings.printBankDetails) : Boolean(current.printBankDetails ?? true),
    printUpiQr: settings.printUpiQr !== undefined ? Boolean(settings.printUpiQr) : Boolean(current.printUpiQr ?? true),
    printGstSummary: settings.printGstSummary !== undefined ? Boolean(settings.printGstSummary) : Boolean(current.printGstSummary ?? true),
    printTerms: settings.printTerms !== undefined ? Boolean(settings.printTerms) : Boolean(current.printTerms ?? true),
    printSignature: settings.printSignature !== undefined ? Boolean(settings.printSignature) : Boolean(current.printSignature ?? true),
    stopSaleOnNegativeStock: settings.stopSaleOnNegativeStock !== undefined ? Boolean(settings.stopSaleOnNegativeStock) : Boolean(current.stopSaleOnNegativeStock ?? false),
    defaultTaxInclusive: settings.defaultTaxInclusive !== undefined ? Boolean(settings.defaultTaxInclusive) : Boolean(current.defaultTaxInclusive ?? false),
    enableHsn: settings.enableHsn !== undefined ? Boolean(settings.enableHsn) : Boolean(current.enableHsn ?? true),
    whatsappSettings: {
      mode: ["direct", "cloud_api"].includes(settings.whatsappSettings?.mode) ? settings.whatsappSettings.mode : (current.whatsappSettings?.mode || "direct"),
      autoShareOnSave: settings.whatsappSettings?.autoShareOnSave !== undefined ? Boolean(settings.whatsappSettings.autoShareOnSave) : Boolean(current.whatsappSettings?.autoShareOnSave ?? false),
      phoneNumberId: String(settings.whatsappSettings?.phoneNumberId ?? current.whatsappSettings?.phoneNumberId ?? "").trim(),
      wabaId: String(settings.whatsappSettings?.wabaId ?? current.whatsappSettings?.wabaId ?? "").trim(),
      accessToken: String(settings.whatsappSettings?.accessToken ?? current.whatsappSettings?.accessToken ?? "").trim(),
      templateName: String(settings.whatsappSettings?.templateName ?? current.whatsappSettings?.templateName ?? "invoice_notification").trim(),
      languageCode: String(settings.whatsappSettings?.languageCode ?? current.whatsappSettings?.languageCode ?? "en").trim(),
      customMessageTemplate: String(settings.whatsappSettings?.customMessageTemplate ?? current.whatsappSettings?.customMessageTemplate ?? "").trim(),
    },
  };
  Object.entries(next).forEach(([key, value]) => {
    run("INSERT OR REPLACE INTO company_settings (company_id, key, value) VALUES (?, ?, ?)", [company.id, key, JSON.stringify(value)]);
  });
  persist();
  return getState();
}

function normalizeCustomFields(fields = []) {
  const modules = new Set(["sale", "purchase", "estimate", "saleReturn", "party", "item", "expense"]);
  return (Array.isArray(fields) ? fields : defaultCustomFields())
    .map((field, index) => {
      const label = String(field.label || "").trim();
      const fieldKey = String(field.fieldKey || field.key || keyFromLabel(label)).trim();
      const module = modules.has(field.module) ? field.module : "sale";
      const fieldType = ["text", "number", "date", "dropdown", "checkbox", "textarea"].includes(field.fieldType) ? field.fieldType : "text";
      if (!label || !fieldKey) return null;
      return {
        id: String(field.id || `${module}-${fieldKey}`),
        module,
        label,
        fieldKey,
        fieldType,
        options: Array.isArray(field.options) ? field.options.map((option) => String(option).trim()).filter(Boolean) : [],
        required: Boolean(field.required),
        showOnPrint: field.showOnPrint !== false,
        showInList: Boolean(field.showInList),
        active: field.active !== false,
        sortOrder: Number(field.sortOrder ?? index * 10),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.module.localeCompare(b.module) || a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

function keyFromLabel(label) {
  return String(label || "")
    .trim()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_match, char) => char.toUpperCase())
    .replace(/^[A-Z]/, (char) => char.toLowerCase());
}

function createBankAccount(entry = {}) {
  const company = getCurrentCompany();
  const now = new Date().toISOString();
  const account = normalizeBankAccountInput(entry, now);
  if (!account.displayName) throw new Error("Account display name is required.");
  const duplicate = one("SELECT id FROM bank_accounts WHERE company_id = ? AND LOWER(display_name) = LOWER(?)", [company.id, account.displayName]);
  if (duplicate) throw new Error("A bank account with this display name already exists.");
  const shouldBeDefault = Boolean(entry.isDefault) || !one("SELECT id FROM bank_accounts WHERE company_id = ? LIMIT 1", [company.id]);
  if (shouldBeDefault) run("UPDATE bank_accounts SET is_default = 0 WHERE company_id = ?", [company.id]);
  run(
    `INSERT INTO bank_accounts
      (id, company_id, display_name, bank_name, account_no, ifsc, upi_id,
       opening_balance, current_balance, as_of_date, print_upi_qr, print_bank_details,
       is_default, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      account.id,
      company.id,
      account.displayName,
      account.bankName,
      account.accountNo,
      account.ifsc,
      account.upiId,
      account.openingBalance,
      account.currentBalance,
      account.asOfDate,
      account.printUpiQr,
      account.printBankDetails,
      shouldBeDefault ? 1 : account.isDefault,
      account.notes,
      now,
      now,
    ],
  );
  ensureDefaultBankAccount(company.id);
  syncDefaultBankToBusinessSettings(company.id);
  persist();
  return getState();
}

function updateBankAccount(entry = {}) {
  const company = getCurrentCompany();
  const now = new Date().toISOString();
  const id = String(entry.bankAccountId || entry.id || "").trim();
  if (!id) throw new Error("Bank account id is required.");
  const existing = one("SELECT * FROM bank_accounts WHERE company_id = ? AND id = ?", [company.id, id]);
  if (!existing) throw new Error("Bank account not found.");
  const account = normalizeBankAccountInput({ ...entry, id }, now);
  if (!account.displayName) throw new Error("Account display name is required.");
  const duplicate = one("SELECT id FROM bank_accounts WHERE company_id = ? AND LOWER(display_name) = LOWER(?) AND id <> ?", [company.id, account.displayName, id]);
  if (duplicate) throw new Error("A bank account with this display name already exists.");
  const isDefault = entry.isDefault === undefined ? Number(existing.is_default || 0) : account.isDefault;
  if (isDefault) run("UPDATE bank_accounts SET is_default = 0 WHERE company_id = ?", [company.id]);
  run(
    `UPDATE bank_accounts SET
      display_name = ?, bank_name = ?, account_no = ?, ifsc = ?, upi_id = ?,
      opening_balance = ?, current_balance = ?, as_of_date = ?, print_upi_qr = ?,
      print_bank_details = ?, is_default = ?, notes = ?, updated_at = ?
     WHERE company_id = ? AND id = ?`,
    [
      account.displayName,
      account.bankName,
      account.accountNo,
      account.ifsc,
      account.upiId,
      account.openingBalance,
      account.currentBalance,
      account.asOfDate,
      account.printUpiQr,
      account.printBankDetails,
      isDefault ? 1 : 0,
      account.notes,
      now,
      company.id,
      id,
    ],
  );
  ensureDefaultBankAccount(company.id);
  syncDefaultBankToBusinessSettings(company.id);
  persist();
  return getState();
}

function deleteBankAccount({ bankAccountId, id } = {}) {
  const company = getCurrentCompany();
  const cleanId = String(bankAccountId || id || "").trim();
  if (!cleanId) throw new Error("Bank account id is required.");
  const existing = one("SELECT id FROM bank_accounts WHERE company_id = ? AND id = ?", [company.id, cleanId]);
  if (!existing) throw new Error("Bank account not found.");
  run("DELETE FROM bank_accounts WHERE company_id = ? AND id = ?", [company.id, cleanId]);
  ensureDefaultBankAccount(company.id);
  syncDefaultBankToBusinessSettings(company.id);
  persist();
  return getState();
}

function setDefaultBankAccount({ bankAccountId, id } = {}) {
  const company = getCurrentCompany();
  const cleanId = String(bankAccountId || id || "").trim();
  if (!cleanId) throw new Error("Bank account id is required.");
  const existing = one("SELECT id FROM bank_accounts WHERE company_id = ? AND id = ?", [company.id, cleanId]);
  if (!existing) throw new Error("Bank account not found.");
  run("UPDATE bank_accounts SET is_default = 0 WHERE company_id = ?", [company.id]);
  run("UPDATE bank_accounts SET is_default = 1, updated_at = ? WHERE company_id = ? AND id = ?", [new Date().toISOString(), company.id, cleanId]);
  syncDefaultBankToBusinessSettings(company.id);
  persist();
  return getState();
}

function normalizeBankAccountInput(entry = {}, now = new Date().toISOString()) {
  const openingBalance = Number(entry.openingBalance ?? entry.opening_balance ?? 0) || 0;
  const currentBalance = entry.currentBalance === undefined && entry.current_balance === undefined
    ? openingBalance
    : Number(entry.currentBalance ?? entry.current_balance ?? openingBalance) || 0;
  return {
    id: String(entry.bankAccountId || entry.id || makeId()).trim(),
    displayName: String(entry.displayName ?? entry.display_name ?? entry.name ?? "").trim(),
    bankName: String(entry.bankName ?? entry.bank_name ?? "").trim(),
    accountNo: String(entry.accountNo ?? entry.account_no ?? "").trim(),
    ifsc: String(entry.ifsc ?? "").trim().toUpperCase(),
    upiId: String(entry.upiId ?? entry.upi_id ?? "").trim(),
    openingBalance,
    currentBalance,
    asOfDate: String(entry.asOfDate ?? entry.as_of_date ?? now).trim(),
    printUpiQr: boolToInt(entry.printUpiQr ?? entry.print_upi_qr),
    printBankDetails: entry.printBankDetails === undefined && entry.print_bank_details === undefined ? 1 : boolToInt(entry.printBankDetails ?? entry.print_bank_details),
    isDefault: boolToInt(entry.isDefault ?? entry.is_default),
    notes: String(entry.notes ?? "").trim(),
  };
}

function boolToInt(value) {
  return value === true || value === 1 || value === "1" || value === "on" || value === "true" ? 1 : 0;
}

function ensureDefaultBankAccount(companyId) {
  const existingDefault = one("SELECT id FROM bank_accounts WHERE company_id = ? AND is_default = 1 LIMIT 1", [companyId]);
  if (existingDefault) return;
  const first = one("SELECT id FROM bank_accounts WHERE company_id = ? ORDER BY created_at, display_name LIMIT 1", [companyId]);
  if (first) run("UPDATE bank_accounts SET is_default = 1 WHERE company_id = ? AND id = ?", [companyId, first.id]);
}

function syncDefaultBankToBusinessSettings(companyId) {
  const bank = one(
    `SELECT display_name AS displayName, bank_name AS bankName, account_no AS accountNo,
      ifsc, upi_id AS upiId
     FROM bank_accounts WHERE company_id = ? AND is_default = 1 LIMIT 1`,
    [companyId],
  );
  const bankDetails = bank
    ? {
      bankName: String(bank.bankName || bank.displayName || "").trim(),
      accountNo: String(bank.accountNo || "").trim(),
      ifsc: String(bank.ifsc || "").trim().toUpperCase(),
      upiId: String(bank.upiId || "").trim(),
    }
    : { bankName: "", accountNo: "", ifsc: "", upiId: "" };
  run("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)", ["bankDetails", JSON.stringify(bankDetails)]);
}

function cleanupOrphanExpenseItems(companyId = null) {
  if (!db) return;
  try {
    const companyFilter = companyId ? "AND i.company_id = ?" : "";
    const partyCompanyFilter = companyId ? "AND parties.company_id = ?" : "";
    const params = companyId ? [companyId] : [];

    run(`
      DELETE FROM items
      WHERE id IN (
        SELECT i.id
        FROM items i
        WHERE EXISTS (
          SELECT 1 FROM transactions t
          WHERE t.company_id = i.company_id
            AND t.type = 'expense'
            AND LOWER(TRIM(t.item)) = LOWER(TRIM(i.name))
        )
        AND NOT EXISTS (SELECT 1 FROM invoice_items ii WHERE ii.item_id = i.id OR LOWER(TRIM(ii.item_name)) = LOWER(TRIM(i.name)))
        AND NOT EXISTS (SELECT 1 FROM estimate_items ei WHERE ei.item_id = i.id OR LOWER(TRIM(ei.item_name)) = LOWER(TRIM(i.name)))
        AND NOT EXISTS (SELECT 1 FROM credit_note_items cni WHERE cni.item_id = i.id OR LOWER(TRIM(cni.item_name)) = LOWER(TRIM(i.name)))
        AND NOT EXISTS (SELECT 1 FROM debit_note_items dni WHERE dni.item_id = i.id OR LOWER(TRIM(dni.item_name)) = LOWER(TRIM(i.name)))
        AND NOT EXISTS (SELECT 1 FROM stock_movements sm WHERE sm.item_id = i.id)
        AND COALESCE(i.opening_stock, 0) = 0
        AND COALESCE(i.sale_price, 0) = 0
        AND COALESCE(i.purchase_price, 0) = 0
        ${companyFilter}
      )
    `, params);

    run(`
      DELETE FROM parties
      WHERE LOWER(TRIM(name)) = 'expense'
        AND opening_balance = 0
        AND NOT EXISTS (SELECT 1 FROM invoices WHERE party_id = parties.id OR LOWER(TRIM(party)) = 'expense')
        AND NOT EXISTS (SELECT 1 FROM estimates WHERE party_id = parties.id OR LOWER(TRIM(party)) = 'expense')
        AND NOT EXISTS (SELECT 1 FROM credit_notes WHERE party_id = parties.id OR LOWER(TRIM(party)) = 'expense')
        AND NOT EXISTS (SELECT 1 FROM debit_notes WHERE party_id = parties.id OR LOWER(TRIM(party)) = 'expense')
        AND NOT EXISTS (SELECT 1 FROM payments WHERE party_id = parties.id OR LOWER(TRIM(party)) = 'expense')
        AND NOT EXISTS (SELECT 1 FROM transactions WHERE (party_id = parties.id OR LOWER(TRIM(party)) = 'expense') AND type <> 'expense')
        ${partyCompanyFilter}
    `, params);
  } catch (_e) {
    // Graceful fallback during early migration
  }
}

function createParty({
  name,
  notes = "",
  type = "party",
  phone = "",
  email = "",
  contactPerson = "",
  taxType = "unregistered",
  gstin = "",
  legalName = "",
  state = "",
  pan = "",
  billingAddress = "",
  shippingAddress = "",
  openingBalance = 0,
  openingBalanceType = "receivable",
  creditLimit = 0,
  paymentTerms = "",
  dueDays = 0,
}) {
  const company = getCurrentCompany();
  const cleanName = String(name || "").trim();
  if (!cleanName) {
    throw new Error("Party name is required.");
  }

  // 1. Check duplicate party name in company (case-insensitive & trimmed)
  const duplicateName = one(
    "SELECT id, name FROM parties WHERE company_id = ? AND LOWER(TRIM(name)) = LOWER(?)",
    [company.id, cleanName],
  );
  if (duplicateName) {
    throw new Error(`Party "${cleanName}" already exists. Please choose a different name.`);
  }

  // 2. Check duplicate phone (match trailing 10 digits if 10+ digits provided)
  const cleanPhoneDigits = String(phone || "").replace(/\D/g, "");
  if (cleanPhoneDigits.length >= 10) {
    const last10 = cleanPhoneDigits.slice(-10);
    const existingParties = all(
      "SELECT id, name, phone FROM parties WHERE company_id = ? AND phone IS NOT NULL AND phone <> ''",
      [company.id],
    );
    const duplicatePhone = existingParties.find((p) => {
      const pDigits = String(p.phone || "").replace(/\D/g, "");
      return pDigits.length >= 10 && pDigits.slice(-10) === last10;
    });
    if (duplicatePhone) {
      throw new Error(`Mobile number "${phone}" is already registered for "${duplicatePhone.name}".`);
    }
  }

  // 3. Check duplicate GSTIN in company (case-insensitive & trimmed)
  const cleanGstin = String(gstin || "").trim().toUpperCase();
  if (cleanGstin) {
    const duplicateGstin = one(
      "SELECT id, name, gstin FROM parties WHERE company_id = ? AND UPPER(TRIM(gstin)) = ?",
      [company.id, cleanGstin],
    );
    if (duplicateGstin) {
      throw new Error(`GSTIN "${cleanGstin}" is already registered for "${duplicateGstin.name}".`);
    }
  }

  const now = new Date().toISOString();
  run(
    `INSERT INTO parties
      (company_id, name, type, phone, email, contact_person, tax_type, gstin, legal_name, state, pan, billing_address, shipping_address, opening_balance, opening_balance_type, credit_limit, payment_terms, due_days, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      company.id,
      cleanName,
      type,
      phone,
      email,
      contactPerson,
      taxType,
      cleanGstin || gstin,
      legalName,
      state,
      pan,
      billingAddress,
      shippingAddress,
      openingBalance,
      openingBalanceType,
      creditLimit,
      paymentTerms,
      dueDays,
      notes,
      now,
    ],
  );

  const partyRecord = one("SELECT id FROM parties WHERE company_id = ? AND LOWER(TRIM(name)) = LOWER(?)", [company.id, cleanName]);
  recordAuditLog(company.id, "CREATE", "party", partyRecord ? partyRecord.id : cleanName, cleanName, { type, phone, gstin: cleanGstin || gstin });
  persist();
  return getState();
}

function updateParty({
  id,
  name,
  notes = "",
  type = "party",
  phone = "",
  email = "",
  contactPerson = "",
  taxType = "unregistered",
  gstin = "",
  legalName = "",
  state = "",
  pan = "",
  billingAddress = "",
  shippingAddress = "",
  openingBalance = 0,
  openingBalanceType = "receivable",
  creditLimit = 0,
  paymentTerms = "",
  dueDays = 0,
}) {
  const company = getCurrentCompany();
  if (!id) throw new Error("Party ID is required.");
  const cleanName = String(name || "").trim();
  if (!cleanName) throw new Error("Party name is required.");

  const existing = one("SELECT id, name FROM parties WHERE company_id = ? AND id = ?", [company.id, id]);
  if (!existing) throw new Error("Party not found.");

  // 1. Check duplicate party name
  const duplicateName = one(
    "SELECT id, name FROM parties WHERE company_id = ? AND LOWER(TRIM(name)) = LOWER(?) AND id <> ?",
    [company.id, cleanName, id],
  );
  if (duplicateName) {
    throw new Error(`Party "${cleanName}" already exists. Please choose a different name.`);
  }

  // 2. Check duplicate phone
  const cleanPhoneDigits = String(phone || "").replace(/\D/g, "");
  if (cleanPhoneDigits.length >= 10) {
    const last10 = cleanPhoneDigits.slice(-10);
    const existingParties = all(
      "SELECT id, name, phone FROM parties WHERE company_id = ? AND id <> ? AND phone IS NOT NULL AND phone <> ''",
      [company.id, id],
    );
    const duplicatePhone = existingParties.find((p) => {
      const pDigits = String(p.phone || "").replace(/\D/g, "");
      return pDigits.length >= 10 && pDigits.slice(-10) === last10;
    });
    if (duplicatePhone) {
      throw new Error(`Mobile number "${phone}" is already registered for "${duplicatePhone.name}".`);
    }
  }

  // 3. Check duplicate GSTIN
  const cleanGstin = String(gstin || "").trim().toUpperCase();
  if (cleanGstin) {
    const duplicateGstin = one(
      "SELECT id, name, gstin FROM parties WHERE company_id = ? AND UPPER(TRIM(gstin)) = ? AND id <> ?",
      [company.id, cleanGstin, id],
    );
    if (duplicateGstin) {
      throw new Error(`GSTIN "${cleanGstin}" is already registered for "${duplicateGstin.name}".`);
    }
  }

  run(
    `UPDATE parties SET
      name = ?,
      type = ?,
      phone = ?,
      email = ?,
      contact_person = ?,
      tax_type = ?,
      gstin = ?,
      legal_name = ?,
      state = ?,
      pan = ?,
      billing_address = ?,
      shipping_address = ?,
      opening_balance = ?,
      opening_balance_type = ?,
      credit_limit = ?,
      payment_terms = ?,
      due_days = ?,
      notes = ?
     WHERE company_id = ? AND id = ?`,
    [
      cleanName,
      type,
      phone,
      email,
      contactPerson,
      taxType,
      cleanGstin || gstin,
      legalName,
      state,
      pan,
      billingAddress,
      shippingAddress,
      openingBalance,
      openingBalanceType,
      creditLimit,
      paymentTerms,
      dueDays,
      notes,
      company.id,
      id,
    ],
  );

  if (existing.name !== cleanName) {
    // Historical documents retain the party name captured when they were issued.
  }

  recordAuditLog(company.id, "UPDATE", "party", id, cleanName, { type, phone, gstin: cleanGstin || gstin });
  persist();
  return getState();
}

function updatePartyDetails(companyId, {
  name,
  type = "",
  phone = "",
  email = "",
  contactPerson = "",
  taxType = "",
  gstin = "",
  legalName = "",
  state = "",
  pan = "",
  billingAddress = "",
  shippingAddress = "",
  openingBalance = null,
  openingBalanceType = "",
  creditLimit = null,
  paymentTerms = "",
  dueDays = null,
  notes = "",
}) {
  run(
    `UPDATE parties SET
      type = COALESCE(NULLIF(?, ''), type),
      phone = COALESCE(NULLIF(?, ''), phone),
      email = COALESCE(NULLIF(?, ''), email),
      contact_person = COALESCE(NULLIF(?, ''), contact_person),
      tax_type = COALESCE(NULLIF(?, ''), tax_type),
      gstin = COALESCE(NULLIF(?, ''), gstin),
      legal_name = COALESCE(NULLIF(?, ''), legal_name),
      state = COALESCE(NULLIF(?, ''), state),
      pan = COALESCE(NULLIF(?, ''), pan),
      billing_address = COALESCE(NULLIF(?, ''), billing_address),
      shipping_address = COALESCE(NULLIF(?, ''), shipping_address),
      opening_balance = CASE WHEN ? IS NOT NULL THEN ? ELSE opening_balance END,
      opening_balance_type = COALESCE(NULLIF(?, ''), opening_balance_type),
      credit_limit = CASE WHEN ? IS NOT NULL THEN ? ELSE credit_limit END,
      payment_terms = COALESCE(NULLIF(?, ''), payment_terms),
      due_days = CASE WHEN ? IS NOT NULL THEN ? ELSE due_days END,
      notes = COALESCE(NULLIF(?, ''), notes)
     WHERE company_id = ? AND name = ?`,
    [
      type,
      phone,
      email,
      contactPerson,
      taxType,
      gstin,
      legalName,
      state,
      pan,
      billingAddress,
      shippingAddress,
      openingBalance,
      openingBalance,
      openingBalanceType,
      creditLimit,
      creditLimit,
      paymentTerms,
      dueDays,
      dueDays,
      notes,
      companyId,
      name,
    ],
  );
}

function createItem({
  name,
  notes = "",
  itemType = "product",
  sku = "",
  category = "",
  unit = "",
  hsnSac = "",
  salePrice = 0,
  saleTaxType = "without_tax",
  purchasePrice = 0,
  purchaseTaxType = "without_tax",
  taxRate = 0,
  discount = 0,
  openingStock = 0,
  openingStockDate = "",
  openingStockValue = 0,
  storageLocation = "",
  lowStockAlert = 0,
  description = "",
}) {
  const company = getCurrentCompany();
  const now = new Date().toISOString();
  if (!name) return getState();
  ensureUnit(company.id, unit);
  ensureItemCategory(company.id, category);

  let unitId = null;
  let categoryId = null;
  if (unit) {
    const u = one("SELECT id FROM units WHERE company_id = ? AND LOWER(name) = LOWER(?)", [company.id, unit]);
    unitId = u?.id || null;
  }
  if (category) {
    const c = one("SELECT id FROM item_categories WHERE company_id = ? AND LOWER(name) = LOWER(?)", [company.id, category]);
    categoryId = c?.id || null;
  }

  run(
    `INSERT OR IGNORE INTO items
      (company_id, name, item_type, sku, category, unit, category_id, unit_id, hsn_sac, sale_price, sale_tax_type,
       purchase_price, purchase_tax_type, tax_rate, discount, opening_stock, opening_stock_date,
       opening_stock_value, storage_location, low_stock_alert, description, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      company.id,
      name,
      itemType,
      sku,
      category,
      unit,
      categoryId,
      unitId,
      hsnSac,
      salePrice,
      saleTaxType,
      purchasePrice,
      purchaseTaxType,
      taxRate,
      discount,
      openingStock,
      openingStockDate,
      openingStockValue,
      storageLocation,
      lowStockAlert,
      description,
      notes,
      now,
    ],
  );
  run(
    `UPDATE items SET
      item_type = COALESCE(NULLIF(?, ''), item_type),
      sku = COALESCE(NULLIF(?, ''), sku),
      category = COALESCE(NULLIF(?, ''), category),
      unit = COALESCE(NULLIF(?, ''), unit),
      hsn_sac = COALESCE(NULLIF(?, ''), hsn_sac),
      sale_price = ?,
      sale_tax_type = COALESCE(NULLIF(?, ''), sale_tax_type),
      purchase_price = ?,
      purchase_tax_type = COALESCE(NULLIF(?, ''), purchase_tax_type),
      tax_rate = ?,
      discount = ?,
      opening_stock = ?,
      opening_stock_date = COALESCE(NULLIF(?, ''), opening_stock_date),
      opening_stock_value = ?,
      storage_location = COALESCE(NULLIF(?, ''), storage_location),
      low_stock_alert = ?,
      description = COALESCE(NULLIF(?, ''), description),
      notes = COALESCE(NULLIF(?, ''), notes)
     WHERE company_id = ? AND name = ?`,
    [
      itemType,
      sku,
      category,
      unit,
      hsnSac,
      salePrice,
      saleTaxType,
      purchasePrice,
      purchaseTaxType,
      taxRate,
      discount,
      openingStock,
      openingStockDate,
      openingStockValue,
      storageLocation,
      lowStockAlert,
      description,
      notes,
      company.id,
      name,
    ],
  );
  const itemRecord = one("SELECT id FROM items WHERE company_id = ? AND LOWER(name) = LOWER(?)", [company.id, name]);
  recordAuditLog(company.id, "CREATE", "item", itemRecord ? itemRecord.id : name, name, { salePrice, purchasePrice, taxRate, unit });
  persist();
  return getState();
}

function updateItem(payload) {
  return inDatabaseTransaction(() => updateItemUnsafe(payload));
}

function updateItemUnsafe({
  id,
  name,
  notes = "",
  itemType = "product",
  sku = "",
  category = "",
  unit = "",
  hsnSac = "",
  salePrice = 0,
  saleTaxType = "without_tax",
  purchasePrice = 0,
  purchaseTaxType = "without_tax",
  taxRate = 0,
  discount = 0,
  openingStock = 0,
  openingStockDate = "",
  openingStockValue = 0,
  storageLocation = "",
  lowStockAlert = 0,
  description = "",
}) {
  const company = getCurrentCompany();
  const cleanName = String(name || "").trim();
  if (!id || !cleanName) return getState();
  const existing = one("SELECT id, name, opening_stock AS openingStock, opening_stock_value AS openingStockValue FROM items WHERE company_id = ? AND id = ?", [company.id, id]);
  if (!existing) return getState();
  if (arguments[0].openingStock === undefined) openingStock = existing.openingStock;
  if (arguments[0].openingStockValue === undefined) openingStockValue = existing.openingStockValue;
  if (Number(openingStock) !== Number(existing.openingStock) || Number(openingStockValue) !== Number(existing.openingStockValue)) {
    throw new Error('Use Stock Adjustment to change existing opening stock or value.');
  }
  const duplicate = one("SELECT id FROM items WHERE company_id = ? AND LOWER(name) = LOWER(?) AND id <> ?", [company.id, cleanName, id]);
  if (duplicate) throw new Error("An item with this name already exists.");

  ensureUnit(company.id, unit);
  ensureItemCategory(company.id, category);

  let unitId = null;
  let categoryId = null;
  if (unit) {
    const u = one("SELECT id FROM units WHERE company_id = ? AND LOWER(name) = LOWER(?)", [company.id, unit]);
    unitId = u?.id || null;
  }
  if (category) {
    const c = one("SELECT id FROM item_categories WHERE company_id = ? AND LOWER(name) = LOWER(?)", [company.id, category]);
    categoryId = c?.id || null;
  }

  run(
    `UPDATE items SET
      name = ?,
      item_type = ?,
      sku = ?,
      category = ?,
      unit = ?,
      category_id = ?,
      unit_id = ?,
      hsn_sac = ?,
      sale_price = ?,
      sale_tax_type = ?,
      purchase_price = ?,
      purchase_tax_type = ?,
      tax_rate = ?,
      discount = ?,
      opening_stock = ?,
      opening_stock_date = ?,
      opening_stock_value = ?,
      storage_location = ?,
      low_stock_alert = ?,
      description = ?,
      notes = ?
     WHERE company_id = ? AND id = ?`,
    [
      cleanName,
      itemType,
      sku,
      category,
      unit,
      categoryId,
      unitId,
      hsnSac,
      salePrice,
      saleTaxType,
      purchasePrice,
      purchaseTaxType,
      taxRate,
      discount,
      openingStock,
      openingStockDate,
      openingStockValue,
      storageLocation,
      lowStockAlert,
      description,
      notes,
      company.id,
      id,
    ],
  );

  if (existing.name !== cleanName) {
    run("UPDATE invoice_items SET item_name = ? WHERE item_id = ? OR (item_name = ? AND invoice_id IN (SELECT id FROM invoices WHERE company_id = ?))", [cleanName, id, existing.name, company.id]);
    run("UPDATE stock_movements SET item_name = ? WHERE company_id = ? AND (item_id = ? OR item_name = ?)", [cleanName, company.id, id, existing.name]);
    run("UPDATE transactions SET item = ? WHERE company_id = ? AND item = ?", [cleanName, company.id, existing.name]);
  }

  recordAuditLog(company.id, "UPDATE", "item", id, cleanName, { salePrice, purchasePrice, taxRate, unit });
  persist();
  return getState();
}

function createTransaction(entry) {
  return inDatabaseTransaction(() => createTransactionUnsafe(entry));
}

function updatePurchaseDefaults(companyId, entry, lines) {
  if (entry.type !== "purchase" || entry.updatePurchaseDefaults !== true) return;
  const prices = new Map();
  for (const line of lines) {
    const item = one("SELECT unit, purchase_price AS price, purchase_tax_type AS taxType, opening_stock AS openingQty, opening_stock_value AS openingValue FROM items WHERE company_id = ? AND id = ?", [companyId, line.itemId]);
    if (line.unit !== item.unit) throw new Error("Default purchase prices can only be updated in the item's base unit.");
    const price = item.taxType === 'with_tax' ? line.price * (1 + line.taxRate / 100) : line.price;
    if (prices.has(line.itemId) && Math.abs(prices.get(line.itemId).price - price) > 0.000001) throw new Error("The same item has different rates. Uncheck Update default purchase prices before saving.");
    prices.set(line.itemId, { price, item });
  }
  for (const [itemId, { price, item }] of prices) {
    // Preserve the legacy opening-value fallback before changing the suggested rate.
    if (item.openingQty > 0 && !item.openingValue && item.price > 0) {
      run("UPDATE items SET opening_stock_value = ? WHERE company_id = ? AND id = ?", [item.openingQty * item.price, companyId, itemId]);
    }
    run("UPDATE items SET purchase_price = ? WHERE company_id = ? AND id = ?", [price, companyId, itemId]);
    recordAuditLog(companyId, "UPDATE_PURCHASE_PRICE", "item", String(itemId), entry.invoiceNo || "", { previousPrice: item.price, purchasePrice: price });
  }
}

function createTransactionUnsafe(entry) {
  const company = getCurrentCompany();
  const now = new Date().toISOString();
  const sourceEstimateId = entry.meta?.sourceEstimateId;
  if (sourceEstimateId) {
    const source = one('SELECT status, converted_invoice_id AS invoiceId, document_type AS documentType, party FROM estimates WHERE company_id = ? AND id = ?', [company.id, sourceEstimateId]);
    if (!source || source.invoiceId || ['converted', 'cancelled'].includes(source.status)) throw new Error('Source document is unavailable or already converted.');
    const targetType = source.documentType === 'purchase_order' ? 'purchase' : 'sale';
    if (entry.type !== targetType || source.party !== entry.party) throw new Error('Conversion must preserve the document party and direction.');
  }
  const isInvoiceTransaction = entry.type === "sale" || entry.type === "purchase";
  if (isInvoiceTransaction) {
    validateInvoiceMasterData(company.id, entry);
  }
  const invoiceId = entry.invoiceId || (isInvoiceTransaction ? makeId() : null);
  const transaction = {
    id: entry.id || makeId(),
    invoiceId,
    type: entry.type,
    party: entry.party || "Cash",
    partyId: resolvePartyId(company.id, entry.partyId, entry.party),
    item: entry.item || "",
    amount: Number(entry.amount || 0),
    paymentType: entry.paymentType || "cash",
    status: entry.status || "paid",
    notes: entry.notes || "",
    date: entry.date || now,
    invoiceNo: entry.invoiceNo || nextInvoiceNumber(company.id, entry.type),
    metaJson: normalizeMetaJson({
      ...(entry.meta ?? (typeof entry.metaJson === "string" ? JSON.parse(entry.metaJson || "{}") : entry.metaJson) ?? {}),
      ...(entry.taxRate !== undefined ? { taxRate: Number(entry.taxRate || 0) } : {}),
    }),
  };
  const taxContext = invoiceTaxContext(company.id, entry);
  const invoiceItems = isInvoiceTransaction && Array.isArray(entry.items) ? normalizeInvoiceItems(company.id, entry.type, entry.items, taxContext) : [];
  if (entry.type === "sale") validateSaleStock(company.id, invoiceItems);
  const invoiceTotals = calculateInvoiceTotals(invoiceItems, transaction.amount, Number(entry.received || 0), entry.meta?.roundOff === true);
  validateWalkInBalance(entry, transaction.partyId, invoiceTotals);

  if (isInvoiceTransaction && transaction.invoiceNo) {
    const existingInv = one(
      "SELECT id FROM invoices WHERE company_id = ? AND type = ? AND invoice_no = ?",
      [company.id, transaction.type, transaction.invoiceNo]
    );
    if (existingInv) {
      const docLabel = transaction.type === "sale" ? "Invoice" : "Purchase Bill";
      throw new Error(`${docLabel} number "${transaction.invoiceNo}" already exists. Please use a unique number.`);
    }
  }
  if (isInvoiceTransaction) {
    transaction.amount = invoiceTotals.total;
    transaction.status = invoiceTotals.balance <= 0 ? "paid" : "due";
  } else {
    transaction.status = normalizeStandaloneTransactionStatus(entry.status, transaction.amount, entry.paid ?? entry.received);
  }

  run(
    `INSERT INTO transactions
      (id, company_id, invoice_id, invoice_no, type, party, party_id, item, amount, payment_type, status, notes, meta_json, transaction_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      transaction.id,
      company.id,
      transaction.invoiceId,
      transaction.invoiceNo,
      transaction.type,
      transaction.party,
      transaction.partyId,
      transaction.item,
      transaction.amount,
      transaction.paymentType,
      transaction.status,
      transaction.notes,
      transaction.metaJson,
      transaction.date,
      now,
      now,
    ],
  );

  if (transaction.invoiceId && (transaction.type === "sale" || transaction.type === "purchase")) {
    createInvoiceRecord(company.id, transaction, entry, invoiceItems, invoiceTotals, now);
    postStockMovements(company.id, transaction, invoiceItems, now);
    postTaxEntries(company.id, transaction, invoiceItems, now);
    transaction.subtotal = invoiceTotals.subtotal;
    transaction.cgstTotal = invoiceTotals.cgstTotal;
    transaction.sgstTotal = invoiceTotals.sgstTotal;
    transaction.igstTotal = invoiceTotals.igstTotal;
    transaction.cessTotal = invoiceTotals.cessTotal;
    if (transaction.invoiceNo) {
      syncDocumentSequence(company.id, transaction.type, transaction.invoiceNo, transaction.date);
    }
  }

  if (transaction.party && transaction.party.toLowerCase() !== "expense" && transaction.type !== "sale" && transaction.type !== "purchase" && transaction.type !== "expense") {
    createPartyWithoutPersist(company.id, transaction.party, {
      type: transaction.type === "sale" ? "customer" : transaction.type === "purchase" ? "supplier" : "both",
      phone: entry.phone || "",
      billingAddress: entry.billingAddress || "",
      paymentTerms: entry.paymentTerms || "",
    });
  }
  if (invoiceItems.length && transaction.type !== "sale" && transaction.type !== "purchase" && transaction.type !== "expense") {
    invoiceItems.forEach((item) => createItemWithoutPersist(company.id, item.item));
  } else if (transaction.item && transaction.type !== "sale" && transaction.type !== "purchase" && transaction.type !== "expense") {
    createItemWithoutPersist(company.id, transaction.item);
  }
  postLedger(company.id, transaction);
  if (transaction.type === "expense") {
    postExpenseTaxEntries(company.id, transaction, now);
  }
  if (transaction.invoiceId && invoiceTotals.received > 0) {
    createInitialPayment(company.id, transaction, invoiceTotals.received, entry.paymentMethod || "Cash", now);
  }
  if (sourceEstimateId) {
    run("UPDATE estimates SET status = 'converted', converted_invoice_id = ?, updated_at = ? WHERE company_id = ? AND id = ?", [transaction.invoiceId, now, company.id, sourceEstimateId]);
    recordAuditLog(company.id, 'CONVERT', 'estimate', sourceEstimateId, transaction.invoiceNo, { invoiceId: transaction.invoiceId });
  }
  updatePurchaseDefaults(company.id, entry, invoiceItems);
  recordAuditLog(
    company.id,
    "CREATE",
    isInvoiceTransaction ? "invoice" : "transaction",
    isInvoiceTransaction ? transaction.invoiceId : transaction.id,
    transaction.invoiceNo,
    {
      type: transaction.type,
      total: transaction.amount,
      party: transaction.party,
      received: isInvoiceTransaction ? invoiceTotals.received : 0,
      balance: isInvoiceTransaction ? invoiceTotals.balance : 0,
    }
  );
  persist();
  return getState();
}

function postExpenseTaxEntries(companyId, transaction, now) {
  run("DELETE FROM tax_entries WHERE company_id = ? AND source_type = 'expense' AND source_id = ?", [companyId, transaction.id]);
  const meta = parseMetaJson(transaction.metaJson || transaction.meta || {});
  let taxRate = Number(meta.taxRate || transaction.taxRate || 0);
  let taxable = Number(meta.taxableValue || 0);
  let cgst = Number(meta.cgstTotal || 0);
  let sgst = Number(meta.sgstTotal || 0);
  let igst = Number(meta.igstTotal || 0);
  let totalTax = cgst + sgst + igst;

  if (taxRate > 0 && totalTax <= 0) {
    const totalAmount = Number(transaction.amount || 0);
    if (!taxable) {
      taxable = Math.round((totalAmount / (1 + taxRate / 100)) * 100) / 100;
    }
    const calcTax = Math.round((totalAmount - taxable) * 100) / 100;
    const taxContext = invoiceTaxContext(companyId, { placeOfSupply: meta.placeOfSupply });
    const isInterstate = Boolean(meta.placeOfSupply && meta.placeOfSupply !== taxContext.firmState);
    if (isInterstate) {
      igst = calcTax;
    } else {
      cgst = Math.round((calcTax / 2) * 100) / 100;
      sgst = Math.round((calcTax - cgst) * 100) / 100;
    }
    totalTax = calcTax;
  }

  if (totalTax <= 0 && taxRate <= 0) return;

  const placeOfSupply = String(meta.placeOfSupply || "").trim();
  const partyGstin = String(meta.partyGstin || "").trim().toUpperCase();
  const supplyType = partyGstin ? "b2b" : "b2c";
  const docNo = String(transaction.invoiceNo || meta.referenceNo || transaction.id).trim();

  run(`
    INSERT INTO tax_entries
      (company_id, source_type, source_id, document_no, document_date, party_id,
       party_name, party_gstin, place_of_supply, supply_type, hsn_sac, tax_rate,
       taxable_value, cgst, sgst, igst, cess, is_reverse_charge, is_cancelled, created_at)
    VALUES (?, 'expense', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?)
  `, [
    companyId,
    transaction.id,
    docNo,
    transaction.date,
    transaction.partyId || null,
    transaction.party || "Expense",
    partyGstin,
    placeOfSupply,
    supplyType,
    meta.hsnSac || "",
    taxRate,
    taxable || (Number(transaction.amount || 0) - totalTax),
    cgst,
    sgst,
    igst,
    now
  ]);
}

function updateTransaction(entry) {
  return inDatabaseTransaction(() => updateTransactionUnsafe(entry));
}

function updateTransactionUnsafe(entry) {
  const company = getCurrentCompany();
  const now = new Date().toISOString();
  const transactionId = String(entry.transactionId || entry.id || "").trim();
  if (!transactionId) throw new Error("Transaction id is required for editing.");
  const existing = one("SELECT id, invoice_id AS invoiceId, type, invoice_no AS invoiceNo, created_at AS createdAt FROM transactions WHERE company_id = ? AND id = ?", [company.id, transactionId]);
  if (!existing) throw new Error("Transaction not found.");
  if (existing.invoiceId) throw new Error("Invoice transactions must be edited from the invoice screen.");

  const type = entry.type || existing.type;
  const amount = Number(entry.amount || 0);
  const transaction = {
    id: transactionId,
    invoiceId: null,
    invoiceNo: entry.invoiceNo || existing.invoiceNo || nextInvoiceNumber(company.id, type),
    type,
    party: entry.party || "Cash",
    item: entry.item || "",
    amount,
    paymentType: entry.paymentType || "cash",
    status: normalizeStandaloneTransactionStatus(entry.status, amount, entry.paid ?? entry.received),
    notes: entry.notes || "",
    date: entry.date || now,
    metaJson: normalizeMetaJson({
      ...(entry.meta ?? (typeof entry.metaJson === "string" ? JSON.parse(entry.metaJson || "{}") : entry.metaJson) ?? {}),
      ...(entry.taxRate !== undefined ? { taxRate: Number(entry.taxRate || 0) } : {}),
    }),
  };

  run("DELETE FROM ledger_entries WHERE transaction_id = ?", [transactionId]);
  run(
    `UPDATE transactions SET
      invoice_no = ?, type = ?, party = ?, item = ?, amount = ?, payment_type = ?,
      status = ?, notes = ?, meta_json = ?, transaction_date = ?, updated_at = ?
     WHERE company_id = ? AND id = ?`,
    [
      transaction.invoiceNo,
      transaction.type,
      transaction.party,
      transaction.item,
      transaction.amount,
      transaction.paymentType,
      transaction.status,
      transaction.notes,
      transaction.metaJson,
      transaction.date,
      now,
      company.id,
      transactionId,
    ],
  );
  postLedger(company.id, transaction);
  if (transaction.type === "expense") {
    postExpenseTaxEntries(company.id, transaction, now);
  }
  persist();
  return getState();
}

function deleteTransaction(payload) {
  return inDatabaseTransaction(() => deleteTransactionUnsafe(payload));
}

function deleteTransactionUnsafe({ transactionId, id }) {
  const company = getCurrentCompany();
  const cleanId = String(transactionId || id || "").trim();
  if (!cleanId) throw new Error("Transaction id is required.");
  const existing = one("SELECT id, invoice_id AS invoiceId, type, invoice_no AS invoiceNo FROM transactions WHERE company_id = ? AND id = ?", [company.id, cleanId]);
  if (!existing) throw new Error("Transaction not found.");
  if (existing.invoiceId) throw new Error("Invoice transactions must be deleted from the invoice screen.");
  run("DELETE FROM tax_entries WHERE company_id = ? AND source_type = 'expense' AND source_id = ?", [company.id, cleanId]);
  run("DELETE FROM payments WHERE company_id = ? AND (transaction_id = ? OR id = ?)", [company.id, cleanId, cleanId]);
  run("DELETE FROM ledger_entries WHERE transaction_id = ?", [cleanId]);
  run("DELETE FROM transactions WHERE company_id = ? AND id = ?", [company.id, cleanId]);
  recordAuditLog(company.id, "DELETE", "transaction", cleanId, existing.invoiceNo || null, { type: existing.type });
  persist();
  return getState();
}

function updateInvoice(entry) {
  return inDatabaseTransaction(() => updateInvoiceUnsafe(entry));
}

function updateInvoiceUnsafe(entry) {
  const company = getCurrentCompany();
  const now = new Date().toISOString();
  const invoiceId = String(entry.invoiceId || "").trim();
  if (!invoiceId) throw new Error("Invoice id is required for editing.");
  const existing = one(
    `SELECT i.id, i.transaction_id AS transactionId, i.type, i.invoice_no AS invoiceNo, i.status, i.party_id AS partyId
     FROM invoices i
     WHERE i.company_id = ? AND i.id = ?`,
    [company.id, invoiceId],
  );
  if (!existing) throw new Error("Invoice not found.");
  const type = entry.type || existing.type;
  if (existing.status === 'cancelled') throw new Error('Cannot edit a cancelled invoice.');
  if (type !== existing.type) throw new Error('Cannot change an invoice between sale and purchase.');
  if (type !== "sale" && type !== "purchase") throw new Error("Only sale and purchase invoices can be edited.");

  validateInvoiceMasterData(company.id, { ...entry, type });
  const transactionId = existing.transactionId || entry.id || makeId();
  const invoiceNo = entry.invoiceNo || existing.invoiceNo || nextInvoiceNumber(company.id, type);
  if (invoiceNo !== existing.invoiceNo) {
    const dup = one(
      "SELECT id FROM invoices WHERE company_id = ? AND type = ? AND invoice_no = ? AND id != ?",
      [company.id, type, invoiceNo, invoiceId]
    );
    if (dup) {
      const docLabel = type === "sale" ? "Invoice" : "Purchase Bill";
      throw new Error(`${docLabel} number "${invoiceNo}" is already in use by another invoice. Please choose a unique number.`);
    }
  }
  const transactionDate = entry.date || now;
  const metaJson = normalizeMetaJson(entry.meta ?? entry.metaJson ?? {});
  const taxContext = invoiceTaxContext(company.id, entry);
  const invoiceItems = normalizeInvoiceItems(company.id, type, entry.items || [], taxContext);
  if (type === "sale") validateSaleStock(company.id, invoiceItems, invoiceId);
  const recordedPayments = all('SELECT id, type, amount, method, payment_date AS date, notes FROM payments WHERE company_id = ? AND invoice_id = ?', [company.id, invoiceId]);
  const recordedAmount = recordedPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const requestedReceived = entry.received === undefined ? recordedAmount : Number(entry.received);
  if (recordedPayments.length && (Math.abs(requestedReceived - recordedAmount) > 0.000001 || resolvePartyId(company.id, entry.partyId, entry.party) !== existing.partyId)) {
    throw new Error('Recorded payments must be preserved. Use the payment workflow to change payments.');
  }
  const invoiceTotals = calculateInvoiceTotals(invoiceItems, Number(entry.amount || 0), requestedReceived, entry.meta?.roundOff === true);
  validateWalkInBalance(entry, resolvePartyId(company.id, entry.partyId, entry.party), invoiceTotals);
  if (type === 'purchase') validatePurchaseRemoval(company.id, invoiceId, invoiceItems);
  if (recordedAmount > invoiceTotals.total) throw new Error('Invoice total cannot be less than recorded payments.');
  const transaction = {
    id: transactionId,
    invoiceId,
    invoiceNo,
    type,
    party: entry.party || "Cash",
    item: entry.item || "",
    amount: invoiceTotals.total,
    paymentType: entry.paymentType || "cash",
    status: invoiceTotals.balance <= 0 ? "paid" : "due",
    notes: entry.notes || "",
    date: transactionDate,
  };

  run("DELETE FROM invoice_items WHERE invoice_id = ?", [invoiceId]);
  run("DELETE FROM stock_movements WHERE company_id = ? AND invoice_id = ?", [company.id, invoiceId]);
  run("DELETE FROM ledger_entries WHERE transaction_id = ?", [transactionId]);

  run(
    `UPDATE transactions SET
      invoice_id = ?, invoice_no = ?, type = ?, party = ?, item = ?, amount = ?,
      payment_type = ?, status = ?, notes = ?, meta_json = ?, transaction_date = ?
     WHERE company_id = ? AND id = ?`,
    [
      invoiceId,
      invoiceNo,
      type,
      transaction.party,
      transaction.item,
      transaction.amount,
      transaction.paymentType,
      transaction.status,
      transaction.notes,
      metaJson,
      transactionDate,
      company.id,
      transactionId,
    ],
  );

  run(
    `UPDATE invoices SET
      transaction_id = ?, invoice_no = ?, type = ?, party = ?, phone = ?, billing_address = ?,
      invoice_date = ?, due_date = ?, payment_terms = ?, payment_type = ?, supply_type = ?,
      place_of_supply = ?, party_gstin = ?, party_tax_type = ?, subtotal = ?, discount_total = ?,
      tax_total = ?, cgst_total = ?, sgst_total = ?, igst_total = ?, cess_total = ?, total = ?,
      received = ?, balance = ?, status = ?, notes = ?, meta_json = ?
     WHERE company_id = ? AND id = ?`,
    [
      transactionId,
      invoiceNo,
      type,
      transaction.party,
      entry.phone || "",
      entry.billingAddress || "",
      transactionDate,
      entry.dueDate || "",
      entry.paymentTerms || "",
      entry.paymentType || transaction.paymentType || "cash",
      taxContext.supplyType,
      taxContext.placeOfSupply,
      taxContext.partyGstin,
      taxContext.partyTaxType,
      invoiceTotals.subtotal,
      invoiceTotals.discountTotal,
      invoiceTotals.taxTotal,
      invoiceTotals.cgstTotal,
      invoiceTotals.sgstTotal,
      invoiceTotals.igstTotal,
      invoiceTotals.cessTotal,
      invoiceTotals.total,
      invoiceTotals.received,
      invoiceTotals.balance,
      invoiceTotals.balance <= 0 ? "paid" : invoiceTotals.received > 0 ? "partially_paid" : "unpaid",
      transaction.notes,
      metaJson,
      company.id,
      invoiceId,
    ],
  );

  invoiceItems.forEach((item, index) => {
    run(
      `INSERT INTO invoice_items
        (invoice_id, item_id, line_no, item_name, description, quantity, unit, price, discount,
         hsn_sac, taxable_value, tax_rate, tax_amount, cgst_amount, sgst_amount, igst_amount, cess_amount, line_total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceId,
        item.itemId,
        index + 1,
        item.item,
        item.description,
        item.qty,
        item.unit,
        item.price,
        item.discount,
        item.hsnSac,
        item.taxableValue,
        item.taxRate,
        item.taxAmount,
        item.cgstAmount,
        item.sgstAmount,
        item.igstAmount,
        item.cessAmount,
        item.lineTotal,
      ],
    );
  });

  postStockMovements(company.id, transaction, invoiceItems, now);
  postTaxEntries(company.id, transaction, invoiceItems, now);
  transaction.subtotal = invoiceTotals.subtotal;
  transaction.cgstTotal = invoiceTotals.cgstTotal;
  transaction.sgstTotal = invoiceTotals.sgstTotal;
  transaction.igstTotal = invoiceTotals.igstTotal;
  transaction.cessTotal = invoiceTotals.cessTotal;
  postLedger(company.id, transaction);
  recordedPayments.forEach((payment) => postPaymentLedger(company.id, transaction, payment));
  if (!recordedPayments.length && invoiceTotals.received > 0) {
    createInitialPayment(company.id, transaction, invoiceTotals.received, entry.paymentMethod || "Cash", now);
  }
  updatePurchaseDefaults(company.id, { ...entry, type }, invoiceItems);
  recordAuditLog(
    company.id,
    "UPDATE",
    "invoice",
    invoiceId,
    invoiceNo,
    {
      type,
      total: invoiceTotals.total,
      party: entry.party || "Cash",
      received: requestedReceived,
      balance: invoiceTotals.balance,
    }
  );
  persist();
  return getState();
}

function createEstimate(entry) {
  return inDatabaseTransaction(() => createEstimateUnsafe(entry));
}

function normalizeDocumentType(type) {
  const t = String(type || "estimate").trim().toLowerCase().replace(/\s+/g, "_");
  if (t === "proforma") return "proforma";
  if (t === "sale_order" || t === "saleorder") return "sale_order";
  if (t === "delivery_challan" || t === "deliverychallan") return "delivery_challan";
  if (t === "purchase_order" || t === "purchaseorder") return "purchase_order";
  return "estimate";
}

function createEstimateUnsafe(entry) {
  const company = getCurrentCompany();
  const now = new Date().toISOString();
  validateEstimateMasterData(company.id, entry);

  const docType = normalizeDocumentType(entry.documentType || entry.type);
  const estimateId = entry.estimateId || entry.quoteId || entry.id || makeId();
  const quoteNo = entry.quoteNo || entry.invoiceNo || nextInvoiceNumber(company.id, docType);
  if (quoteNo) {
    const dup = one(
      "SELECT id FROM estimates WHERE company_id = ? AND document_type = ? AND quote_no = ?",
      [company.id, docType, quoteNo]
    );
    if (dup) {
      throw new Error(`Document number "${quoteNo}" already exists for ${docType.replace('_', ' ')}. Please use a unique number.`);
    }
  }
  const quoteDate = entry.date || entry.quoteDate || now;
  const metaJson = normalizeMetaJson(entry.meta ?? entry.metaJson ?? {});
  const taxContext = invoiceTaxContext(company.id, entry);
  const estimateItems = normalizeInvoiceItems(company.id, docType, entry.items || [], taxContext);
  const totals = calculateInvoiceTotals(estimateItems, Number(entry.amount || 0), 0);

  run(
    `INSERT INTO estimates
      (id, company_id, quote_no, party, phone, billing_address, quote_date, valid_until,
       payment_terms, supply_type, place_of_supply, party_gstin, party_tax_type,
       subtotal, discount_total, tax_total, cgst_total, sgst_total, igst_total, cess_total,
       total, status, notes, converted_invoice_id, document_type, meta_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      estimateId,
      company.id,
      quoteNo,
      String(entry.party || "").trim(),
      entry.phone || "",
      entry.billingAddress || "",
      quoteDate,
      entry.validUntil || entry.dueDate || "",
      entry.paymentTerms || "",
      taxContext.supplyType,
      taxContext.placeOfSupply,
      taxContext.partyGstin,
      taxContext.partyTaxType,
      totals.subtotal,
      totals.discountTotal,
      totals.taxTotal,
      totals.cgstTotal,
      totals.sgstTotal,
      totals.igstTotal,
      totals.cessTotal,
      totals.total,
      normalizeEstimateStatus(entry.status || "draft"),
      entry.notes || "",
      entry.convertedInvoiceId || "",
      docType,
      metaJson,
      now,
      now,
    ],
  );
  insertEstimateItems(estimateId, estimateItems);
  recordAuditLog(
    company.id,
    "OPERATIONAL_DOCUMENT_CREATE",
    "estimates",
    estimateId,
    quoteNo,
    { documentType: docType, total: totals.total, party: entry.party }
  );
  syncDocumentSequence(company.id, docType, quoteNo, quoteDate);
  persist();
  return getState();
}

function updateEstimate(entry) {
  return inDatabaseTransaction(() => updateEstimateUnsafe(entry));
}

function updateEstimateUnsafe(entry) {
  const company = getCurrentCompany();
  const now = new Date().toISOString();
  const estimateId = String(entry.estimateId || entry.quoteId || entry.id || "").trim();
  if (!estimateId) throw new Error("Document id is required for editing.");
  const existing = one("SELECT id, quote_no AS quoteNo, status, converted_invoice_id AS convertedInvoiceId, COALESCE(document_type, 'estimate') AS documentType FROM estimates WHERE company_id = ? AND id = ?", [company.id, estimateId]);
  if (!existing) throw new Error("Document not found.");
  validateEstimateMasterData(company.id, entry);

  const docType = normalizeDocumentType(entry.documentType || entry.type || existing.documentType);
  const quoteNo = entry.quoteNo || entry.invoiceNo || existing.quoteNo || nextInvoiceNumber(company.id, docType);
  if (quoteNo !== existing.quoteNo) {
    const dup = one(
      "SELECT id FROM estimates WHERE company_id = ? AND document_type = ? AND quote_no = ? AND id != ?",
      [company.id, docType, quoteNo, estimateId]
    );
    if (dup) {
      throw new Error(`Document number "${quoteNo}" already exists for ${docType.replace('_', ' ')}. Please use a unique number.`);
    }
  }
  const quoteDate = entry.date || entry.quoteDate || now;
  const metaJson = normalizeMetaJson(entry.meta ?? entry.metaJson ?? {});
  const taxContext = invoiceTaxContext(company.id, entry);
  const estimateItems = normalizeInvoiceItems(company.id, docType, entry.items || [], taxContext);
  const totals = calculateInvoiceTotals(estimateItems, Number(entry.amount || 0), 0);

  run("DELETE FROM estimate_items WHERE estimate_id = ?", [estimateId]);
  run(
    `UPDATE estimates SET
      quote_no = ?, party = ?, phone = ?, billing_address = ?, quote_date = ?, valid_until = ?,
      payment_terms = ?, supply_type = ?, place_of_supply = ?, party_gstin = ?, party_tax_type = ?,
      subtotal = ?, discount_total = ?, tax_total = ?, cgst_total = ?, sgst_total = ?,
      igst_total = ?, cess_total = ?, total = ?, status = ?, notes = ?, converted_invoice_id = ?,
      document_type = ?, meta_json = ?, updated_at = ?
     WHERE company_id = ? AND id = ?`,
    [
      quoteNo,
      String(entry.party || "").trim(),
      entry.phone || "",
      entry.billingAddress || "",
      quoteDate,
      entry.validUntil || entry.dueDate || "",
      entry.paymentTerms || "",
      taxContext.supplyType,
      taxContext.placeOfSupply,
      taxContext.partyGstin,
      taxContext.partyTaxType,
      totals.subtotal,
      totals.discountTotal,
      totals.taxTotal,
      totals.cgstTotal,
      totals.sgstTotal,
      totals.igstTotal,
      totals.cessTotal,
      totals.total,
      normalizeEstimateStatus(entry.status || existing.status || "draft"),
      entry.notes || "",
      entry.convertedInvoiceId || existing.convertedInvoiceId || "",
      docType,
      metaJson,
      now,
      company.id,
      estimateId,
    ],
  );
  insertEstimateItems(estimateId, estimateItems);
  recordAuditLog(
    company.id,
    "OPERATIONAL_DOCUMENT_UPDATE",
    "estimates",
    estimateId,
    quoteNo,
    { documentType: docType, total: totals.total, party: entry.party }
  );
  persist();
  return getState();
}

function insertEstimateItems(estimateId, estimateItems) {
  estimateItems.forEach((item, index) => {
    run(
      `INSERT INTO estimate_items
        (estimate_id, item_id, line_no, item_name, description, quantity, unit, price, discount,
         hsn_sac, taxable_value, tax_rate, tax_amount, cgst_amount, sgst_amount, igst_amount, cess_amount, line_total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        estimateId,
        item.itemId,
        index + 1,
        item.item,
        item.description,
        item.qty,
        item.unit,
        item.price,
        item.discount,
        item.hsnSac,
        item.taxableValue,
        item.taxRate,
        item.taxAmount,
        item.cgstAmount,
        item.sgstAmount,
        item.igstAmount,
        item.cessAmount,
        item.lineTotal,
      ],
    );
  });
}

function validateEstimateMasterData(companyId, entry) {
  const docType = normalizeDocumentType(entry.documentType || entry.type);
  const isPurchase = docType === "purchase_order";
  const partyRole = isPurchase ? "Supplier" : "Customer";
  const partyName = String(entry.party || "").trim();
  if (!partyName) throw new Error(`${partyRole} name is required.`);
  const rows = Array.isArray(entry.items)
    ? entry.items.filter((item) => item.item || item.qty || item.price)
    : [];
  if (!rows.length) throw new Error("Please add at least one item before saving.");
  rows.forEach((row) => {
    const itemName = String(row.item || "").trim();
    if (!itemName || !one("SELECT id FROM items WHERE company_id = ? AND LOWER(name) = LOWER(?)", [companyId, itemName])) {
      throw new Error(`Please select an existing item before saving: ${itemName || "blank item"}.`);
    }
  });
}

function setEstimateStatus(payload) {
  return inDatabaseTransaction(() => setEstimateStatusUnsafe(payload));
}

function setEstimateStatusUnsafe({ estimateId, status = "", notes = "", convertedInvoiceId = "" }) {
  const company = getCurrentCompany();
  const cleanStatus = normalizeEstimateStatus(status);
  const estimate = one(
    "SELECT id, notes, converted_invoice_id AS convertedInvoiceId FROM estimates WHERE company_id = ? AND id = ?",
    [company.id, String(estimateId || "").trim()],
  );
  if (!estimate) throw new Error("Quotation not found.");
  const nextNotes = [estimate.notes, notes].filter(Boolean).join("\n");
  run(
    "UPDATE estimates SET status = ?, notes = ?, converted_invoice_id = COALESCE(NULLIF(?, ''), converted_invoice_id), updated_at = ? WHERE company_id = ? AND id = ?",
    [cleanStatus, nextNotes, convertedInvoiceId, new Date().toISOString(), company.id, estimate.id],
  );
  persist();
  return getState();
}

function deleteEstimate(payload) {
  return inDatabaseTransaction(() => deleteEstimateUnsafe(payload));
}

function deleteEstimateUnsafe({ estimateId }) {
  const company = getCurrentCompany();
  const estimate = one(
    "SELECT id FROM estimates WHERE company_id = ? AND id = ?",
    [company.id, String(estimateId || "").trim()],
  );
  if (!estimate) throw new Error("Quotation not found.");
  run("DELETE FROM estimate_items WHERE estimate_id = ?", [estimate.id]);
  run("DELETE FROM estimates WHERE company_id = ? AND id = ?", [company.id, estimate.id]);
  persist();
  return getState();
}

function createCreditNote(entry) {
  return inDatabaseTransaction(() => createCreditNoteUnsafe(entry));
}

function createCreditNoteUnsafe(entry) {
  const company = getCurrentCompany();
  const now = new Date().toISOString();
  validateCreditNoteMasterData(company.id, entry);
  const creditNoteId = entry.creditNoteId || entry.id || makeId();
  const taxContext = invoiceTaxContext(company.id, { ...entry, type: "sale" });
  const creditItems = normalizeInvoiceItems(company.id, "sale", entry.items || [], taxContext);
  const totals = calculateInvoiceTotals(creditItems, Number(entry.amount || 0), Number(entry.received || entry.adjusted || 0));
  const creditNo = entry.creditNo || entry.invoiceNo || nextInvoiceNumber(company.id, "credit_note");
  const dupCn = one("SELECT id FROM credit_notes WHERE company_id = ? AND credit_no = ?", [company.id, creditNo]);
  if (dupCn) {
    throw new Error(`Credit Note number "${creditNo}" already exists. Please use a unique number.`);
  }
  const creditNote = {
    id: creditNoteId,
    creditNo,
    originalInvoiceId: entry.originalInvoiceId || null,
    originalInvoiceNo: entry.originalInvoiceNo || "",
    party: entry.party || "",
    partyId: resolvePartyId(company.id, entry.partyId, entry.party),
    phone: entry.phone || "",
    billingAddress: entry.billingAddress || "",
    date: entry.date || now,
    refundDate: entry.dueDate || entry.refundDate || "",
    paymentTerms: entry.paymentTerms || "",
    paymentMethod: entry.paymentMethod || "Adjustment",
    supplyType: taxContext.supplyType,
    placeOfSupply: taxContext.placeOfSupply,
    partyGstin: taxContext.partyGstin,
    partyTaxType: taxContext.partyTaxType,
    adjusted: totals.received,
    balance: totals.balance,
    status: normalizeCreditNoteStatus(entry.status, totals),
    reason: entry.reason || "",
    notes: entry.notes || "",
    metaJson: normalizeMetaJson(entry.meta ?? entry.metaJson ?? {}),
  };
  createCreditNoteRecord(company.id, creditNote, creditItems, totals, now);
  postCreditNoteStockMovements(company.id, creditNote, creditItems, now);
  postCreditNoteLedger(company.id, creditNote, totals);
  postCreditNoteTaxEntries(company.id, creditNote, creditItems, now);
  recordAuditLog(company.id, "create", "credit_note", creditNote.id, creditNote.creditNo, { total: totals.total, party: creditNote.party });
  syncDocumentSequence(company.id, "credit_note", creditNote.creditNo, creditNote.date);
  persist();
  return getState();
}

function updateCreditNote(entry) {
  return inDatabaseTransaction(() => updateCreditNoteUnsafe(entry));
}

function updateCreditNoteUnsafe(entry) {
  const company = getCurrentCompany();
  const now = new Date().toISOString();
  const creditNoteId = String(entry.creditNoteId || entry.id || "").trim();
  if (!creditNoteId) throw new Error("Credit note id is required for editing.");
  const existing = one(
    "SELECT id, credit_no AS creditNo FROM credit_notes WHERE company_id = ? AND id = ?",
    [company.id, creditNoteId],
  );
  if (!existing) throw new Error("Credit note not found.");

  validateCreditNoteMasterData(company.id, entry);
  const taxContext = invoiceTaxContext(company.id, { ...entry, type: "sale" });
  const creditItems = normalizeInvoiceItems(company.id, "sale", entry.items || [], taxContext);
  const totals = calculateInvoiceTotals(creditItems, Number(entry.amount || 0), Number(entry.received || entry.adjusted || 0));
  const creditNote = {
    id: creditNoteId,
    creditNo: entry.creditNo || entry.invoiceNo || existing.creditNo,
    originalInvoiceId: entry.originalInvoiceId || null,
    originalInvoiceNo: entry.originalInvoiceNo || "",
    party: entry.party || "",
    partyId: resolvePartyId(company.id, entry.partyId, entry.party),
    phone: entry.phone || "",
    billingAddress: entry.billingAddress || "",
    date: entry.date || now,
    refundDate: entry.dueDate || entry.refundDate || "",
    paymentTerms: entry.paymentTerms || "",
    paymentMethod: entry.paymentMethod || "Adjustment",
    supplyType: taxContext.supplyType,
    placeOfSupply: taxContext.placeOfSupply,
    partyGstin: taxContext.partyGstin,
    partyTaxType: taxContext.partyTaxType,
    adjusted: totals.received,
    balance: totals.balance,
    status: normalizeCreditNoteStatus(entry.status, totals),
    reason: entry.reason || "",
    notes: entry.notes || "",
    metaJson: normalizeMetaJson(entry.meta ?? entry.metaJson ?? {}),
  };

  run("DELETE FROM credit_note_items WHERE credit_note_id = ?", [creditNoteId]);
  run("DELETE FROM stock_movements WHERE company_id = ? AND credit_note_id = ?", [company.id, creditNoteId]);
  run(
    `UPDATE credit_notes SET
      credit_no = ?, original_invoice_id = ?, original_invoice_no = ?, party = ?, party_id = ?, phone = ?,
      billing_address = ?, credit_date = ?, refund_date = ?, payment_terms = ?, payment_method = ?,
      supply_type = ?, place_of_supply = ?, party_gstin = ?, party_tax_type = ?, subtotal = ?,
      discount_total = ?, tax_total = ?, cgst_total = ?, sgst_total = ?, igst_total = ?,
      cess_total = ?, total = ?, adjusted = ?, balance = ?, status = ?, reason = ?,
      notes = ?, meta_json = ?, updated_at = ?
     WHERE company_id = ? AND id = ?`,
    [
      creditNote.creditNo,
      creditNote.originalInvoiceId || null,
      creditNote.originalInvoiceNo,
      creditNote.party,
      creditNote.partyId,
      creditNote.phone,
      creditNote.billingAddress,
      creditNote.date,
      creditNote.refundDate,
      creditNote.paymentTerms,
      creditNote.paymentMethod,
      creditNote.supplyType,
      creditNote.placeOfSupply,
      creditNote.partyGstin,
      creditNote.partyTaxType,
      totals.subtotal,
      totals.discountTotal,
      totals.taxTotal,
      totals.cgstTotal,
      totals.sgstTotal,
      totals.igstTotal,
      totals.cessTotal,
      totals.total,
      creditNote.adjusted,
      creditNote.balance,
      creditNote.status,
      creditNote.reason,
      creditNote.notes,
      creditNote.metaJson,
      now,
      company.id,
      creditNote.id,
    ],
  );
  run(
    `UPDATE transactions SET
      invoice_id = ?, invoice_no = ?, party = ?, party_id = ?, amount = ?,
      payment_type = ?, status = ?, notes = ?, meta_json = ?, transaction_date = ?, updated_at = ?
     WHERE company_id = ? AND id = ?`,
    [
      creditNote.originalInvoiceId || null,
      creditNote.creditNo,
      creditNote.party,
      creditNote.partyId,
      totals.total,
      creditNote.paymentMethod,
      creditNote.status,
      creditNote.notes,
      creditNote.metaJson,
      creditNote.date,
      now,
      company.id,
      creditNote.id,
    ],
  );
  insertCreditNoteItems(creditNote.id, creditItems);
  postCreditNoteStockMovements(company.id, creditNote, creditItems, now);
  postCreditNoteLedger(company.id, creditNote, totals);
  postCreditNoteTaxEntries(company.id, creditNote, creditItems, now);
  recordAuditLog(company.id, "update", "credit_note", creditNote.id, creditNote.creditNo, { total: totals.total, party: creditNote.party });
  persist();
  return getState();
}

function setCreditNoteStatus(payload) {
  return inDatabaseTransaction(() => setCreditNoteStatusUnsafe(payload));
}

function setCreditNoteStatusUnsafe({ creditNoteId, status = "", notes = "" }) {
  const company = getCurrentCompany();
  const cleanStatus = normalizeCreditNoteStatus(status);
  const creditNote = one(
    "SELECT id, notes FROM credit_notes WHERE company_id = ? AND id = ?",
    [company.id, String(creditNoteId || "").trim()],
  );
  if (!creditNote) throw new Error("Credit note not found.");
  const nextNotes = [creditNote.notes, notes].filter(Boolean).join("\n");
  if (cleanStatus === "cancelled") {
    run("DELETE FROM stock_movements WHERE company_id = ? AND credit_note_id = ?", [company.id, creditNote.id]);
    run("DELETE FROM ledger_entries WHERE company_id = ? AND transaction_id = ?", [company.id, creditNote.id]);
    run("UPDATE tax_entries SET is_cancelled = 1 WHERE company_id = ? AND source_type = 'credit_note' AND source_id = ?", [company.id, creditNote.id]);
  }
  recordAuditLog(company.id, "status_change", "credit_note", creditNote.id, null, { status: cleanStatus });
  run("UPDATE credit_notes SET status = ?, notes = ?, updated_at = ? WHERE company_id = ? AND id = ?", [cleanStatus, nextNotes, new Date().toISOString(), company.id, creditNote.id]);
  run("UPDATE transactions SET status = ?, updated_at = ? WHERE company_id = ? AND id = ?", [cleanStatus, new Date().toISOString(), company.id, creditNote.id]);
  persist();
  return getState();
}

function deleteCreditNote(payload) {
  return inDatabaseTransaction(() => deleteCreditNoteUnsafe(payload));
}

function deleteCreditNoteUnsafe({ creditNoteId }) {
  const company = getCurrentCompany();
  const creditNote = one(
    "SELECT id, credit_no AS creditNo FROM credit_notes WHERE company_id = ? AND id = ?",
    [company.id, String(creditNoteId || "").trim()],
  );
  if (!creditNote) throw new Error("Credit note not found.");
  run("DELETE FROM stock_movements WHERE company_id = ? AND credit_note_id = ?", [company.id, creditNote.id]);
  run("DELETE FROM ledger_entries WHERE company_id = ? AND transaction_id = ?", [company.id, creditNote.id]);
  run("DELETE FROM tax_entries WHERE company_id = ? AND source_type = 'credit_note' AND source_id = ?", [company.id, creditNote.id]);
  run("DELETE FROM credit_note_items WHERE credit_note_id = ?", [creditNote.id]);
  run("DELETE FROM credit_notes WHERE company_id = ? AND id = ?", [company.id, creditNote.id]);
  run("DELETE FROM transactions WHERE company_id = ? AND id = ?", [company.id, creditNote.id]);
  recordAuditLog(company.id, "delete", "credit_note", creditNote.id, creditNote.creditNo);
  persist();
  return getState();
}

function postCreditNoteLedger(companyId, creditNote, totals) {
  run("DELETE FROM ledger_entries WHERE company_id = ? AND transaction_id = ?", [companyId, creditNote.id]);
  if (creditNote.status === "cancelled") return;

  const total = Number(totals.total || 0);
  const taxable = Math.max(0, Number(totals.subtotal || 0) - Number(totals.discountTotal || 0));
  const cgst = Number(totals.cgstTotal || 0);
  const sgst = Number(totals.sgstTotal || 0);
  const igst = Number(totals.igstTotal || 0);
  const cess = Number(totals.cessTotal || 0);
  const taxSum = cgst + sgst + igst + cess;
  const roundOff = roundMoney(total - (taxable + taxSum));

  const entries = [
    { account: "Sales", debit: taxable, credit: 0 },
  ];
  if (cgst > 0) entries.push({ account: "Output CGST", debit: cgst, credit: 0 });
  if (sgst > 0) entries.push({ account: "Output SGST", debit: sgst, credit: 0 });
  if (igst > 0) entries.push({ account: "Output IGST", debit: igst, credit: 0 });
  if (cess > 0) entries.push({ account: "Output Cess", debit: cess, credit: 0 });
  if (roundOff > 0) entries.push({ account: "Round Off", debit: roundOff, credit: 0 });
  if (roundOff < 0) entries.push({ account: "Round Off", debit: 0, credit: Math.abs(roundOff) });
  entries.push({ account: "Accounts Receivable", debit: 0, credit: total });

  for (const entry of entries) {
    run(
      `INSERT INTO ledger_entries
        (company_id, transaction_id, account, debit, credit, entry_date, narration)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [companyId, creditNote.id, entry.account, entry.debit, entry.credit, creditNote.date, `${creditNote.creditNo} sales return`],
    );
  }
}

function postCreditNoteTaxEntries(companyId, creditNote, creditItems, now) {
  run("DELETE FROM tax_entries WHERE company_id = ? AND source_type = 'credit_note' AND source_id = ?", [companyId, creditNote.id]);
  if (creditNote.status === "cancelled") return;

  const placeOfSupply = String(creditNote.placeOfSupply || "").trim();
  const supplyType = String(creditNote.supplyType || (creditNote.partyGstin ? "b2b" : "b2c"));

  for (const item of creditItems) {
    const taxable = Number(item.taxableValue ?? ((Number(item.qty || 0) * Number(item.price || 0)) - Number(item.discount || 0)) ?? 0);
    const rate = Number(item.taxRate || 0);
    const lineCgst = Number(item.cgstAmount ?? 0);
    const lineSgst = Number(item.sgstAmount ?? 0);
    const lineIgst = Number(item.igstAmount ?? 0);
    const lineCess = Number(item.cessAmount ?? 0);

    run(`
      INSERT INTO tax_entries
        (company_id, source_type, source_id, document_no, document_date, party_id,
         party_name, party_gstin, place_of_supply, supply_type, hsn_sac, tax_rate,
         taxable_value, cgst, sgst, igst, cess, is_reverse_charge, is_cancelled, created_at)
      VALUES (?, 'credit_note', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
    `, [
      companyId,
      creditNote.id,
      creditNote.creditNo,
      creditNote.date,
      creditNote.partyId,
      creditNote.party,
      creditNote.partyGstin || "",
      placeOfSupply,
      supplyType,
      item.hsnSac || "",
      rate,
      taxable,
      lineCgst,
      lineSgst,
      lineIgst,
      lineCess,
      now
    ]);
  }
}

function validateCreditNoteMasterData(companyId, entry) {
  const partyName = String(entry.party || "").trim();
  const existingParty = partyName
    ? one("SELECT id FROM parties WHERE company_id = ? AND LOWER(name) = LOWER(?)", [companyId, partyName])
    : null;
  if (!existingParty) {
    throw new Error("Please select an existing customer before saving this credit note.");
  }
  validateInvoiceMasterData(companyId, { ...entry, type: "sale", paymentType: "credit" });
}

function createCreditNoteRecord(companyId, creditNote, items, totals, now) {
  run(
    `INSERT INTO transactions
      (id, company_id, invoice_id, invoice_no, type, party, party_id, item, amount,
       payment_type, status, notes, meta_json, transaction_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'credit_note', ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      creditNote.id,
      companyId,
      creditNote.originalInvoiceId || null,
      creditNote.creditNo,
      creditNote.party,
      creditNote.partyId,
      totals.total,
      creditNote.paymentMethod || "Adjustment",
      creditNote.status,
      creditNote.notes,
      creditNote.metaJson || "{}",
      creditNote.date,
      now,
      now,
    ],
  );
  run(
    `INSERT INTO credit_notes
      (id, company_id, credit_no, original_invoice_id, original_invoice_no, party, party_id, phone,
       billing_address, credit_date, refund_date, payment_terms, payment_method, supply_type,
       place_of_supply, party_gstin, party_tax_type, subtotal, discount_total, tax_total,
       cgst_total, sgst_total, igst_total, cess_total, total, adjusted, balance, status,
       reason, notes, meta_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      creditNote.id,
      companyId,
      creditNote.creditNo,
      creditNote.originalInvoiceId || null,
      creditNote.originalInvoiceNo,
      creditNote.party,
      creditNote.partyId,
      creditNote.phone,
      creditNote.billingAddress,
      creditNote.date,
      creditNote.refundDate,
      creditNote.paymentTerms,
      creditNote.paymentMethod,
      creditNote.supplyType,
      creditNote.placeOfSupply,
      creditNote.partyGstin,
      creditNote.partyTaxType,
      totals.subtotal,
      totals.discountTotal,
      totals.taxTotal,
      totals.cgstTotal,
      totals.sgstTotal,
      totals.igstTotal,
      totals.cessTotal,
      totals.total,
      creditNote.adjusted,
      creditNote.balance,
      creditNote.status,
      creditNote.reason,
      creditNote.notes,
      creditNote.metaJson || "",
      now,
      now,
    ],
  );
  insertCreditNoteItems(creditNote.id, items);
}

function insertCreditNoteItems(creditNoteId, items) {
  items.forEach((item, index) => {
    run(
      `INSERT INTO credit_note_items
        (credit_note_id, item_id, line_no, item_name, description, quantity, unit, price, discount,
         hsn_sac, taxable_value, tax_rate, tax_amount, cgst_amount, sgst_amount, igst_amount, cess_amount, line_total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        creditNoteId,
        item.itemId,
        index + 1,
        item.item,
        item.description,
        item.qty,
        item.unit,
        item.price,
        item.discount,
        item.hsnSac,
        item.taxableValue,
        item.taxRate,
        item.taxAmount,
        item.cgstAmount,
        item.sgstAmount,
        item.igstAmount,
        item.cessAmount,
        item.lineTotal,
      ],
    );
  });
}

function postCreditNoteStockMovements(companyId, creditNote, creditItems, now) {
  creditItems
    .filter((item) => item.item && item.qty)
    .forEach((item) => {
      if (item.itemId) {
        const itemRecord = one("SELECT item_type AS itemType FROM items WHERE company_id = ? AND id = ?", [companyId, item.itemId]);
        if (itemRecord && String(itemRecord.itemType || "product").toLowerCase() === "service") {
          return;
        }
      }
      run(
        `INSERT INTO stock_movements
          (id, company_id, invoice_id, transaction_id, credit_note_id, item_id, item_name, movement_type,
           quantity, unit, rate, movement_date, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          makeId(),
          companyId,
          null,
          creditNote.id,
          creditNote.id,
          item.itemId,
          item.item,
          "in",
          item.qty,
          item.unit,
          item.price,
          creditNote.date,
          `${creditNote.creditNo} sale return stock in`,
          now,
        ],
      );
    });
}

function normalizeCreditNoteStatus(status, totals = null) {
  const cleanStatus = String(status || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (["open", "partial", "adjusted", "cancelled"].includes(cleanStatus)) return cleanStatus;
  if (totals) {
    if (Number(totals.balance || 0) <= 0) return "adjusted";
    if (Number(totals.received || 0) > 0) return "partial";
  }
  return "open";
}

function createDebitNote(entry) {
  return inDatabaseTransaction(() => createDebitNoteUnsafe(entry));
}

function createDebitNoteUnsafe(entry) {
  const company = getCurrentCompany();
  const now = new Date().toISOString();
  validateDebitNoteMasterData(company.id, entry);
  const debitNoteId = entry.debitNoteId || entry.id || makeId();
  const taxContext = invoiceTaxContext(company.id, { ...entry, type: "purchase" });
  const debitItems = normalizeInvoiceItems(company.id, "purchase", entry.items || [], taxContext);
  const totals = calculateInvoiceTotals(debitItems, Number(entry.amount || 0), Number(entry.received || entry.adjusted || 0));
  const docDate = entry.date || entry.debitDate || now;
  const originalPurchaseNo = entry.originalPurchaseNo || entry.originalInvoiceNo || (entry.debitNo ? entry.invoiceNo : "") || "";
  let originalPurchaseId = entry.originalPurchaseId || entry.originalInvoiceId || null;
  if (originalPurchaseId) {
    const inv = one("SELECT transaction_id FROM invoices WHERE company_id = ? AND (id = ? OR transaction_id = ?)", [company.id, originalPurchaseId, originalPurchaseId]);
    if (inv?.transaction_id) {
      originalPurchaseId = inv.transaction_id;
    }
  }
  const debitNo = entry.debitNo || (!originalPurchaseNo && entry.invoiceNo ? entry.invoiceNo : "") || nextInvoiceNumber(company.id, "debit_note", docDate);
  const dupDn = one("SELECT id FROM debit_notes WHERE company_id = ? AND debit_no = ?", [company.id, debitNo]);
  if (dupDn) {
    throw new Error(`Debit Note number "${debitNo}" already exists. Please use a unique number.`);
  }
  const debitNote = {
    id: debitNoteId,
    debitNo,
    originalPurchaseId,
    originalPurchaseNo,
    party: entry.party || "",
    partyId: resolvePartyId(company.id, entry.partyId, entry.party),
    phone: entry.phone || "",
    billingAddress: entry.billingAddress || "",
    date: docDate,
    refundDate: entry.dueDate || entry.refundDate || "",
    paymentTerms: entry.paymentTerms || "",
    paymentMethod: entry.paymentMethod || "Adjustment",
    supplyType: taxContext.supplyType,
    placeOfSupply: taxContext.placeOfSupply,
    partyGstin: taxContext.partyGstin,
    partyTaxType: taxContext.partyTaxType,
    adjusted: totals.received,
    balance: totals.balance,
    status: normalizeDebitNoteStatus(entry.status, totals),
    reason: entry.reason || "",
    notes: entry.notes || "",
    metaJson: normalizeMetaJson(entry.meta ?? entry.metaJson ?? {}),
  };
  createDebitNoteRecord(company.id, debitNote, debitItems, totals, now);
  postDebitNoteStockMovements(company.id, debitNote, debitItems, now);
  postDebitNoteLedger(company.id, debitNote, totals);
  postDebitNoteTaxEntries(company.id, debitNote, debitItems, now);
  recordAuditLog(company.id, "create", "debit_note", debitNote.id, debitNote.debitNo, { total: totals.total, party: debitNote.party });
  syncDocumentSequence(company.id, "debit_note", debitNote.debitNo, debitNote.date);
  persist();
  return getState();
}

function updateDebitNote(entry) {
  return inDatabaseTransaction(() => updateDebitNoteUnsafe(entry));
}

function updateDebitNoteUnsafe(entry) {
  const company = getCurrentCompany();
  const now = new Date().toISOString();
  const debitNoteId = String(entry.debitNoteId || entry.id || "").trim();
  if (!debitNoteId) throw new Error("Debit note id is required for editing.");
  const existing = one(
    "SELECT id, debit_no AS debitNo FROM debit_notes WHERE company_id = ? AND id = ?",
    [company.id, debitNoteId],
  );
  if (!existing) throw new Error("Debit note not found.");

  validateDebitNoteMasterData(company.id, entry);
  const taxContext = invoiceTaxContext(company.id, { ...entry, type: "purchase" });
  const debitItems = normalizeInvoiceItems(company.id, "purchase", entry.items || [], taxContext);
  const totals = calculateInvoiceTotals(debitItems, Number(entry.amount || 0), Number(entry.received || entry.adjusted || 0));
  const originalPurchaseNo = entry.originalPurchaseNo || entry.originalInvoiceNo || (entry.debitNo ? entry.invoiceNo : "") || "";
  let originalPurchaseId = entry.originalPurchaseId || entry.originalInvoiceId || null;
  if (originalPurchaseId) {
    const inv = one("SELECT transaction_id FROM invoices WHERE company_id = ? AND (id = ? OR transaction_id = ?)", [company.id, originalPurchaseId, originalPurchaseId]);
    if (inv?.transaction_id) {
      originalPurchaseId = inv.transaction_id;
    }
  }
  const debitNo = entry.debitNo || (!originalPurchaseNo && entry.invoiceNo ? entry.invoiceNo : "") || existing.debitNo;
  const debitNote = {
    id: debitNoteId,
    debitNo,
    originalPurchaseId,
    originalPurchaseNo,
    party: entry.party || "",
    partyId: resolvePartyId(company.id, entry.partyId, entry.party),
    phone: entry.phone || "",
    billingAddress: entry.billingAddress || "",
    date: entry.date || entry.debitDate || now,
    refundDate: entry.dueDate || entry.refundDate || "",
    paymentTerms: entry.paymentTerms || "",
    paymentMethod: entry.paymentMethod || "Adjustment",
    supplyType: taxContext.supplyType,
    placeOfSupply: taxContext.placeOfSupply,
    partyGstin: taxContext.partyGstin,
    partyTaxType: taxContext.partyTaxType,
    adjusted: totals.received,
    balance: totals.balance,
    status: normalizeDebitNoteStatus(entry.status, totals),
    reason: entry.reason || "",
    notes: entry.notes || "",
    metaJson: normalizeMetaJson(entry.meta ?? entry.metaJson ?? {}),
  };

  run("DELETE FROM debit_note_items WHERE debit_note_id = ?", [debitNoteId]);
  run("DELETE FROM stock_movements WHERE company_id = ? AND debit_note_id = ?", [company.id, debitNoteId]);
  run(
    `UPDATE debit_notes SET
      debit_no = ?, original_purchase_id = ?, original_purchase_no = ?, party = ?, party_id = ?, phone = ?,
      billing_address = ?, debit_date = ?, refund_date = ?, payment_terms = ?, payment_method = ?,
      supply_type = ?, place_of_supply = ?, party_gstin = ?, party_tax_type = ?, subtotal = ?,
      discount_total = ?, tax_total = ?, cgst_total = ?, sgst_total = ?, igst_total = ?,
      cess_total = ?, total = ?, adjusted = ?, balance = ?, status = ?, reason = ?,
      notes = ?, meta_json = ?, updated_at = ?
     WHERE company_id = ? AND id = ?`,
    [
      debitNote.debitNo,
      debitNote.originalPurchaseId || null,
      debitNote.originalPurchaseNo,
      debitNote.party,
      debitNote.partyId,
      debitNote.phone,
      debitNote.billingAddress,
      debitNote.date,
      debitNote.refundDate,
      debitNote.paymentTerms,
      debitNote.paymentMethod,
      debitNote.supplyType,
      debitNote.placeOfSupply,
      debitNote.partyGstin,
      debitNote.partyTaxType,
      totals.subtotal,
      totals.discountTotal,
      totals.taxTotal,
      totals.cgstTotal,
      totals.sgstTotal,
      totals.igstTotal,
      totals.cessTotal,
      totals.total,
      debitNote.adjusted,
      debitNote.balance,
      debitNote.status,
      debitNote.reason,
      debitNote.notes,
      debitNote.metaJson,
      now,
      company.id,
      debitNote.id,
    ],
  );
  run(
    `UPDATE transactions SET
      invoice_id = ?, invoice_no = ?, party = ?, party_id = ?, amount = ?,
      payment_type = ?, status = ?, notes = ?, meta_json = ?, transaction_date = ?, updated_at = ?
     WHERE company_id = ? AND id = ?`,
    [
      debitNote.originalPurchaseId || null,
      debitNote.debitNo,
      debitNote.party,
      debitNote.partyId,
      totals.total,
      debitNote.paymentMethod,
      debitNote.status,
      debitNote.notes,
      debitNote.metaJson,
      debitNote.date,
      now,
      company.id,
      debitNote.id,
    ],
  );
  insertDebitNoteItems(debitNote.id, debitItems);
  postDebitNoteStockMovements(company.id, debitNote, debitItems, now);
  postDebitNoteLedger(company.id, debitNote, totals);
  postDebitNoteTaxEntries(company.id, debitNote, debitItems, now);
  recordAuditLog(company.id, "update", "debit_note", debitNote.id, debitNote.debitNo, { total: totals.total, party: debitNote.party });
  persist();
  return getState();
}

function setDebitNoteStatus(payload) {
  return inDatabaseTransaction(() => setDebitNoteStatusUnsafe(payload));
}

function setDebitNoteStatusUnsafe({ debitNoteId, status = "", notes = "" }) {
  const company = getCurrentCompany();
  const cleanStatus = normalizeDebitNoteStatus(status);
  const debitNote = one(
    "SELECT id, notes FROM debit_notes WHERE company_id = ? AND id = ?",
    [company.id, String(debitNoteId || "").trim()],
  );
  if (!debitNote) throw new Error("Debit note not found.");
  const nextNotes = [debitNote.notes, notes].filter(Boolean).join("\n");
  if (cleanStatus === "cancelled") {
    run("DELETE FROM stock_movements WHERE company_id = ? AND debit_note_id = ?", [company.id, debitNote.id]);
    run("DELETE FROM ledger_entries WHERE company_id = ? AND transaction_id = ?", [company.id, debitNote.id]);
    run("UPDATE tax_entries SET is_cancelled = 1 WHERE company_id = ? AND source_type = 'debit_note' AND source_id = ?", [company.id, debitNote.id]);
  }
  recordAuditLog(company.id, "status_change", "debit_note", debitNote.id, null, { status: cleanStatus });
  run("UPDATE debit_notes SET status = ?, notes = ?, updated_at = ? WHERE company_id = ? AND id = ?", [cleanStatus, nextNotes, new Date().toISOString(), company.id, debitNote.id]);
  run("UPDATE transactions SET status = ?, updated_at = ? WHERE company_id = ? AND id = ?", [cleanStatus, new Date().toISOString(), company.id, debitNote.id]);
  persist();
  return getState();
}

function deleteDebitNote(payload) {
  return inDatabaseTransaction(() => deleteDebitNoteUnsafe(payload));
}

function deleteDebitNoteUnsafe({ debitNoteId }) {
  const company = getCurrentCompany();
  const debitNote = one(
    "SELECT id, debit_no AS debitNo FROM debit_notes WHERE company_id = ? AND id = ?",
    [company.id, String(debitNoteId || "").trim()],
  );
  if (!debitNote) throw new Error("Debit note not found.");
  run("DELETE FROM stock_movements WHERE company_id = ? AND debit_note_id = ?", [company.id, debitNote.id]);
  run("DELETE FROM ledger_entries WHERE company_id = ? AND transaction_id = ?", [company.id, debitNote.id]);
  run("DELETE FROM tax_entries WHERE company_id = ? AND source_type = 'debit_note' AND source_id = ?", [company.id, debitNote.id]);
  run("DELETE FROM debit_note_items WHERE debit_note_id = ?", [debitNote.id]);
  run("DELETE FROM debit_notes WHERE company_id = ? AND id = ?", [company.id, debitNote.id]);
  run("DELETE FROM transactions WHERE company_id = ? AND id = ?", [company.id, debitNote.id]);
  recordAuditLog(company.id, "delete", "debit_note", debitNote.id, debitNote.debitNo);
  persist();
  return getState();
}

function postDebitNoteLedger(companyId, debitNote, totals) {
  run("DELETE FROM ledger_entries WHERE company_id = ? AND transaction_id = ?", [companyId, debitNote.id]);
  if (debitNote.status === "cancelled") return;

  const total = Number(totals.total || 0);
  const taxable = Math.max(0, Number(totals.subtotal || 0) - Number(totals.discountTotal || 0));
  const cgst = Number(totals.cgstTotal || 0);
  const sgst = Number(totals.sgstTotal || 0);
  const igst = Number(totals.igstTotal || 0);
  const cess = Number(totals.cessTotal || 0);
  const taxSum = cgst + sgst + igst + cess;
  const roundOff = roundMoney(total - (taxable + taxSum));

  const entries = [
    { account: "Accounts Payable", debit: total, credit: 0 },
    { account: "Purchases", debit: 0, credit: taxable },
  ];
  if (cgst > 0) entries.push({ account: "Input CGST", debit: 0, credit: cgst });
  if (sgst > 0) entries.push({ account: "Input SGST", debit: 0, credit: sgst });
  if (igst > 0) entries.push({ account: "Input IGST", debit: 0, credit: igst });
  if (cess > 0) entries.push({ account: "Input Cess", debit: 0, credit: cess });
  if (roundOff > 0) entries.push({ account: "Round Off", debit: 0, credit: roundOff });
  if (roundOff < 0) entries.push({ account: "Round Off", debit: Math.abs(roundOff), credit: 0 });

  for (const entry of entries) {
    run(
      `INSERT INTO ledger_entries
        (company_id, transaction_id, account, debit, credit, entry_date, narration)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [companyId, debitNote.id, entry.account, entry.debit, entry.credit, debitNote.date, `${debitNote.debitNo} purchase return`],
    );
  }
}

function postDebitNoteTaxEntries(companyId, debitNote, debitItems, now) {
  run("DELETE FROM tax_entries WHERE company_id = ? AND source_type = 'debit_note' AND source_id = ?", [companyId, debitNote.id]);
  if (debitNote.status === "cancelled") return;

  const placeOfSupply = String(debitNote.placeOfSupply || "").trim();
  const supplyType = String(debitNote.supplyType || (debitNote.partyGstin ? "b2b" : "b2c"));

  for (const item of debitItems) {
    const taxable = Number(item.taxableValue ?? ((Number(item.qty || 0) * Number(item.price || 0)) - Number(item.discount || 0)) ?? 0);
    const rate = Number(item.taxRate || 0);
    const lineCgst = Number(item.cgstAmount ?? 0);
    const lineSgst = Number(item.sgstAmount ?? 0);
    const lineIgst = Number(item.igstAmount ?? 0);
    const lineCess = Number(item.cessAmount ?? 0);

    run(`
      INSERT INTO tax_entries
        (company_id, source_type, source_id, document_no, document_date, party_id,
         party_name, party_gstin, place_of_supply, supply_type, hsn_sac, tax_rate,
         taxable_value, cgst, sgst, igst, cess, is_reverse_charge, is_cancelled, created_at)
      VALUES (?, 'debit_note', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
    `, [
      companyId,
      debitNote.id,
      debitNote.debitNo,
      debitNote.date,
      debitNote.partyId,
      debitNote.party,
      debitNote.partyGstin || "",
      placeOfSupply,
      supplyType,
      item.hsnSac || "",
      rate,
      taxable,
      lineCgst,
      lineSgst,
      lineIgst,
      lineCess,
      now
    ]);
  }
}

function validateDebitNoteMasterData(companyId, entry) {
  const partyName = String(entry.party || "").trim();
  const existingParty = partyName
    ? one("SELECT id FROM parties WHERE company_id = ? AND LOWER(name) = LOWER(?)", [companyId, partyName])
    : null;
  if (!existingParty) {
    throw new Error("Please select an existing supplier before saving this debit note.");
  }
  validateInvoiceMasterData(companyId, { ...entry, type: "purchase", paymentType: "credit" });
}

function createDebitNoteRecord(companyId, debitNote, items, totals, now) {
  run(
    `INSERT INTO transactions
      (id, company_id, invoice_id, invoice_no, type, party, party_id, item, amount,
       payment_type, status, notes, meta_json, transaction_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'debit_note', ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      debitNote.id,
      companyId,
      debitNote.originalPurchaseId || null,
      debitNote.debitNo,
      debitNote.party,
      debitNote.partyId,
      totals.total,
      debitNote.paymentMethod || "Adjustment",
      debitNote.status,
      debitNote.notes,
      debitNote.metaJson || "{}",
      debitNote.date,
      now,
      now,
    ],
  );
  run(
    `INSERT INTO debit_notes
      (id, company_id, debit_no, original_purchase_id, original_purchase_no, party, party_id, phone,
       billing_address, debit_date, refund_date, payment_terms, payment_method, supply_type,
       place_of_supply, party_gstin, party_tax_type, subtotal, discount_total, tax_total,
       cgst_total, sgst_total, igst_total, cess_total, total, adjusted, balance, status,
       reason, notes, meta_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      debitNote.id,
      companyId,
      debitNote.debitNo,
      debitNote.originalPurchaseId || null,
      debitNote.originalPurchaseNo,
      debitNote.party,
      debitNote.partyId,
      debitNote.phone,
      debitNote.billingAddress,
      debitNote.date,
      debitNote.refundDate,
      debitNote.paymentTerms,
      debitNote.paymentMethod,
      debitNote.supplyType,
      debitNote.placeOfSupply,
      debitNote.partyGstin,
      debitNote.partyTaxType,
      totals.subtotal,
      totals.discountTotal,
      totals.taxTotal,
      totals.cgstTotal,
      totals.sgstTotal,
      totals.igstTotal,
      totals.cessTotal,
      totals.total,
      debitNote.adjusted,
      debitNote.balance,
      debitNote.status,
      debitNote.reason,
      debitNote.notes,
      debitNote.metaJson || "",
      now,
      now,
    ],
  );
  insertDebitNoteItems(debitNote.id, items);
}

function insertDebitNoteItems(debitNoteId, items) {
  items.forEach((item, index) => {
    run(
      `INSERT INTO debit_note_items
        (debit_note_id, item_id, line_no, item_name, description, quantity, unit, price, discount,
         hsn_sac, taxable_value, tax_rate, tax_amount, cgst_amount, sgst_amount, igst_amount, cess_amount, line_total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        debitNoteId,
        item.itemId,
        index + 1,
        item.item,
        item.description,
        item.qty,
        item.unit,
        item.price,
        item.discount,
        item.hsnSac,
        item.taxableValue,
        item.taxRate,
        item.taxAmount,
        item.cgstAmount,
        item.sgstAmount,
        item.igstAmount,
        item.cessAmount,
        item.lineTotal,
      ],
    );
  });
}

function postDebitNoteStockMovements(companyId, debitNote, debitItems, now) {
  debitItems
    .filter((item) => item.item && item.qty)
    .forEach((item) => {
      if (item.itemId) {
        const itemRecord = one("SELECT item_type AS itemType FROM items WHERE company_id = ? AND id = ?", [companyId, item.itemId]);
        if (itemRecord && String(itemRecord.itemType || "product").toLowerCase() === "service") {
          return;
        }
      }
      run(
        `INSERT INTO stock_movements
          (id, company_id, invoice_id, transaction_id, credit_note_id, debit_note_id, item_id, item_name, movement_type,
           quantity, unit, rate, movement_date, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          makeId(),
          companyId,
          null,
          debitNote.id,
          null,
          debitNote.id,
          item.itemId,
          item.item,
          "out",
          item.qty,
          item.unit,
          item.price,
          debitNote.date,
          `${debitNote.debitNo} purchase return stock out`,
          now,
        ],
      );
    });
}

function normalizeDebitNoteStatus(status, totals = null) {
  const cleanStatus = String(status || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (["open", "partial", "adjusted", "cancelled"].includes(cleanStatus)) return cleanStatus;
  if (totals) {
    if (Number(totals.balance || 0) <= 0) return "adjusted";
    if (Number(totals.received || 0) > 0) return "partial";
  }
  return "open";
}

function normalizeEstimateStatus(status) {
  const cleanStatus = String(status || "draft").trim().toLowerCase().replace(/\s+/g, "_");
  return ["draft", "sent", "accepted", "converted", "expired", "cancelled"].includes(cleanStatus) ? cleanStatus : "draft";
}

function validateInvoiceMasterData(companyId, entry) {
  const partyName = String(entry.party || "").trim();
  const existingParty = partyName
    ? one("SELECT id, type FROM parties WHERE company_id = ? AND LOWER(name) = LOWER(?)", [companyId, partyName])
    : null;

  const walkIn = entry.type === 'sale' && !entry.partyId && !partyName && entry.paymentType === 'cash' && (entry.supplyType || 'b2c') === 'b2c';
  if ((!existingParty && !walkIn) || (entry.partyId && Number(existingParty?.id) !== Number(entry.partyId))) {
    throw new Error(`Please select an existing ${entry.type === "purchase" ? "supplier" : "customer"} before saving this invoice.`);
  }
  const expectedRole = entry.type === "purchase" ? "supplier" : "customer";
  if (["customer", "supplier"].includes(existingParty?.type) && existingParty.type !== expectedRole) {
    throw new Error(`The selected party is not configured as a ${expectedRole}.`);
  }

  const rows = Array.isArray(entry.items)
    ? entry.items.filter((item) => (item.item || item.name || item.itemName) || (item.qty || item.quantity) || item.price)
    : [];
  if (!rows.length) {
    throw new Error("Please select at least one existing item before saving this invoice.");
  }
  rows.forEach((row) => {
    const itemName = String(row.item || row.name || row.itemName || "").trim();
    const existingItem = itemName
      ? one("SELECT id FROM items WHERE company_id = ? AND LOWER(name) = LOWER(?)", [companyId, itemName])
      : null;
    if (!existingItem || (row.itemId && Number(existingItem.id) !== Number(row.itemId))) {
      throw new Error(`Please select an existing item before saving: ${itemName || "blank item"}.`);
    }
  });
}

function resolvePartyId(companyId, suppliedId, partyName) {
  if (suppliedId) {
    const partyById = one("SELECT id FROM parties WHERE company_id = ? AND id = ?", [companyId, suppliedId]);
    if (partyById) return partyById.id;
  }
  const cleanName = String(partyName || "").trim();
  if (!cleanName) return null;
  const partyByName = one("SELECT id FROM parties WHERE company_id = ? AND LOWER(name) = LOWER(?)", [companyId, cleanName]);
  return partyByName?.id || null;
}

function validateWalkInBalance(entry, partyId, totals) {
  if (entry.type === 'sale' && !partyId && totals.balance > 0) throw new Error('Select a customer for a sale with an outstanding balance.');
}

function validatePurchaseRemoval(companyId, invoiceId, replacement = []) {
  const removed = all("SELECT item_id AS itemId, SUM(quantity) AS qty FROM stock_movements WHERE company_id = ? AND invoice_id = ? AND movement_type = 'in' GROUP BY item_id", [companyId, invoiceId]);
  for (const row of removed) {
    const item = one("SELECT name, item_type AS type, opening_stock AS opening FROM items WHERE company_id = ? AND id = ?", [companyId, row.itemId]);
    if (!item || item.type === 'service') continue;
    const movement = one("SELECT COALESCE(SUM(CASE WHEN movement_type = 'out' THEN -quantity ELSE quantity END),0) AS qty FROM stock_movements WHERE company_id = ? AND item_id = ?", [companyId, row.itemId]);
    const added = replacement.filter((line) => line.itemId === row.itemId).reduce((sum, line) => sum + line.qty, 0);
    if (Number(item.opening) + Number(movement.qty) - Number(row.qty) + added < -0.000001) throw new Error(`Cannot remove purchased stock already used: ${item.name}.`);
  }
}

function validateSaleStock(companyId, invoiceItems, excludedInvoiceId = "") {
  const requestedByItem = new Map();
  invoiceItems.forEach((item) => {
    if (!item.itemId || Number(item.qty || 0) <= 0) return;
    requestedByItem.set(item.itemId, Number(requestedByItem.get(item.itemId) || 0) + Number(item.qty || 0));
  });

  requestedByItem.forEach((requested, itemId) => {
    const item = one(
      `SELECT i.name, i.item_type AS itemType, i.opening_stock AS openingStock,
        COALESCE(SUM(CASE
          WHEN sm.movement_type = 'in' THEN sm.quantity
          WHEN sm.movement_type = 'out' THEN -sm.quantity
          ELSE sm.quantity
        END), 0) AS movementQuantity
       FROM items i
       LEFT JOIN stock_movements sm ON sm.item_id = i.id AND sm.company_id = i.company_id
         AND (? = '' OR COALESCE(sm.invoice_id, '') <> ?)
       WHERE i.company_id = ? AND i.id = ?
       GROUP BY i.id`,
      [excludedInvoiceId, excludedInvoiceId, companyId, itemId],
    );
    if (!item || String(item.itemType || "product").toLowerCase() === "service") return;
    const available = Number(item.openingStock || 0) + Number(item.movementQuantity || 0);
    if (requested > available) {
      throw new Error(`${item.name} has only ${available} in stock; requested quantity is ${requested}.`);
    }
  });
}

function createInvoiceRecord(companyId, transaction, entry, invoiceItems, totals, now) {
  const taxContext = invoiceTaxContext(companyId, entry);
  const metaJson = normalizeMetaJson(entry.meta ?? entry.metaJson ?? {});
  run(
    `INSERT INTO invoices
      (id, company_id, transaction_id, invoice_no, type, party, party_id, phone, billing_address,
       invoice_date, due_date, payment_terms, payment_type, supply_type, place_of_supply,
       party_gstin, party_tax_type, subtotal, discount_total, tax_total, cgst_total, sgst_total,
       igst_total, cess_total, total, received, balance, status, notes, meta_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      transaction.invoiceId,
      companyId,
      transaction.id,
      transaction.invoiceNo,
      transaction.type,
      transaction.party,
      transaction.partyId,
      entry.phone || "",
      entry.billingAddress || "",
      transaction.date,
      entry.dueDate || "",
      entry.paymentTerms || "",
      entry.paymentType || transaction.paymentType || "cash",
      taxContext.supplyType,
      taxContext.placeOfSupply,
      taxContext.partyGstin,
      taxContext.partyTaxType,
      totals.subtotal,
      totals.discountTotal,
      totals.taxTotal,
      totals.cgstTotal,
      totals.sgstTotal,
      totals.igstTotal,
      totals.cessTotal,
      totals.total,
      totals.received,
      totals.balance,
      totals.balance <= 0 ? "paid" : totals.received > 0 ? "partially_paid" : "unpaid",
      transaction.notes,
      metaJson,
      now,
    ],
  );

  invoiceItems.forEach((item, index) => {
    run(
      `INSERT INTO invoice_items
        (invoice_id, item_id, line_no, item_name, description, quantity, unit, price, discount,
         hsn_sac, taxable_value, tax_rate, tax_amount, cgst_amount, sgst_amount, igst_amount, cess_amount, line_total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        transaction.invoiceId,
        item.itemId,
        index + 1,
        item.item,
        item.description,
        item.qty,
        item.unit,
        item.price,
        item.discount,
        item.hsnSac,
        item.taxableValue,
        item.taxRate,
        item.taxAmount,
        item.cgstAmount,
        item.sgstAmount,
        item.igstAmount,
        item.cessAmount,
        item.lineTotal,
      ],
    );
  });
}

function postStockMovements(companyId, transaction, invoiceItems, now) {
  const movementType = transaction.type === "purchase" ? "in" : "out";
  invoiceItems
    .filter((item) => item.item && item.qty)
    .forEach((item) => {
      if (item.itemId) {
        const itemRecord = one("SELECT item_type AS itemType FROM items WHERE company_id = ? AND id = ?", [companyId, item.itemId]);
        if (itemRecord && String(itemRecord.itemType || "product").toLowerCase() === "service") {
          return;
        }
      }
      run(
        `INSERT INTO stock_movements
          (id, company_id, invoice_id, transaction_id, item_id, item_name, movement_type, quantity, unit, rate, movement_date, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          makeId(),
          companyId,
          transaction.invoiceId,
          transaction.id,
          item.itemId,
          item.item,
          movementType,
          item.qty,
          item.unit,
          item.price,
          transaction.date,
          `${transaction.invoiceNo} ${movementType === "in" ? "stock in" : "stock out"}`,
          now,
        ],
      );
    });
}

function invoiceTaxContext(companyId, entry) {
  const partyName = String(entry.party || "").trim();
  const party = one(
    "SELECT tax_type AS taxType, gstin, state FROM parties WHERE company_id = ? AND LOWER(name) = LOWER(?)",
    [companyId, partyName],
  ) || {};
  const placeOfSupply = String(entry.placeOfSupply || entry.state || party.state || "").trim();
  const businessSettings = getBusinessSettings();
  const firmState = String(entry.firmState || businessSettings.state || "Karnataka").trim();
  const partyGstin = String(entry.partyGstin || party.gstin || "").trim().toUpperCase();
  const partyTaxType = String(entry.partyTaxType || party.taxType || "unregistered").trim();
  return {
    firmState,
    placeOfSupply,
    partyGstin,
    partyTaxType,
    supplyType: entry.supplyType || (partyGstin ? "b2b" : "b2c"),
    isInterstate: Boolean(placeOfSupply && firmState && placeOfSupply.toLowerCase() !== firmState.toLowerCase()),
  };
}

function roundMoney(val) {
  return Math.round((Number(val || 0) + Number.EPSILON) * 100) / 100;
}

function splitGstAmount(taxAmount, context) {
  const safeTax = roundMoney(taxAmount);
  if (context.isInterstate) {
    return { cgstAmount: 0, sgstAmount: 0, igstAmount: safeTax, cessAmount: 0 };
  }
  const halfTax = roundMoney(safeTax / 2);
  const otherHalf = roundMoney(safeTax - halfTax);
  return {
    cgstAmount: halfTax,
    sgstAmount: otherHalf,
    igstAmount: 0,
    cessAmount: 0,
  };
}

function itemTaxMeta(companyId, itemId, itemName) {
  if (itemId) {
    return one("SELECT hsn_sac AS hsnSac, tax_rate AS taxRate FROM items WHERE company_id = ? AND id = ?", [companyId, itemId]) || {};
  }
  const cleanName = String(itemName || "").trim();
  if (!cleanName) return {};
  return one("SELECT hsn_sac AS hsnSac, tax_rate AS taxRate FROM items WHERE company_id = ? AND LOWER(name) = LOWER(?)", [companyId, cleanName]) || {};
}

function normalizeInvoiceItems(companyId, transactionType, items, taxContext = invoiceTaxContext(companyId, {})) {
  return items
    .filter((item) => (item.item || item.name || item.itemName) || (item.qty || item.quantity) || item.price)
    .map((item) => {
      const itemName = String(item.item || item.name || item.itemName || "").trim();
      const qty = Number(item.qty ?? item.quantity ?? 0);
      const price = Number(item.price || 0);
      const discount = Number(item.discount || 0);
      const taxRate = Number(item.taxRate || 0);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error('Item quantity must be greater than zero.');
      if (!Number.isFinite(price) || price < 0 || !Number.isFinite(qty * price)) throw new Error('Item price must be finite and non-negative.');
      if (!Number.isFinite(discount) || discount < 0 || discount > qty * price) throw new Error('Invalid item discount.');
      if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) throw new Error('Invalid item tax rate.');
      const taxable = Math.max(0, qty * price - discount);
      const taxAmount = taxable * taxRate / 100;
      const existingItem = item.itemId
        ? one("SELECT id FROM items WHERE company_id = ? AND id = ?", [companyId, item.itemId])
        : one("SELECT id FROM items WHERE company_id = ? AND LOWER(name) = LOWER(?)", [companyId, itemName]);
      if (!existingItem) throw new Error(`Please select an existing item before saving: ${itemName || "blank item"}.`);
      const itemId = existingItem.id;
      const meta = itemTaxMeta(companyId, itemId, itemName);
      const hsnSac = String(item.hsnSac || meta.hsnSac || "").trim();
      const resolvedTaxRate = Number(item.taxRate ?? meta.taxRate ?? 0);
      const resolvedTaxAmount = taxable * resolvedTaxRate / 100;
      const split = splitGstAmount(resolvedTaxAmount, taxContext);
      return {
        itemId,
        item: itemName || "Item",
        description: item.description || "",
        qty,
        unit: item.unit || "",
        price,
        discount,
        hsnSac,
        taxableValue: taxable,
        taxRate: resolvedTaxRate,
        taxAmount: resolvedTaxAmount,
        ...split,
        lineTotal: taxable + resolvedTaxAmount,
      };
    });
}

function calculateInvoiceTotals(items, fallbackTotal, received, roundOff = false) {
  if (!Number.isFinite(received) || received < 0) throw new Error('Payment amount must be finite and non-negative.');
  const subtotal = items.reduce((total, item) => total + item.qty * item.price, 0);
  const discountTotal = items.reduce((total, item) => total + item.discount, 0);
  const taxTotal = items.reduce((total, item) => total + item.taxAmount, 0);
  const cgstTotal = items.reduce((total, item) => total + Number(item.cgstAmount || 0), 0);
  const sgstTotal = items.reduce((total, item) => total + Number(item.sgstAmount || 0), 0);
  const igstTotal = items.reduce((total, item) => total + Number(item.igstAmount || 0), 0);
  const cessTotal = items.reduce((total, item) => total + Number(item.cessAmount || 0), 0);
  const unroundedTotal = items.length
    ? Math.max(0, subtotal - discountTotal + taxTotal)
    : Number(fallbackTotal || 0);
  const total = roundOff ? Math.round(unroundedTotal) : Math.round((unroundedTotal + Number.EPSILON) * 100) / 100;
  if (received > total + 0.000001) throw new Error('Payment cannot exceed invoice total.');
  const safeReceived = Math.min(Math.max(0, Number(received || 0)), total);
  return {
    subtotal,
    discountTotal,
    taxTotal,
    cgstTotal,
    sgstTotal,
    igstTotal,
    cessTotal,
    total,
    received: safeReceived,
    balance: Math.max(0, total - safeReceived),
  };
}

function createInitialPayment(companyId, transaction, amount, method, now) {
  const payment = {
    id: makeId(),
    type: transaction.type === "sale" ? "payment_in" : "payment_out",
    party: transaction.party,
    amount: Math.min(Number(amount || 0), Number(transaction.amount || 0)),
    method,
    date: transaction.date || now,
    notes: `Initial ${transaction.type === "sale" ? "receipt" : "payment"} for ${transaction.invoiceNo}`,
  };
  if (payment.amount <= 0) return;

  run(
    `INSERT INTO payments
      (id, company_id, invoice_id, transaction_id, type, party, party_id, amount, method, payment_date, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payment.id,
      companyId,
      transaction.invoiceId,
      transaction.id,
      payment.type,
      payment.party,
      transaction.partyId || resolvePartyId(companyId, null, payment.party),
      payment.amount,
      payment.method,
      payment.date,
      payment.notes,
      now,
    ],
  );
  postPaymentLedger(companyId, transaction, payment);
}

function validatePaymentRequest(payload = {}, invoiceType) {
  const company = getCurrentCompany();
  const amount = Number(payload.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Payment amount must be finite and greater than zero.');
  if (payload.allocations != null && !Array.isArray(payload.allocations)) throw new Error('Invalid payment allocations.');
  const allocations = payload.allocations || [];
  if (payload.invoiceId && allocations.length) throw new Error('Choose an invoice or allocations, not both.');
  let party = payload.partyId
    ? one('SELECT id, name, type FROM parties WHERE company_id = ? AND id = ?', [company.id, payload.partyId])
    : one('SELECT id, name, type FROM parties WHERE company_id = ? AND LOWER(name) = LOWER(?)', [company.id, String(payload.party || payload.partyName || payload.customer || payload.supplier || '').trim()]);
  if ((payload.partyId || payload.party || payload.partyName || payload.customer || payload.supplier) && !party) throw new Error('Select an existing party in this company.');
  const seen = new Set();
  let allocated = 0;
  const targets = allocations.length ? allocations : payload.invoiceId ? [{ invoiceId: payload.invoiceId }] : [];
  for (const target of targets) {
    if (!target || seen.has(String(target.invoiceId))) throw new Error('Duplicate or invalid invoice allocation.');
    seen.add(String(target.invoiceId));
    const invoice = one("SELECT party_id AS partyId, balance FROM invoices WHERE company_id = ? AND id = ? AND type = ? AND status <> 'cancelled'", [company.id, target.invoiceId, invoiceType]);
    if (!invoice) throw new Error('Active invoice not found in this company.');
    if (!party) party = one('SELECT id, name, type FROM parties WHERE company_id = ? AND id = ?', [company.id, invoice.partyId]);
    if (!party || Number(invoice.partyId) !== Number(party.id)) throw new Error('All allocations must belong to the same party.');
    if (allocations.length) {
      const value = Number(target.amount);
      if (!Number.isFinite(value) || value <= 0 || value > Number(invoice.balance)) throw new Error('Allocation must be positive, finite and within the invoice balance.');
      allocated += value;
    }
  }
  if (!party) throw new Error('Select an existing party for on-account payment.');
  const role = invoiceType === 'sale' ? 'customer' : 'supplier';
  if (['customer', 'supplier'].includes(party.type) && party.type !== role) throw new Error(`Select a ${role} for this payment.`);
  if (allocated > amount + 0.000001) throw new Error('Allocated amount exceeds total payment amount.');
  return { ...payload, partyId: party.id, party: party.name, amount };
}

function recordPaymentIn(payload) {
  return inDatabaseTransaction(() => recordPaymentInUnsafe(validatePaymentRequest(payload, 'sale')));
}

function recordPaymentInUnsafe(payload = {}) {
  const {
    invoiceId = null,
    amount = 0,
    method = "Cash",
    paymentDate = "",
    notes = "",
    allocations = null,
  } = payload;
  let partyId = payload.partyId || null;
  let party = String(payload.party || payload.partyName || payload.customer || "").trim();
  const company = getCurrentCompany();
  if (!party && partyId) {
    const pRow = one("SELECT name FROM parties WHERE company_id = ? AND id = ?", [company.id, partyId]);
    if (pRow) party = pRow.name;
  }
  const now = new Date().toISOString();
  const date = paymentDate || now;
  const numAmount = Number(amount || 0);
  if (!Number.isFinite(numAmount)) {
    throw new Error("Payment amount must be finite.");
  }
  if (numAmount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  // Case A: Multi-invoice allocation
  if (Array.isArray(allocations) && allocations.length > 0) {
    let allocatedTotal = 0;
    const targetParty = String(party || "").trim();
    for (const alloc of allocations) {
      const inv = one(
        "SELECT id, invoice_no AS invoiceNo, party, party_id AS partyId, balance, total, received, transaction_id AS transactionId FROM invoices WHERE company_id = ? AND id = ? AND type = 'sale' AND status <> 'cancelled'",
        [company.id, alloc.invoiceId]
      );
      if (!inv) throw new Error(`Sale invoice not found: ${alloc.invoiceId}`);
      if (targetParty && inv.party.toLowerCase() !== targetParty.toLowerCase()) {
        throw new Error(`Cannot allocate payment across different parties: ${inv.party} vs ${targetParty}`);
      }
      const allocAmt = Math.min(Number(alloc.amount || 0), Math.max(0, Number(inv.balance || 0)));
      if (allocAmt > 0) {
        allocatedTotal += allocAmt;
        if (allocatedTotal > numAmount) throw new Error("Allocated amount exceeds total payment amount.");
        const pId = makeId();
        run(
          `INSERT INTO payments (id, company_id, invoice_id, transaction_id, type, party, party_id, amount, method, payment_date, notes, created_at)
           VALUES (?, ?, ?, ?, 'payment_in', ?, ?, ?, ?, ?, ?, ?)`,
          [pId, company.id, inv.id, inv.transactionId, inv.party, inv.partyId, allocAmt, method, date, notes || `Payment against ${inv.invoiceNo}`, now]
        );
        postPaymentLedger(company.id, { id: inv.transactionId, date }, { type: "payment_in", party: inv.party, amount: allocAmt, method, date, notes: notes || `Payment against ${inv.invoiceNo}` });
        const newReceived = Number(inv.received || 0) + allocAmt;
        const newBalance = Math.max(0, Number(inv.total || 0) - newReceived);
        const newStatus = newBalance <= 0 ? "paid" : "partially_paid";
        run("UPDATE invoices SET received = ?, balance = ?, status = ? WHERE company_id = ? AND id = ?", [newReceived, newBalance, newStatus, company.id, inv.id]);
        run("UPDATE transactions SET status = ? WHERE company_id = ? AND id = ?", [newBalance <= 0 ? "paid" : "due", company.id, inv.transactionId]);
      }
    }
    const unallocated = numAmount - allocatedTotal;
    if (unallocated > 0) {
      const finalPartyId = resolvePartyId(company.id, partyId, targetParty);
      const txId = makeId();
      run(
        `INSERT INTO transactions (id, company_id, invoice_id, invoice_no, type, party, party_id, item, amount, payment_type, status, notes, meta_json, transaction_date, created_at, updated_at)
         VALUES (?, ?, NULL, '', 'payment_in', ?, ?, '', ?, ?, 'completed', ?, '{}', ?, ?, ?)`,
        [txId, company.id, targetParty, finalPartyId, unallocated, method, notes || "On-account payment", date, now, now]
      );
      const pId = makeId();
      run(
        `INSERT INTO payments (id, company_id, invoice_id, transaction_id, type, party, party_id, amount, method, payment_date, notes, created_at)
         VALUES (?, ?, NULL, ?, 'payment_in', ?, ?, ?, ?, ?, ?, ?)`,
        [pId, company.id, txId, targetParty, finalPartyId, unallocated, method, date, notes || "On-account payment", now]
      );
      postPaymentLedger(company.id, { id: txId, date }, { type: "payment_in", party: targetParty, amount: unallocated, method, date, notes: notes || "On-account payment" });
    }
    persist();
    return getState();
  }

  // Case B: Single invoice linked
  if (invoiceId) {
    const invoice = one(
      "SELECT id, transaction_id AS transactionId, invoice_no AS invoiceNo, party, party_id AS partyId, total, received, balance, status FROM invoices WHERE company_id = ? AND id = ? AND type = 'sale'",
      [company.id, String(invoiceId).trim()]
    );
    if (!invoice) throw new Error("Sale invoice not found.");
    if (String(invoice.status || "").toLowerCase() === "cancelled") throw new Error("Cannot record payment against a cancelled invoice.");

    const invBalance = Math.max(0, Number(invoice.balance || 0));
    if (invBalance <= 0 && numAmount > 0) {
      // Invoice is already fully paid, treat as on-account payment
      return recordPaymentInUnsafe({ party: invoice.party, partyId: invoice.partyId, amount: numAmount, method, paymentDate: date, notes });
    }

    const allocAmount = Math.min(numAmount, invBalance);
    const unallocatedAmount = numAmount - allocAmount;

    if (allocAmount > 0) {
      const pId = makeId();
      run(
        `INSERT INTO payments (id, company_id, invoice_id, transaction_id, type, party, party_id, amount, method, payment_date, notes, created_at)
         VALUES (?, ?, ?, ?, 'payment_in', ?, ?, ?, ?, ?, ?, ?)`,
        [pId, company.id, invoice.id, invoice.transactionId, invoice.party, invoice.partyId, allocAmount, method, date, notes || `Receipt for ${invoice.invoiceNo}`, now]
      );
      postPaymentLedger(company.id, { id: invoice.transactionId, date }, { type: "payment_in", party: invoice.party, amount: allocAmount, method, date, notes: notes || `Receipt for ${invoice.invoiceNo}` });
      const received = Number(invoice.received || 0) + allocAmount;
      const nextBalance = Math.max(0, Number(invoice.total || 0) - received);
      const status = nextBalance <= 0 ? "paid" : "partially_paid";
      run("UPDATE invoices SET received = ?, balance = ?, status = ? WHERE company_id = ? AND id = ?", [received, nextBalance, status, company.id, invoice.id]);
      run("UPDATE transactions SET status = ? WHERE company_id = ? AND id = ?", [nextBalance <= 0 ? "paid" : "due", company.id, invoice.transactionId]);
    }

    if (unallocatedAmount > 0) {
      const txId = makeId();
      run(
        `INSERT INTO transactions (id, company_id, invoice_id, invoice_no, type, party, party_id, item, amount, payment_type, status, notes, meta_json, transaction_date, created_at, updated_at)
         VALUES (?, ?, NULL, '', 'payment_in', ?, ?, '', ?, ?, 'completed', ?, '{}', ?, ?, ?)`,
        [txId, company.id, invoice.party, invoice.partyId, unallocatedAmount, method, notes || "Advance receipt excess", date, now, now]
      );
      const pId = makeId();
      run(
        `INSERT INTO payments (id, company_id, invoice_id, transaction_id, type, party, party_id, amount, method, payment_date, notes, created_at)
         VALUES (?, ?, NULL, ?, 'payment_in', ?, ?, ?, ?, ?, ?, ?)`,
        [pId, company.id, txId, invoice.party, invoice.partyId, unallocatedAmount, method, date, notes || "Advance receipt excess", now]
      );
      postPaymentLedger(company.id, { id: txId, date }, { type: "payment_in", party: invoice.party, amount: unallocatedAmount, method, date, notes: notes || "Advance receipt excess" });
    }

    persist();
    return getState();
  }

  // Case C: On-account payment / customer advance
  const cleanParty = String(party || "").trim();
  if (!cleanParty) throw new Error("Customer name is required for on-account payment.");
  const finalPartyId = resolvePartyId(company.id, partyId, cleanParty);

  const txId = makeId();
  run(
    `INSERT INTO transactions (id, company_id, invoice_id, invoice_no, type, party, party_id, item, amount, payment_type, status, notes, meta_json, transaction_date, created_at, updated_at)
     VALUES (?, ?, NULL, '', 'payment_in', ?, ?, '', ?, ?, 'completed', ?, '{}', ?, ?, ?)`,
    [txId, company.id, cleanParty, finalPartyId, numAmount, method, notes || "On-account payment", date, now, now]
  );
  const pId = makeId();
  run(
    `INSERT INTO payments (id, company_id, invoice_id, transaction_id, type, party, party_id, amount, method, payment_date, notes, created_at)
     VALUES (?, ?, NULL, ?, 'payment_in', ?, ?, ?, ?, ?, ?, ?)`,
    [pId, company.id, txId, cleanParty, finalPartyId, numAmount, method, date, notes || "On-account payment", now]
  );
  postPaymentLedger(company.id, { id: txId, date }, { type: "payment_in", party: cleanParty, amount: numAmount, method, date, notes: notes || "On-account payment" });

  persist();
  return getState();
}

function recordPaymentOut(payload) {
  return inDatabaseTransaction(() => recordPaymentOutUnsafe(validatePaymentRequest(payload, 'purchase')));
}

function recordPaymentOutUnsafe(payload = {}) {
  const {
    invoiceId = null,
    amount = 0,
    method = "Cash",
    paymentDate = "",
    notes = "",
    allocations = null,
  } = payload;
  let partyId = payload.partyId || null;
  let party = String(payload.party || payload.partyName || payload.supplier || "").trim();
  const company = getCurrentCompany();
  if (!party && partyId) {
    const pRow = one("SELECT name FROM parties WHERE company_id = ? AND id = ?", [company.id, partyId]);
    if (pRow) party = pRow.name;
  }
  const now = new Date().toISOString();
  const date = paymentDate || now;
  const numAmount = Number(amount || 0);
  if (!Number.isFinite(numAmount)) {
    throw new Error("Payment amount must be finite.");
  }
  if (numAmount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  // Case A: Multi-bill allocation
  if (Array.isArray(allocations) && allocations.length > 0) {
    let allocatedTotal = 0;
    const targetParty = String(party || "").trim();
    for (const alloc of allocations) {
      const inv = one(
        "SELECT id, invoice_no AS invoiceNo, party, party_id AS partyId, balance, total, received, transaction_id AS transactionId FROM invoices WHERE company_id = ? AND id = ? AND type = 'purchase' AND status <> 'cancelled'",
        [company.id, alloc.invoiceId]
      );
      if (!inv) throw new Error(`Purchase invoice not found: ${alloc.invoiceId}`);
      if (targetParty && inv.party.toLowerCase() !== targetParty.toLowerCase()) {
        throw new Error(`Cannot allocate payment across different parties: ${inv.party} vs ${targetParty}`);
      }
      const allocAmt = Math.min(Number(alloc.amount || 0), Math.max(0, Number(inv.balance || 0)));
      if (allocAmt > 0) {
        allocatedTotal += allocAmt;
        if (allocatedTotal > numAmount) throw new Error("Allocated amount exceeds total payment amount.");
        const pId = makeId();
        run(
          `INSERT INTO payments (id, company_id, invoice_id, transaction_id, type, party, party_id, amount, method, payment_date, notes, created_at)
           VALUES (?, ?, ?, ?, 'payment_out', ?, ?, ?, ?, ?, ?, ?)`,
          [pId, company.id, inv.id, inv.transactionId, inv.party, inv.partyId, allocAmt, method, date, notes || `Payment against ${inv.invoiceNo}`, now]
        );
        postPaymentLedger(company.id, { id: inv.transactionId, date }, { type: "payment_out", party: inv.party, amount: allocAmt, method, date, notes: notes || `Payment against ${inv.invoiceNo}` });
        const newReceived = Number(inv.received || 0) + allocAmt;
        const newBalance = Math.max(0, Number(inv.total || 0) - newReceived);
        const newStatus = newBalance <= 0 ? "paid" : "partially_paid";
        run("UPDATE invoices SET received = ?, balance = ?, status = ? WHERE company_id = ? AND id = ?", [newReceived, newBalance, newStatus, company.id, inv.id]);
        run("UPDATE transactions SET status = ? WHERE company_id = ? AND id = ?", [newBalance <= 0 ? "paid" : "due", company.id, inv.transactionId]);
      }
    }
    const unallocated = numAmount - allocatedTotal;
    if (unallocated > 0) {
      const finalPartyId = resolvePartyId(company.id, partyId, targetParty);
      const txId = makeId();
      run(
        `INSERT INTO transactions (id, company_id, invoice_id, invoice_no, type, party, party_id, item, amount, payment_type, status, notes, meta_json, transaction_date, created_at, updated_at)
         VALUES (?, ?, NULL, '', 'payment_out', ?, ?, '', ?, ?, 'completed', ?, '{}', ?, ?, ?)`,
        [txId, company.id, targetParty, finalPartyId, unallocated, method, notes || "Supplier advance", date, now, now]
      );
      const pId = makeId();
      run(
        `INSERT INTO payments (id, company_id, invoice_id, transaction_id, type, party, party_id, amount, method, payment_date, notes, created_at)
         VALUES (?, ?, NULL, ?, 'payment_out', ?, ?, ?, ?, ?, ?, ?)`,
        [pId, company.id, txId, targetParty, finalPartyId, unallocated, method, date, notes || "Supplier advance", now]
      );
      postPaymentLedger(company.id, { id: txId, date }, { type: "payment_out", party: targetParty, amount: unallocated, method, date, notes: notes || "Supplier advance" });
    }
    persist();
    return getState();
  }

  // Case B: Single purchase invoice linked
  if (invoiceId) {
    const invoice = one(
      "SELECT id, transaction_id AS transactionId, invoice_no AS invoiceNo, party, party_id AS partyId, total, received, balance, status FROM invoices WHERE company_id = ? AND id = ? AND type = 'purchase'",
      [company.id, String(invoiceId).trim()]
    );
    if (!invoice) throw new Error("Purchase invoice not found.");
    if (String(invoice.status || "").toLowerCase() === "cancelled") throw new Error("Cannot record payment against a cancelled invoice.");

    const invBalance = Math.max(0, Number(invoice.balance || 0));
    if (invBalance <= 0 && numAmount > 0) {
      // Invoice is already fully paid, treat as supplier advance
      return recordPaymentOutUnsafe({ party: invoice.party, partyId: invoice.partyId, amount: numAmount, method, paymentDate: date, notes });
    }

    const allocAmount = Math.min(numAmount, invBalance);
    const unallocatedAmount = numAmount - allocAmount;

    if (allocAmount > 0) {
      const pId = makeId();
      run(
        `INSERT INTO payments (id, company_id, invoice_id, transaction_id, type, party, party_id, amount, method, payment_date, notes, created_at)
         VALUES (?, ?, ?, ?, 'payment_out', ?, ?, ?, ?, ?, ?, ?)`,
        [pId, company.id, invoice.id, invoice.transactionId, invoice.party, invoice.partyId, allocAmount, method, date, notes || `Payment for ${invoice.invoiceNo}`, now]
      );
      postPaymentLedger(company.id, { id: invoice.transactionId, date }, { type: "payment_out", party: invoice.party, amount: allocAmount, method, date, notes: notes || `Payment for ${invoice.invoiceNo}` });
      const received = Number(invoice.received || 0) + allocAmount;
      const nextBalance = Math.max(0, Number(invoice.total || 0) - received);
      const status = nextBalance <= 0 ? "paid" : "partially_paid";
      run("UPDATE invoices SET received = ?, balance = ?, status = ? WHERE company_id = ? AND id = ?", [received, nextBalance, status, company.id, invoice.id]);
      run("UPDATE transactions SET status = ? WHERE company_id = ? AND id = ?", [nextBalance <= 0 ? "paid" : "due", company.id, invoice.transactionId]);
    }

    if (unallocatedAmount > 0) {
      const txId = makeId();
      run(
        `INSERT INTO transactions (id, company_id, invoice_id, invoice_no, type, party, party_id, item, amount, payment_type, status, notes, meta_json, transaction_date, created_at, updated_at)
         VALUES (?, ?, NULL, '', 'payment_out', ?, ?, '', ?, ?, 'completed', ?, '{}', ?, ?, ?)`,
        [txId, company.id, invoice.party, invoice.partyId, unallocatedAmount, method, notes || "Supplier advance excess", date, now, now]
      );
      const pId = makeId();
      run(
        `INSERT INTO payments (id, company_id, invoice_id, transaction_id, type, party, party_id, amount, method, payment_date, notes, created_at)
         VALUES (?, ?, NULL, ?, 'payment_out', ?, ?, ?, ?, ?, ?, ?)`,
        [pId, company.id, txId, invoice.party, invoice.partyId, unallocatedAmount, method, date, notes || "Supplier advance excess", now]
      );
      postPaymentLedger(company.id, { id: txId, date }, { type: "payment_out", party: invoice.party, amount: unallocatedAmount, method, date, notes: notes || "Supplier advance excess" });
    }

    persist();
    return getState();
  }

  // Case C: Supplier advance (no invoiceId)
  const cleanParty = String(party || "").trim();
  if (!cleanParty) throw new Error("Supplier name is required for supplier payment.");
  const finalPartyId = resolvePartyId(company.id, partyId, cleanParty);

  const txId = makeId();
  run(
    `INSERT INTO transactions (id, company_id, invoice_id, invoice_no, type, party, party_id, item, amount, payment_type, status, notes, meta_json, transaction_date, created_at, updated_at)
     VALUES (?, ?, NULL, '', 'payment_out', ?, ?, '', ?, ?, 'completed', ?, '{}', ?, ?, ?)`,
    [txId, company.id, cleanParty, finalPartyId, numAmount, method, notes || "Supplier advance", date, now, now]
  );
  const pId = makeId();
  run(
    `INSERT INTO payments (id, company_id, invoice_id, transaction_id, type, party, party_id, amount, method, payment_date, notes, created_at)
     VALUES (?, ?, NULL, ?, 'payment_out', ?, ?, ?, ?, ?, ?, ?)`,
    [pId, company.id, txId, cleanParty, finalPartyId, numAmount, method, date, notes || "Supplier advance", now]
  );
  postPaymentLedger(company.id, { id: txId, date }, { type: "payment_out", party: cleanParty, amount: numAmount, method, date, notes: notes || "Supplier advance" });

  persist();
  return getState();
}

function recordInvoicePayment(payload) {
  return inDatabaseTransaction(() => recordInvoicePaymentUnsafe(payload));
}

function recordInvoicePaymentUnsafe({ invoiceId, amount = 0, method = "Cash", paymentDate = "", notes = "" }) {
  const company = getCurrentCompany();
  const inv = one(
    "SELECT type FROM invoices WHERE company_id = ? AND id = ?",
    [company.id, String(invoiceId || "").trim()]
  );
  if (!inv) throw new Error("Invoice not found.");
  if (inv.type === "purchase") {
    return recordPaymentOutUnsafe({ invoiceId, amount, method, paymentDate, notes });
  }
  return recordPaymentInUnsafe({ invoiceId, amount, method, paymentDate, notes });
}

function setInvoiceStatus(payload) {
  return inDatabaseTransaction(() => setInvoiceStatusUnsafe(payload));
}

function setInvoiceStatusUnsafe({ invoiceId, status = "", notes = "" }) {
  const company = getCurrentCompany();
  const cleanStatus = String(status || "").trim().toLowerCase();
  if (!cleanStatus) throw new Error("Status is required.");
  const invoice = one(
    "SELECT id, transaction_id AS transactionId, invoice_no AS invoiceNo, type, status, received, notes FROM invoices WHERE company_id = ? AND id = ?",
    [company.id, String(invoiceId || "").trim()],
  );
  if (!invoice) throw new Error("Invoice not found.");

  const nextNotes = [invoice.notes, notes].filter(Boolean).join("\n");
  if (cleanStatus !== 'cancelled') throw new Error('Invoice payment status is calculated from recorded payments.');
  if (invoice.status === 'cancelled') return getState();
  if (invoice.type === 'purchase') validatePurchaseRemoval(company.id, invoice.id);
  if (cleanStatus === "cancelled") {
    if (Number(invoice.received || 0) > 0) throw new Error("Refund or reverse recorded payments before cancelling this invoice.");
    run("DELETE FROM stock_movements WHERE company_id = ? AND invoice_id = ?", [company.id, invoice.id]);
    run("DELETE FROM ledger_entries WHERE company_id = ? AND transaction_id = ?", [company.id, invoice.transactionId]);
    run("UPDATE tax_entries SET is_cancelled = 1 WHERE company_id = ? AND source_type = ? AND source_id = ?", [company.id, invoice.type, invoice.id]);
    run("UPDATE invoices SET status = ?, balance = 0, notes = ? WHERE company_id = ? AND id = ?", [cleanStatus, nextNotes, company.id, invoice.id]);
    run("UPDATE transactions SET status = ?, notes = ? WHERE company_id = ? AND id = ?", [cleanStatus, nextNotes, company.id, invoice.transactionId]);
  } else {
    run("UPDATE invoices SET status = ?, notes = ? WHERE company_id = ? AND id = ?", [cleanStatus, nextNotes, company.id, invoice.id]);
    run("UPDATE transactions SET status = ?, notes = ? WHERE company_id = ? AND id = ?", [cleanStatus, nextNotes, company.id, invoice.transactionId]);
  }
  recordAuditLog(
    company.id,
    cleanStatus === "cancelled" ? "CANCEL" : "STATUS_CHANGE",
    "invoice",
    invoice.id,
    invoice.invoiceNo,
    { status: cleanStatus, notes: nextNotes }
  );
  persist();
  return getState();
}

function deleteInvoice(payload) {
  return inDatabaseTransaction(() => deleteInvoiceUnsafe(payload));
}

function deleteInvoiceUnsafe({ invoiceId }) {
  const company = getCurrentCompany();
  const invoice = one(
    "SELECT id, transaction_id AS transactionId, invoice_no AS invoiceNo, type, received FROM invoices WHERE company_id = ? AND id = ?",
    [company.id, String(invoiceId || "").trim()],
  );
  if (!invoice) throw new Error("Invoice not found.");
  if (Number(invoice.received) > 0 || one('SELECT id FROM payments WHERE company_id = ? AND invoice_id = ?', [company.id, invoice.id])) throw new Error('Cannot delete an invoice with recorded payments.');
  if (invoice.type === 'purchase') validatePurchaseRemoval(company.id, invoice.id);
  run("DELETE FROM payments WHERE company_id = ? AND invoice_id = ?", [company.id, invoice.id]);
  run("DELETE FROM stock_movements WHERE company_id = ? AND invoice_id = ?", [company.id, invoice.id]);
  run("DELETE FROM invoice_items WHERE invoice_id = ?", [invoice.id]);
  run("DELETE FROM ledger_entries WHERE company_id = ? AND transaction_id = ?", [company.id, invoice.transactionId]);
  run("DELETE FROM transactions WHERE company_id = ? AND id = ?", [company.id, invoice.transactionId]);
  run("DELETE FROM tax_entries WHERE company_id = ? AND source_type = ? AND source_id = ?", [company.id, invoice.type, invoice.id]);
  run("DELETE FROM invoices WHERE company_id = ? AND id = ?", [company.id, invoice.id]);
  recordAuditLog(
    company.id,
    "DELETE",
    "invoice",
    invoice.id,
    invoice.invoiceNo,
    { type: invoice.type }
  );
  persist();
  return getState();
}

function recordStockAdjustment(payload) {
  return inDatabaseTransaction(() => recordStockAdjustmentUnsafe(payload));
}

function recordStockAdjustmentUnsafe(payload = {}) {
  const company = getCurrentCompany();
  if (!company?.id) throw new Error("No active company found.");
  const {
    itemId,
    quantity,
    direction = "reduce",
    reason = "Stock Adjustment",
    notes = "",
    unitPrice = 0,
    adjustmentDate = "",
  } = payload;

  const numQty = Number(quantity);
  if (!Number.isFinite(numQty) || numQty <= 0) {
    throw new Error("Adjustment quantity must be greater than zero.");
  }
  if (!['reduce', 'add'].includes(direction)) throw new Error('Invalid adjustment direction.');
  if (!String(reason || '').trim()) throw new Error('Adjustment reason is required.');
  if (!Number.isFinite(Number(unitPrice)) || Number(unitPrice) < 0) throw new Error('Unit cost must be finite and non-negative.');
  const item = one("SELECT id, name, unit, purchase_price AS purchasePrice, item_type AS itemType FROM items WHERE company_id = ? AND id = ?", [company.id, itemId]);
  if (!item) {
    throw new Error("Item not found.");
  }
  if (String(item.itemType || "product").toLowerCase() === "service") {
    throw new Error("Cannot adjust stock for service items.");
  }
  if (direction === 'reduce') validateSaleStock(company.id, [{ itemId: item.id, qty: numQty }]);

  const effectiveQty = direction === "reduce" ? -numQty : numQty;
  const now = new Date().toISOString();
  const date = adjustmentDate || now;
  const rate = Number(unitPrice || item.purchasePrice || 0);
  const smId = makeId();
  const noteText = [reason, notes].filter(Boolean).join(" - ");

  run(
    `INSERT INTO stock_movements
      (id, company_id, invoice_id, transaction_id, item_id, item_name, movement_type,
       quantity, unit, rate, movement_date, notes, created_at)
     VALUES (?, ?, NULL, NULL, ?, ?, 'adjustment', ?, ?, ?, ?, ?, ?)`,
    [
      smId,
      company.id,
      item.id,
      item.name,
      effectiveQty,
      item.unit || "",
      rate,
      date,
      noteText,
      now,
    ]
  );

  recordAuditLog(
    company.id,
    "STOCK_ADJUSTMENT",
    "stock_movements",
    smId,
    null,
    { itemId: item.id, itemName: item.name, direction, quantity: numQty, reason, noteText }
  );

  persist();
  return getState();
}

function postPaymentLedger(companyId, transaction, payment) {
  const entries = payment.type === "payment_in"
    ? [
        { account: payment.method, debit: payment.amount, credit: 0 },
        { account: "Accounts Receivable", debit: 0, credit: payment.amount },
      ]
    : [
        { account: "Accounts Payable", debit: payment.amount, credit: 0 },
        { account: payment.method, debit: 0, credit: payment.amount },
      ];

  for (const entry of entries) {
    run(
      `INSERT INTO ledger_entries
        (company_id, transaction_id, account, debit, credit, entry_date, narration)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        companyId,
        transaction.id,
        entry.account,
        entry.debit,
        entry.credit,
        payment.date,
        payment.notes,
      ],
    );
  }
}

function postLedger(companyId, transaction) {
  const entries = ledgerFor(transaction);
  for (const entry of entries) {
    run(
      `INSERT INTO ledger_entries
        (company_id, transaction_id, account, debit, credit, entry_date, narration)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        companyId,
        transaction.id,
        entry.account,
        entry.debit,
        entry.credit,
        transaction.date,
        transaction.notes || `${transaction.type} - ${transaction.party}`,
      ],
    );
  }
}

function ledgerFor(transaction) {
  const amount = Number(transaction.amount || 0);
  const meta = parseMetaJson(transaction.metaJson || transaction.meta || {});

  if (transaction.type === "sale") {
    const cgstTotal = Math.max(0, Number(transaction.cgstTotal ?? meta.cgstTotal ?? 0));
    const sgstTotal = Math.max(0, Number(transaction.sgstTotal ?? meta.sgstTotal ?? 0));
    const igstTotal = Math.max(0, Number(transaction.igstTotal ?? meta.igstTotal ?? 0));
    const cessTotal = Math.max(0, Number(transaction.cessTotal ?? meta.cessTotal ?? 0));
    const taxTotal = cgstTotal + sgstTotal + igstTotal + cessTotal;
    const taxableValue = Math.max(0, Number(transaction.subtotal ?? meta.subtotal ?? (amount - taxTotal) ?? amount));
    const roundOff = Number((amount - (taxableValue + taxTotal)).toFixed(2));

    const entries = [
      { account: "Accounts Receivable", debit: amount, credit: 0 },
      { account: "Sales", debit: 0, credit: taxableValue },
    ];
    if (cgstTotal > 0) entries.push({ account: "Output CGST", debit: 0, credit: cgstTotal });
    if (sgstTotal > 0) entries.push({ account: "Output SGST", debit: 0, credit: sgstTotal });
    if (igstTotal > 0) entries.push({ account: "Output IGST", debit: 0, credit: igstTotal });
    if (cessTotal > 0) entries.push({ account: "Output Cess", debit: 0, credit: cessTotal });
    if (roundOff > 0) entries.push({ account: "Round Off", debit: 0, credit: roundOff });
    if (roundOff < 0) entries.push({ account: "Round Off", debit: Math.abs(roundOff), credit: 0 });
    return entries;
  }

  if (transaction.type === "purchase") {
    const cgstTotal = Math.max(0, Number(transaction.cgstTotal ?? meta.cgstTotal ?? 0));
    const sgstTotal = Math.max(0, Number(transaction.sgstTotal ?? meta.sgstTotal ?? 0));
    const igstTotal = Math.max(0, Number(transaction.igstTotal ?? meta.igstTotal ?? 0));
    const cessTotal = Math.max(0, Number(transaction.cessTotal ?? meta.cessTotal ?? 0));
    const taxTotal = cgstTotal + sgstTotal + igstTotal + cessTotal;
    const taxableValue = Math.max(0, Number(transaction.subtotal ?? meta.subtotal ?? (amount - taxTotal) ?? amount));
    const roundOff = Number((amount - (taxableValue + taxTotal)).toFixed(2));

    const entries = [
      { account: "Purchases", debit: taxableValue, credit: 0 },
    ];
    if (cgstTotal > 0) entries.push({ account: "Input CGST", debit: cgstTotal, credit: 0 });
    if (sgstTotal > 0) entries.push({ account: "Input SGST", debit: sgstTotal, credit: 0 });
    if (igstTotal > 0) entries.push({ account: "Input IGST", debit: igstTotal, credit: 0 });
    if (cessTotal > 0) entries.push({ account: "Input Cess", debit: cessTotal, credit: 0 });
    if (roundOff > 0) entries.push({ account: "Round Off", debit: roundOff, credit: 0 });
    if (roundOff < 0) entries.push({ account: "Round Off", debit: 0, credit: Math.abs(roundOff) });
    entries.push({ account: "Accounts Payable", debit: 0, credit: amount });
    return entries;
  }

  if (transaction.type === "expense") {
    const meta = parseMetaJson(transaction.metaJson || transaction.meta || {});
    const taxTotal = Math.max(0, Number(meta.taxTotal || 0));
    const cgstTotal = Math.max(0, Number(meta.cgstTotal || 0));
    const sgstTotal = Math.max(0, Number(meta.sgstTotal || 0));
    const igstTotal = Math.max(0, Number(meta.igstTotal || 0));
    const taxableValue = Math.max(0, Number(meta.taxableValue || (amount - taxTotal) || amount));
    const paid = Math.min(amount, Math.max(0, Number(meta.paid ?? (transaction.status === "paid" ? amount : 0))));
    const balance = Math.max(0, amount - paid);
    const paymentAccount = String(meta.paymentMethod || transaction.paymentType || "Cash").toLowerCase().includes("bank") ? "Bank" : "Cash";
    const entries = [{ account: meta.category ? `Expense - ${meta.category}` : "Expense", debit: taxableValue, credit: 0 }];
    if (cgstTotal) entries.push({ account: "Input CGST", debit: cgstTotal, credit: 0 });
    if (sgstTotal) entries.push({ account: "Input SGST", debit: sgstTotal, credit: 0 });
    if (igstTotal) entries.push({ account: "Input IGST", debit: igstTotal, credit: 0 });
    if (paid) entries.push({ account: paymentAccount, debit: 0, credit: paid });
    if (balance) entries.push({ account: "Accounts Payable", debit: 0, credit: balance });
    return entries;
  }

  if (transaction.type === "payment_out") {
    return [
      { account: "Accounts Payable", debit: amount, credit: 0 },
      { account: "Cash", debit: 0, credit: amount },
    ];
  }

  return [
    { account: "Cash", debit: amount, credit: 0 },
    { account: "Accounts Receivable", debit: 0, credit: amount },
  ];
}

function normalizeStandaloneTransactionStatus(status, amount = 0, paid = null) {
  const cleanStatus = String(status || "").trim().toLowerCase();
  if (["cancelled", "paid", "due", "partial", "partially_paid"].includes(cleanStatus)) {
    return cleanStatus === "partially_paid" ? "partial" : cleanStatus;
  }
  const total = Number(amount || 0);
  const paidValue = paid === null || paid === undefined ? total : Number(paid || 0);
  if (total <= 0 || paidValue >= total) return "paid";
  if (paidValue > 0) return "partial";
  return "due";
}

function normalizeMetaJson(meta) {
  if (typeof meta === "string") {
    const parsed = parseMetaJson(meta);
    return Object.keys(parsed).length ? JSON.stringify(parsed) : "";
  }
  if (!meta || typeof meta !== "object") return "";
  return JSON.stringify(meta);
}

function parseMetaJson(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function getCurrentCompany() {
  return one("SELECT * FROM companies WHERE is_current = 1 ORDER BY id LIMIT 1")
    || one("SELECT * FROM companies ORDER BY id LIMIT 1");
}

function createUnit({ name, short_name, code, description, allows_decimal_quantity }) {
  return inDatabaseTransaction(() => {
    const company = getCurrentCompany();
    const cleanName = String(name || "").trim();
    if (!cleanName) throw new Error("Unit name is required.");
    const existing = one("SELECT id FROM units WHERE company_id = ? AND LOWER(name) = LOWER(?)", [company.id, cleanName]);
    if (existing) throw new Error("A unit with this name already exists.");
    if (code) {
      const codeExists = one("SELECT id FROM units WHERE company_id = ? AND LOWER(code) = LOWER(?)", [company.id, String(code).trim()]);
      if (codeExists) throw new Error("A unit with this code already exists.");
    }
    const now = new Date().toISOString();
    run("INSERT INTO units (company_id, name, short_name, code, description, allows_decimal_quantity, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)",
      [company.id, cleanName, String(short_name || "").trim() || null, String(code || "").trim() || null, String(description || "").trim() || null, allows_decimal_quantity ? 1 : 0, now, now]);
    const unit = one("SELECT id, name FROM units WHERE company_id = ? AND name = ?", [company.id, cleanName]);
    ensureMasterSyncIdentity("units", unit?.id);
    recordSyncEvent(company.id, "unit", unit?.id, "upsert", one("SELECT id, name, sync_id AS syncId, sync_version AS syncVersion FROM units WHERE id = ?", [unit?.id]));
    return getState();
  });
}

function updateUnit({ id, name, short_name, code, description, allows_decimal_quantity, is_active }) {
  return inDatabaseTransaction(() => {
    const company = getCurrentCompany();
    const cleanName = String(name || "").trim();
    if (!id || !cleanName) return getState();
    const existing = one("SELECT id, name FROM units WHERE company_id = ? AND id = ?", [company.id, id]);
    if (!existing) return getState();
    const duplicate = one("SELECT id FROM units WHERE company_id = ? AND LOWER(name) = LOWER(?) AND id <> ?", [company.id, cleanName, id]);
    if (duplicate) throw new Error("A unit with this name already exists.");
    if (code) {
      const codeExists = one("SELECT id FROM units WHERE company_id = ? AND LOWER(code) = LOWER(?) AND id <> ?", [company.id, String(code).trim(), id]);
      if (codeExists) throw new Error("A unit with this code already exists.");
    }
    const now = new Date().toISOString();
    run("UPDATE units SET name = ?, short_name = ?, code = ?, description = ?, allows_decimal_quantity = ?, is_active = ?, updated_at = ? WHERE company_id = ? AND id = ?",
      [cleanName, String(short_name || "").trim() || null, String(code || "").trim() || null, String(description || "").trim() || null, allows_decimal_quantity ? 1 : 0, is_active !== undefined ? (is_active ? 1 : 0) : 1, now, company.id, id]);
    run("UPDATE units SET sync_version = sync_version + 1, sync_updated_at = ? WHERE company_id = ? AND id = ?", [now, company.id, id]);
    if (existing.name !== cleanName) {
      run("UPDATE items SET unit = ? WHERE company_id = ? AND unit = ?", [cleanName, company.id, existing.name]);
      run("UPDATE invoice_items SET unit = ? WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = ?) AND unit = ?", [cleanName, company.id, existing.name]);
      run("UPDATE stock_movements SET unit = ? WHERE company_id = ? AND unit = ?", [cleanName, company.id, existing.name]);
    }
    recordSyncEvent(company.id, "unit", id, "upsert", one("SELECT id, name, sync_id AS syncId, sync_version AS syncVersion FROM units WHERE id = ?", [id]));
    return getState();
  });
}

function deleteUnit({ id }) {
  return inDatabaseTransaction(() => {
    const company = getCurrentCompany();
    if (!id) return getState();
    const unit = one("SELECT id, name FROM units WHERE company_id = ? AND id = ?", [company.id, id]);
    if (!unit) return getState();
    const usedByItems = one("SELECT COUNT(*) AS cnt FROM items WHERE company_id = ? AND (unit_id = ? OR unit = ?)", [company.id, id, unit.name]);
    const usedByInvoiceItems = one("SELECT COUNT(*) AS cnt FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = ?) AND unit = ?", [company.id, unit.name]);
    const usedByStock = one("SELECT COUNT(*) AS cnt FROM stock_movements WHERE company_id = ? AND unit = ?", [company.id, unit.name]);
    const totalUsage = Number(usedByItems?.cnt || 0) + Number(usedByInvoiceItems?.cnt || 0) + Number(usedByStock?.cnt || 0);
    if (totalUsage > 0) {
      throw new Error(`This unit cannot be deleted because it is used by ${totalUsage} record(s). You can deactivate it instead.`);
    }
    run("DELETE FROM units WHERE company_id = ? AND id = ?", [company.id, id]);
    return getState();
  });
}

function toggleUnitActive({ id, is_active }) {
  return inDatabaseTransaction(() => {
    const company = getCurrentCompany();
    if (!id) return getState();
    run("UPDATE units SET is_active = ?, updated_at = ? WHERE company_id = ? AND id = ?", [is_active ? 1 : 0, new Date().toISOString(), company.id, id]);
    return getState();
  });
}

function createItemCategory({ name, code, description, parent_category_id }) {
  return inDatabaseTransaction(() => {
    const company = getCurrentCompany();
    const cleanName = String(name || "").trim();
    if (!cleanName) throw new Error("Category name is required.");
    const existing = one("SELECT id FROM item_categories WHERE company_id = ? AND LOWER(name) = LOWER(?)", [company.id, cleanName]);
    if (existing) throw new Error("A category with this name already exists.");
    if (code) {
      const codeExists = one("SELECT id FROM item_categories WHERE company_id = ? AND LOWER(code) = LOWER(?)", [company.id, String(code).trim()]);
      if (codeExists) throw new Error("A category with this code already exists.");
    }
    if (parent_category_id) {
      const parent = one("SELECT id FROM item_categories WHERE company_id = ? AND id = ?", [company.id, parent_category_id]);
      if (!parent) throw new Error("Parent category not found.");
      if (Number(parent_category_id) === Number(existing?.id)) throw new Error("A category cannot be its own parent.");
    }
    const now = new Date().toISOString();
    const maxSort = one("SELECT MAX(sort_order) AS maxSort FROM item_categories WHERE company_id = ?", [company.id]);
    run("INSERT INTO item_categories (company_id, name, code, description, parent_category_id, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)",
      [company.id, cleanName, String(code || "").trim() || null, String(description || "").trim() || null, parent_category_id || null, (Number(maxSort?.maxSort || 0)) + 1, now, now]);
    const category = one("SELECT id FROM item_categories WHERE company_id = ? AND name = ?", [company.id, cleanName]);
    ensureMasterSyncIdentity("item_categories", category?.id);
    recordSyncEvent(company.id, "item_category", category?.id, "upsert", one("SELECT id, name, sync_id AS syncId, sync_version AS syncVersion FROM item_categories WHERE id = ?", [category?.id]));
    return getState();
  });
}

function updateItemCategory({ id, name, code, description, parent_category_id, sort_order, is_active }) {
  return inDatabaseTransaction(() => {
    const company = getCurrentCompany();
    const cleanName = String(name || "").trim();
    if (!id || !cleanName) return getState();
    const existing = one("SELECT id, name FROM item_categories WHERE company_id = ? AND id = ?", [company.id, id]);
    if (!existing) return getState();
    const duplicate = one("SELECT id FROM item_categories WHERE company_id = ? AND LOWER(name) = LOWER(?) AND id <> ?", [company.id, cleanName, id]);
    if (duplicate) throw new Error("A category with this name already exists.");
    if (code) {
      const codeExists = one("SELECT id FROM item_categories WHERE company_id = ? AND LOWER(code) = LOWER(?) AND id <> ?", [company.id, String(code).trim(), id]);
      if (codeExists) throw new Error("A category with this code already exists.");
    }
    if (parent_category_id && Number(parent_category_id) === Number(id)) {
      throw new Error("A category cannot be its own parent.");
    }
    const visited = new Set([Number(id)]);
    let ancestor = parent_category_id;
    while (ancestor) {
      if (visited.has(Number(ancestor))) throw new Error("Category hierarchy cannot contain a cycle.");
      visited.add(Number(ancestor));
      const parent = one("SELECT parent_category_id FROM item_categories WHERE company_id = ? AND id = ?", [company.id, ancestor]);
      if (!parent) throw new Error("Parent category not found.");
      ancestor = parent.parent_category_id;
    }
    const now = new Date().toISOString();
    run("UPDATE item_categories SET name = ?, code = ?, description = ?, parent_category_id = ?, sort_order = ?, is_active = ?, updated_at = ? WHERE company_id = ? AND id = ?",
      [cleanName, String(code || "").trim() || null, String(description || "").trim() || null, parent_category_id || null, sort_order !== undefined ? sort_order : 0, is_active !== undefined ? (is_active ? 1 : 0) : 1, now, company.id, id]);
    run("UPDATE item_categories SET sync_version = sync_version + 1, sync_updated_at = ? WHERE company_id = ? AND id = ?", [now, company.id, id]);
    if (existing.name !== cleanName) {
      run("UPDATE items SET category = ? WHERE company_id = ? AND category = ?", [cleanName, company.id, existing.name]);
    }
    recordSyncEvent(company.id, "item_category", id, "upsert", one("SELECT id, name, sync_id AS syncId, sync_version AS syncVersion FROM item_categories WHERE id = ?", [id]));
    return getState();
  });
}

function deleteItemCategory({ id }) {
  return inDatabaseTransaction(() => {
    const company = getCurrentCompany();
    if (!id) return getState();
    const category = one("SELECT id, name FROM item_categories WHERE company_id = ? AND id = ?", [company.id, id]);
    if (!category) return getState();
    const children = one("SELECT COUNT(*) AS cnt FROM item_categories WHERE parent_category_id = ?", [id]);
    if (Number(children?.cnt || 0) > 0) {
      throw new Error("This category has subcategories. Remove or reassign them first.");
    }
    const usedByItems = one("SELECT COUNT(*) AS cnt FROM items WHERE category_id = ?", [id]);
    const usedByName = one("SELECT COUNT(*) AS cnt FROM items WHERE company_id = ? AND category = ?", [company.id, category.name]);
    const totalUsage = Number(usedByItems?.cnt || 0) + Number(usedByName?.cnt || 0);
    if (totalUsage > 0) {
      throw new Error(`This category cannot be deleted because it is used by ${totalUsage} item(s). You can deactivate it instead.`);
    }
    run("DELETE FROM item_categories WHERE company_id = ? AND id = ?", [company.id, id]);
    return getState();
  });
}

function toggleItemCategoryActive({ id, is_active }) {
  return inDatabaseTransaction(() => {
    const company = getCurrentCompany();
    if (!id) return getState();
    run("UPDATE item_categories SET is_active = ?, updated_at = ? WHERE company_id = ? AND id = ?", [is_active ? 1 : 0, new Date().toISOString(), company.id, id]);
    return getState();
  });
}

function getCategoriesWithHierarchy() {
  const company = getCurrentCompany();
  if (!company) return [];
  const categories = all("SELECT id, name, code, description, parent_category_id, sort_order, is_active, created_at, updated_at FROM item_categories WHERE company_id = ? ORDER BY sort_order, name", [company.id]);
  const itemCounts = all("SELECT category_id, COUNT(*) AS cnt FROM items WHERE company_id = ? AND category_id IS NOT NULL GROUP BY category_id", [company.id]);
  const countMap = {};
  for (const row of itemCounts) {
    countMap[row.category_id] = row.cnt;
  }
  return categories.map((cat) => ({
    ...cat,
    is_active: Boolean(cat.is_active),
    item_count: countMap[cat.id] || 0,
  }));
}

function getUnitsList() {
  const company = getCurrentCompany();
  if (!company) return [];
  const units = all("SELECT id, name, short_name, code, description, allows_decimal_quantity, is_active, created_at, updated_at FROM units WHERE company_id = ? ORDER BY name", [company.id]);
  const itemCounts = all("SELECT unit_id, COUNT(*) AS cnt FROM items WHERE company_id = ? AND unit_id IS NOT NULL GROUP BY unit_id", [company.id]);
  const countMap = {};
  for (const row of itemCounts) {
    countMap[row.unit_id] = row.cnt;
  }
  return units.map((u) => ({
    ...u,
    is_active: Boolean(u.is_active),
    allows_decimal_quantity: Boolean(u.allows_decimal_quantity),
    item_count: countMap[u.id] || 0,
  }));
}

function ensureMasterSyncIdentity(table, id) {
  if (!id) return;
  const device = one("SELECT id FROM sync_devices ORDER BY created_at LIMIT 1");
  run(`UPDATE ${table} SET sync_id = COALESCE(NULLIF(sync_id, ''), ?), origin_device_id = COALESCE(origin_device_id, ?), sync_updated_at = COALESCE(sync_updated_at, ?) WHERE id = ?`,
    [randomUUID(), device.id, new Date().toISOString(), id]);
}

function recordSyncEvent(companyId, entityType, localId, operation, payload) {
  if (!localId || !payload) return;
  const device = one("SELECT id FROM sync_devices ORDER BY created_at LIMIT 1");
  const eventId = randomUUID();
  run(
    `INSERT INTO sync_outbox
      (id, company_id, device_id, entity_type, entity_id, operation, base_version, payload_json,
       idempotency_key, status, attempt_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)`,
    [eventId, companyId, device.id, entityType, payload.syncId || String(localId), operation,
      Math.max(0, Number(payload.syncVersion || 1) - 1), JSON.stringify(payload), eventId, new Date().toISOString()],
  );
}

function syncCompany(companyId) {
  const company = companyId === undefined ? getCurrentCompany() : one("SELECT id FROM companies WHERE id = ?", [companyId]);
  if (!company) throw new Error("Unknown sync company.");
  return company;
}

function getSyncStatus(companyId) {
  const company = syncCompany(companyId);
  const device = one("SELECT id, display_name AS displayName, installation_id AS installationId, registered_at AS registeredAt, last_sync_at AS lastSyncAt FROM sync_devices ORDER BY created_at LIMIT 1");
  const counts = all(
    "SELECT status, COUNT(*) AS count FROM sync_outbox WHERE company_id = ? GROUP BY status",
    [company.id],
  ).reduce((result, row) => ({ ...result, [row.status]: Number(row.count) }), {});
  const cursor = one("SELECT pull_cursor AS pullCursor, updated_at AS updatedAt FROM sync_cursors WHERE company_id = ?", [company.id]);
  return {
    companyId: company.id,
    device,
    cursor: cursor?.pullCursor || null,
    cursorUpdatedAt: cursor?.updatedAt || null,
    queue: counts,
    unresolvedConflicts: Number(one("SELECT COUNT(*) AS count FROM sync_conflicts WHERE company_id = ? AND status = 'open'", [company.id])?.count || 0),
  };
}

function claimSyncOutbox(limit = 50, companyId) {
  return inDatabaseTransaction(() => {
    const company = syncCompany(companyId);
    const now = new Date().toISOString();
    const rows = all(
      `SELECT * FROM sync_outbox
       WHERE company_id = ? AND status IN ('pending', 'retry')
         AND NOT EXISTS (SELECT 1 FROM sync_conflicts c WHERE c.company_id = sync_outbox.company_id AND c.entity_type = sync_outbox.entity_type AND c.entity_id = sync_outbox.entity_id AND c.status = 'open')
         AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
       ORDER BY created_at LIMIT ?`,
      [company.id, now, Math.max(1, Math.min(100, Number(limit) || 50))],
    );
    rows.forEach((row) => run(
      "UPDATE sync_outbox SET status = 'uploading', attempt_count = attempt_count + 1, last_error_code = NULL WHERE id = ?",
      [row.id],
    ));
    return rows.map((row) => ({
      id: row.id,
      companyId: row.company_id,
      deviceId: row.device_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      operation: row.operation,
      baseVersion: row.base_version,
      payload: JSON.parse(row.payload_json),
      idempotencyKey: row.idempotency_key,
      attemptCount: Number(row.attempt_count) + 1,
    }));
  });
}

function completeSyncPush(results = []) {
  return inDatabaseTransaction(() => {
    const now = new Date().toISOString();
    results.forEach((result) => {
      const status = String(result.status || "retry");
      if (["accepted", "already_applied"].includes(status)) {
        run("UPDATE sync_outbox SET status = 'acknowledged', acknowledged_at = ?, next_attempt_at = NULL, last_error_code = NULL WHERE id = ? AND status = 'uploading'", [now, result.id]);
      } else if (status === "conflict") {
        const event = one("SELECT * FROM sync_outbox WHERE id = ?", [result.id]);
        if (event) {
          run("UPDATE sync_outbox SET status = 'conflict', last_error_code = ? WHERE id = ?", [result.errorCode || "VERSION_CONFLICT", result.id]);
          insertSyncConflict(event, result.serverVersion, result.serverPayload);
        }
      } else if (status === "rejected") {
        run("UPDATE sync_outbox SET status = 'rejected', last_error_code = ? WHERE id = ?", [result.errorCode || "REJECTED", result.id]);
      } else {
        scheduleSyncRetry(result.id, result.errorCode || "RETRYABLE");
      }
    });
    return getSyncStatus();
  });
}

function retryClaimedSyncEvents(eventIds = [], errorCode = "NETWORK_ERROR") {
  return inDatabaseTransaction(() => {
    eventIds.forEach((id) => scheduleSyncRetry(id, errorCode));
    return getSyncStatus();
  });
}

function scheduleSyncRetry(id, errorCode) {
  const event = one("SELECT attempt_count AS attemptCount FROM sync_outbox WHERE id = ?", [id]);
  if (!event) return;
  const delaySeconds = Math.min(300, 2 ** Math.min(8, Number(event.attemptCount || 1)));
  const nextAttempt = new Date(Date.now() + delaySeconds * 1000).toISOString();
  run("UPDATE sync_outbox SET status = 'retry', next_attempt_at = ?, last_error_code = ? WHERE id = ? AND status = 'uploading'", [nextAttempt, errorCode, id]);
}

function applySyncPull({ changes = [], cursor = null, companyId } = {}) {
  return inDatabaseTransaction(() => {
    const company = syncCompany(companyId);
    if (!Array.isArray(changes) || (cursor !== null && typeof cursor !== 'string')) throw new Error("Invalid sync pull response.");
    changes.forEach((change) => applyRemoteMasterChange(company.id, change));
    run(
      `INSERT INTO sync_cursors (company_id, pull_cursor, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(company_id) DO UPDATE SET pull_cursor = excluded.pull_cursor, updated_at = excluded.updated_at`,
      [company.id, cursor, new Date().toISOString()],
    );
    return getSyncStatus();
  });
}

function applyRemoteMasterChange(companyId, change) {
  if (!change || typeof change.eventId !== 'string' || !change.eventId || typeof change.entityId !== 'string' || !change.entityId ||
      !["unit", "item_category"].includes(change.entityType) || change.operation !== 'upsert' ||
      !Number.isSafeInteger(change.serverVersion) || change.serverVersion < 1 ||
      typeof change.payload?.name !== 'string' || !change.payload.name.trim() ||
      (change.companyId !== undefined && change.companyId !== companyId)) throw new Error("Invalid or unsupported remote master change.");
  const received = one("SELECT company_id FROM sync_inbox WHERE event_id = ?", [change.eventId]);
  if (received && received.company_id !== companyId) throw new Error("Remote event belongs to another company.");
  if (received) return;
  const table = change.entityType === "unit" ? "units" : "item_categories";
  const local = one(`SELECT id, name, sync_version AS syncVersion FROM ${table} WHERE company_id = ? AND sync_id = ?`, [companyId, change.entityId]);
  const pending = one(`SELECT id FROM sync_outbox WHERE company_id = ? AND entity_type = ? AND entity_id = ? AND status IN ('pending','uploading','retry')`, [companyId, change.entityType, change.entityId]);
  const serverVersion = Math.max(1, Number(change.serverVersion || 1));

  if (local && pending) {
    insertSyncConflict({ company_id: companyId, entity_type: change.entityType, entity_id: change.entityId, base_version: local.syncVersion, payload_json: JSON.stringify(local) }, serverVersion, change.payload);
  } else if (!local && change.operation !== "delete") {
    run(`INSERT INTO ${table} (company_id, name, created_at, sync_id, sync_version, origin_device_id, sync_updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [companyId, String(change.payload?.name || "").trim(), new Date().toISOString(), change.entityId, serverVersion, change.deviceId || null, new Date().toISOString()]);
  } else if (local && serverVersion > Number(local.syncVersion || 0)) {
    if (change.operation === "delete") {
      run(`UPDATE ${table} SET deleted_at = ?, sync_version = ?, sync_updated_at = ? WHERE id = ?`, [new Date().toISOString(), serverVersion, new Date().toISOString(), local.id]);
    } else {
      run(`UPDATE ${table} SET name = ?, sync_version = ?, sync_updated_at = ? WHERE id = ?`, [String(change.payload?.name || local.name).trim(), serverVersion, new Date().toISOString(), local.id]);
    }
  }
  run("INSERT INTO sync_inbox (event_id, company_id, entity_type, entity_id, server_version, applied_at) VALUES (?, ?, ?, ?, ?, ?)",
    [change.eventId, companyId, change.entityType, change.entityId, serverVersion, new Date().toISOString()]);
}

function insertSyncConflict(event, serverVersion, serverPayload) {
  const exists = one("SELECT id FROM sync_conflicts WHERE company_id = ? AND entity_type = ? AND entity_id = ? AND status = 'open'", [event.company_id, event.entity_type, event.entity_id]);
  if (exists) return;
  run(`INSERT INTO sync_conflicts
    (id, company_id, entity_type, entity_id, local_version, server_version, local_payload_json, server_payload_json, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
  [randomUUID(), event.company_id, event.entity_type, event.entity_id, event.base_version, serverVersion || null,
    event.payload_json || null, serverPayload ? JSON.stringify(serverPayload) : null, new Date().toISOString()]);
}

function markDeviceSynced(registered = false) {
  return inDatabaseTransaction(() => {
    const now = new Date().toISOString();
    run(`UPDATE sync_devices SET last_sync_at = ?, registered_at = CASE WHEN ? THEN COALESCE(registered_at, ?) ELSE registered_at END`, [now, registered ? 1 : 0, now]);
    return getSyncStatus();
  });
}

function ensureUnit(companyId, name) {
  const cleanName = String(name || "").trim();
  if (!cleanName) return;
  run("INSERT OR IGNORE INTO units (company_id, name, created_at) VALUES (?, ?, ?)", [companyId, cleanName, new Date().toISOString()]);
}

function ensureItemCategory(companyId, name) {
  const cleanName = String(name || "").trim();
  if (!cleanName) return;
  run("INSERT OR IGNORE INTO item_categories (company_id, name, created_at) VALUES (?, ?, ?)", [companyId, cleanName, new Date().toISOString()]);
}

function createPartyWithoutPersist(companyId, name, details = {}) {
  run(
    `INSERT OR IGNORE INTO parties
      (company_id, name, type, phone, gstin, billing_address, shipping_address, opening_balance, credit_limit, payment_terms, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, '', ?)`,
    [
      companyId,
      name,
      details.type || "both",
      details.phone || "",
      details.gstin || "",
      details.billingAddress || "",
      details.shippingAddress || "",
      details.paymentTerms || "",
      new Date().toISOString(),
    ],
  );
  updatePartyDetails(companyId, { name, ...details, openingBalance: null, creditLimit: null });
}

function createItemWithoutPersist(companyId, name) {
  resolveItemId(companyId, { name });
}

function resolveItemId(companyId, { name, unit = "", salePrice = 0, purchasePrice = 0, sku = "", category = "" }) {
  const cleanName = String(name || "Item").trim() || "Item";
  const now = new Date().toISOString();
  ensureUnit(companyId, unit);
  ensureItemCategory(companyId, category);
  run(
    `INSERT OR IGNORE INTO items
      (company_id, name, sku, category, unit, sale_price, purchase_price, opening_stock, low_stock_alert, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, '', ?)`,
    [companyId, cleanName, sku, category, unit, salePrice, purchasePrice, now],
  );
  run(
    `UPDATE items SET
      sku = COALESCE(NULLIF(?, ''), sku),
      category = COALESCE(NULLIF(?, ''), category),
      unit = COALESCE(NULLIF(?, ''), unit),
      sale_price = CASE WHEN ? > 0 THEN ? ELSE sale_price END,
      purchase_price = CASE WHEN ? > 0 THEN ? ELSE purchase_price END
     WHERE company_id = ? AND name = ?`,
    [sku, category, unit, salePrice, salePrice, purchasePrice, purchasePrice, companyId, cleanName],
  );
  return one("SELECT id FROM items WHERE company_id = ? AND name = ?", [companyId, cleanName])?.id || null;
}

function nextInvoiceNumber(companyIdOrType, maybeType, docDate = new Date()) {
  let companyId;
  let type;
  if (typeof companyIdOrType === "string" && (!maybeType || maybeType instanceof Date)) {
    type = companyIdOrType;
    if (maybeType instanceof Date) docDate = maybeType;
    companyId = getCurrentCompany()?.id || 1;
  } else {
    companyId = companyIdOrType || getCurrentCompany()?.id || 1;
    type = maybeType;
  }
  const settings = getBusinessSettings();
  const prefix = type === "sale" && settings.invoicePrefix
    ? settings.invoicePrefix
    : {
    estimate: "QT",
    proforma: "PI",
    sale_order: "SO",
    saleOrder: "SO",
    delivery_challan: "DC",
    deliveryChallan: "DC",
    purchase_order: "PO",
    purchaseOrder: "PO",
    credit_note: "CN",
    debit_note: "DN",
    sale: "INV",
    purchase: "PB",
    expense: "EXP",
    payment_in: "PIN",
    payment_out: "POUT",
  }[type] || "TXN";
  const startNo = type === "sale" ? Math.max(1, Number(settings.startingNo || 1)) : 1;
  const financialYear = currentFinancialYear(docDate);
  const pattern = `${prefix}-${financialYear}-%`;
  const isEstimateLike = ["estimate", "proforma", "sale_order", "saleOrder", "delivery_challan", "deliveryChallan", "purchase_order", "purchaseOrder"].includes(type);
  const source = isEstimateLike
    ? ["estimates", "quote_no", type]
    : type === "credit_note"
      ? ["credit_notes", "credit_no", "credit_note"]
      : type === "debit_note"
        ? ["debit_notes", "debit_no", "debit_note"]
        : ["transactions", "invoice_no", type];
  const existing = one(
    `SELECT MAX(CAST(SUBSTR(${source[1]}, LENGTH(?) + 2) AS INTEGER)) AS maximum
     FROM ${source[0]} WHERE company_id = ? AND ${source[1]} LIKE ?${source[0] === "transactions" ? " AND type = ?" : ""}`,
    source[0] === "transactions" ? [`${prefix}-${financialYear}`, companyId, pattern, type] : [`${prefix}-${financialYear}`, companyId, pattern],
  );
  const initial = Math.max(startNo, Number(existing?.maximum || 0) + 1);
  run(
    `INSERT OR IGNORE INTO document_sequences
      (company_id, document_type, financial_year, prefix, next_number, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`,
    [companyId, source[2], financialYear, prefix, initial, new Date().toISOString()],
  );
  const sequence = one(
    "SELECT next_number AS nextNumber FROM document_sequences WHERE company_id = ? AND document_type = ? AND financial_year = ? AND prefix = ?",
    [companyId, source[2], financialYear, prefix],
  );
  const number = Math.max(startNo, Number(sequence?.nextNumber || 0), Number(existing?.maximum || 0) + 1);
  run(
    "UPDATE document_sequences SET next_number = ?, updated_at = ? WHERE company_id = ? AND document_type = ? AND financial_year = ? AND prefix = ?",
    [number + 1, new Date().toISOString(), companyId, source[2], financialYear, prefix],
  );
  return `${prefix}-${financialYear}-${String(number).padStart(4, "0")}`;
}

function previewNextInvoiceNumber(companyIdOrType, maybeType, docDate = new Date()) {
  let companyId;
  let type;
  if (typeof companyIdOrType === "string" && (!maybeType || maybeType instanceof Date)) {
    type = companyIdOrType;
    if (maybeType instanceof Date) docDate = maybeType;
    companyId = getCurrentCompany()?.id || 1;
  } else {
    companyId = companyIdOrType || getCurrentCompany()?.id || 1;
    type = maybeType;
  }
  const settings = getBusinessSettings();
  const prefix = type === "sale" && settings.invoicePrefix
    ? settings.invoicePrefix
    : {
    estimate: "QT",
    proforma: "PI",
    sale_order: "SO",
    saleOrder: "SO",
    delivery_challan: "DC",
    deliveryChallan: "DC",
    purchase_order: "PO",
    purchaseOrder: "PO",
    credit_note: "CN",
    debit_note: "DN",
    sale: "INV",
    purchase: "PB",
    expense: "EXP",
    payment_in: "PIN",
    payment_out: "POUT",
  }[type] || "TXN";
  const startNo = type === "sale" ? Math.max(1, Number(settings.startingNo || 1)) : 1;
  const financialYear = currentFinancialYear(docDate);
  const pattern = `${prefix}-${financialYear}-%`;
  const isEstimateLike = ["estimate", "proforma", "sale_order", "saleOrder", "delivery_challan", "deliveryChallan", "purchase_order", "purchaseOrder"].includes(type);
  const source = isEstimateLike
    ? ["estimates", "quote_no", type]
    : type === "credit_note"
      ? ["credit_notes", "credit_no", "credit_note"]
      : type === "debit_note"
        ? ["debit_notes", "debit_no", "debit_note"]
        : ["transactions", "invoice_no", type];
  const existing = one(
    `SELECT MAX(CAST(SUBSTR(${source[1]}, LENGTH(?) + 2) AS INTEGER)) AS maximum
     FROM ${source[0]} WHERE company_id = ? AND ${source[1]} LIKE ?${source[0] === "transactions" ? " AND type = ?" : ""}`,
    source[0] === "transactions" ? [`${prefix}-${financialYear}`, companyId, pattern, type] : [`${prefix}-${financialYear}`, companyId, pattern],
  );
  const sequence = one(
    "SELECT next_number AS nextNumber FROM document_sequences WHERE company_id = ? AND document_type = ? AND financial_year = ? AND prefix = ?",
    [companyId, source[2], financialYear, prefix],
  );
  const number = Math.max(startNo, Number(sequence?.nextNumber || 0), Number(existing?.maximum || 0) + 1);
  return `${prefix}-${financialYear}-${String(number).padStart(4, "0")}`;
}

function syncDocumentSequence(companyId, docType, invoiceNo, docDate = new Date()) {
  if (!invoiceNo || typeof invoiceNo !== "string") return;
  const settings = getBusinessSettings();
  const prefix = docType === "sale" && settings.invoicePrefix
    ? settings.invoicePrefix
    : {
    estimate: "QT",
    proforma: "PI",
    sale_order: "SO",
    saleOrder: "SO",
    delivery_challan: "DC",
    deliveryChallan: "DC",
    purchase_order: "PO",
    purchaseOrder: "PO",
    credit_note: "CN",
    debit_note: "DN",
    sale: "INV",
    purchase: "PB",
    expense: "EXP",
    payment_in: "PIN",
    payment_out: "POUT",
  }[docType] || "TXN";
  const financialYear = currentFinancialYear(docDate);
  const regex = new RegExp(`^${prefix}-${financialYear}-(\\d+)$`, "i");
  const match = invoiceNo.trim().match(regex);
  if (match) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num) && num > 0) {
      const isEstimateLike = ["estimate", "proforma", "sale_order", "saleOrder", "delivery_challan", "deliveryChallan", "purchase_order", "purchaseOrder"].includes(docType);
      const sequenceType = isEstimateLike ? docType : docType === "credit_note" ? "credit_note" : docType === "debit_note" ? "debit_note" : docType;
      run(
        `INSERT INTO document_sequences (company_id, document_type, financial_year, prefix, next_number, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (company_id, document_type, financial_year, prefix)
         DO UPDATE SET next_number = MAX(document_sequences.next_number, ?), updated_at = ?`,
        [companyId, sequenceType, financialYear, prefix, num + 1, new Date().toISOString(), num + 1, new Date().toISOString()],
      );
    }
  }
}

function currentFinancialYear(date = new Date()) {
  let d;
  if (typeof date === "string") {
    const m = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    } else {
      d = new Date(date);
    }
  } else if (date instanceof Date) {
    d = date;
  } else {
    d = new Date();
  }
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const start = month >= 4 ? year : year - 1;
  return `${String(start).slice(-2)}${String(start + 1).slice(-2)}`;
}

function addColumnIfMissing(tableName, columnName, definition) {
  const columns = all(`PRAGMA table_info(${tableName})`);
  if (!columns.some((column) => column.name === columnName)) {
    db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function sanitizeSqlParams(params = []) {
  if (!Array.isArray(params)) return params;
  return params.map((v) => (v === undefined ? null : v));
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(sanitizeSqlParams(params));
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function one(sql, params = []) {
  return all(sql, params)[0];
}

function run(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(sanitizeSqlParams(params));
  stmt.step();
  stmt.free();
}


function inDatabaseTransaction(work) {
  const isOuterTransaction = transactionDepth === 0;
  if (isOuterTransaction) db.run("BEGIN TRANSACTION");
  transactionDepth += 1;
  try {
    const result = work();
    transactionDepth -= 1;
    if (isOuterTransaction) {
      db.run("COMMIT");
      persist();
    }
    return result;
  } catch (error) {
    transactionDepth -= 1;
    if (isOuterTransaction) db.run("ROLLBACK");
    throw error;
  }
}

function safeWriteFileAtomic(filePath, buffer) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = `${filePath}.${randomUUID()}.tmp`;
  fs.writeFileSync(tempPath, buffer);
  try {
    fs.renameSync(tempPath, filePath);
  } catch {
    try {
      fs.copyFileSync(tempPath, filePath);
      fs.unlinkSync(tempPath);
    } catch (fallbackErr) {
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch (_) {}
      }
      throw fallbackErr;
    }
  }
}

function persist() {
  if (transactionDepth > 0) return;
  safeWriteFileAtomic(dbPath, Buffer.from(db.export()));
  enforceForeignKeys(db);
}

function captureBusinessSnapshot(database = db) {
  const definitions = [
    ["companies", "COUNT(*)", "companyCount"],
    ["parties", "COUNT(*)", "partyCount"],
    ["items", "COUNT(*)", "itemCount"],
    ["invoices", "COUNT(*)", "invoiceCount"],
    ["invoice_items", "COUNT(*)", "invoiceItemCount"],
    ["payments", "COUNT(*)", "paymentCount"],
    ["stock_movements", "COUNT(*)", "stockMovementCount"],
    ["invoices", "COALESCE(SUM(total), 0)", "invoiceTotal"],
    ["payments", "COALESCE(SUM(amount), 0)", "paymentTotal"],
    ["stock_movements", "COALESCE(SUM(CASE WHEN movement_type = 'in' THEN quantity WHEN movement_type = 'out' THEN -quantity ELSE quantity END), 0)", "stockMovementTotal"],
  ];

  return definitions.reduce((snapshot, [table, expression, key]) => {
    snapshot[key] = tableExists(database, table)
      ? Number(queryRows(database, `SELECT ${expression} AS value FROM ${table}`)[0]?.value || 0)
      : 0;
    return snapshot;
  }, {});
}

function validateDatabase(database = db, expectedVersion = SCHEMA_VERSION) {
  const integrityRows = queryRows(database, "PRAGMA integrity_check");
  const integrity = integrityRows.map((row) => String(row.integrity_check || Object.values(row)[0] || ""));
  if (integrity.length !== 1 || integrity[0].toLowerCase() !== "ok") {
    throw new MigrationError("INTEGRITY_CHECK_FAILED", "SQLite integrity check failed.", { integrity });
  }

  const expectedTables = {
    companies: ["id", "name", "is_current"],
    parties: ["id", "company_id", "name"],
    items: ["id", "company_id", "name"],
    invoices: ["id", "company_id", "party_id", "invoice_no", "total"],
    invoice_items: ["id", "invoice_id", "item_name", "line_total"],
    payments: ["id", "company_id", "party_id", "invoice_id", "amount"],
    stock_movements: ["id", "company_id", "movement_type", "quantity"],
    schema_migrations: ["version", "name", "applied_at"],
    company_settings: ["company_id", "key", "value"],
    document_sequences: ["company_id", "document_type", "financial_year", "prefix", "next_number"],
    sync_devices: ["id", "installation_id", "created_at"],
    sync_outbox: ["id", "company_id", "device_id", "entity_type", "entity_id", "status"],
    sync_inbox: ["event_id", "company_id", "entity_type", "entity_id"],
    sync_cursors: ["company_id", "pull_cursor", "updated_at"],
    sync_conflicts: ["id", "company_id", "entity_type", "entity_id", "status"],
    tax_entries: ["id", "company_id", "source_type", "source_id", "document_no", "taxable_value"],
    audit_trail: ["id", "company_id", "action", "entity_type", "entity_id", "created_at"],
    estimates: ["id", "company_id", "document_type"],
  };

  for (const [table, expectedColumns] of Object.entries(expectedTables)) {
    if (!tableExists(database, table)) throw new MigrationError("VALIDATION_FAILED", `Expected table ${table} is missing.`);
    const columns = new Set(queryRows(database, `PRAGMA table_info(${table})`).map((column) => column.name));
    const missing = expectedColumns.filter((column) => !columns.has(column));
    if (missing.length) {
      throw new MigrationError("VALIDATION_FAILED", `Table ${table} is missing expected columns.`, { table, missing });
    }
  }

  const foreignKeyProblems = queryRows(database, "PRAGMA foreign_key_check");
  if (foreignKeyProblems.length) {
    throw new MigrationError("VALIDATION_FAILED", "Foreign-key validation failed.", { count: foreignKeyProblems.length });
  }

  const version = Number(queryRows(database, "SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations")[0]?.version || 0);
  if (version !== expectedVersion) {
    throw new MigrationError("VALIDATION_FAILED", `Expected schema version ${expectedVersion}, found ${version}.`, {
      expectedVersion,
      version,
    });
  }

  return { integrity: "ok", version, foreignKeys: "ok", tables: Object.keys(expectedTables).length };
}

function createPreMigrationBackup(userDataPath) {
  if (!fs.existsSync(dbPath)) throw new Error("The source database does not exist.");
  const backupDirectory = path.join(userDataPath, "migration-backups");
  fs.mkdirSync(backupDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDirectory, `gi-billing-pre-migration-${timestamp}.sqlite`);
  const metadataPath = `${backupPath}.json`;
  fs.copyFileSync(dbPath, backupPath);

  const backupBytes = fs.readFileSync(backupPath);
  const backupDatabase = new SQL.Database(backupBytes);
  try {
    const integrity = queryRows(backupDatabase, "PRAGMA integrity_check");
    const result = String(integrity[0]?.integrity_check || Object.values(integrity[0] || {})[0] || "");
    if (result.toLowerCase() !== "ok") throw new Error(`Backup integrity check returned: ${result || "no result"}`);
  } finally {
    backupDatabase.close();
  }

  const metadata = {
    type: "pre-migration",
    source: path.basename(dbPath),
    backup: path.basename(backupPath),
    size: backupBytes.length,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  return { path: backupPath, metadataPath, size: backupBytes.length, validated: true };
}

function getDatabasePath() {
  return dbPath;
}

function backupTo(targetPath) {
  persist();
  fs.copyFileSync(dbPath, targetPath);
  return {
    path: targetPath,
    type: "SQLite",
  };
}

async function previewBackup(sourcePath) {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Backup file not found at ${sourcePath}`);
  }

  const stats = fs.statSync(sourcePath);
  if (stats.size < 16) {
    throw new Error("Invalid backup file: file is too small to be a SQLite database.");
  }

  const sourceBytes = fs.readFileSync(sourcePath);
  const header = sourceBytes.subarray(0, 16).toString("utf8");
  if (!header.startsWith("SQLite format 3")) {
    throw new Error("Invalid backup file: file does not have a valid SQLite database header.");
  }

  if (!SQL) {
    SQL = await initSqlJs();
  }

  let candidateDb;
  try {
    candidateDb = new SQL.Database(sourceBytes);
  } catch (err) {
    throw new Error("Failed to read backup database: " + err.message);
  }

  try {
    const integrityRows = queryRows(candidateDb, "PRAGMA integrity_check");
    const integrity = integrityRows.map((row) => String(row.integrity_check || Object.values(row)[0] || ""));
    const isIntegrityOk = integrity.length === 1 && integrity[0].toLowerCase() === "ok";

    let schemaVersion = 0;
    if (tableExists(candidateDb, "schema_migrations")) {
      const verRow = queryRows(candidateDb, "SELECT COALESCE(MAX(version), 0) AS ver FROM schema_migrations")[0];
      schemaVersion = Number(verRow?.ver || 0);
    }

    let companies = [];
    if (tableExists(candidateDb, "companies")) {
      companies = queryRows(candidateDb, "SELECT id, name, email FROM companies ORDER BY id ASC");
    }
    const companyNames = companies.map((c) => c.name);

    let transactionCount = 0;
    let invoiceCount = 0;
    let partyCount = 0;
    let itemCount = 0;
    let paymentCount = 0;
    let totalSales = 0;
    let totalPurchases = 0;
    let dateRange = { from: null, to: null };

    if (tableExists(candidateDb, "transactions")) {
      const txStats = queryRows(candidateDb, `
        SELECT 
          COUNT(*) as cnt,
          MIN(transaction_date) as minDate,
          MAX(transaction_date) as maxDate,
          SUM(CASE WHEN type = 'sale' THEN amount ELSE 0 END) as sales,
          SUM(CASE WHEN type = 'purchase' THEN amount ELSE 0 END) as purchases
        FROM transactions
      `)[0];
      if (txStats) {
        transactionCount = Number(txStats.cnt || 0);
        totalSales = Number(txStats.sales || 0);
        totalPurchases = Number(txStats.purchases || 0);
        dateRange = { from: txStats.minDate || null, to: txStats.maxDate || null };
      }
    }

    if (tableExists(candidateDb, "invoices")) {
      const invRow = queryRows(candidateDb, "SELECT COUNT(*) as cnt FROM invoices")[0];
      invoiceCount = Number(invRow?.cnt || 0);
    }

    if (tableExists(candidateDb, "parties")) {
      const pRow = queryRows(candidateDb, "SELECT COUNT(*) as cnt FROM parties")[0];
      partyCount = Number(pRow?.cnt || 0);
    }

    if (tableExists(candidateDb, "items")) {
      const iRow = queryRows(candidateDb, "SELECT COUNT(*) as cnt FROM items")[0];
      itemCount = Number(iRow?.cnt || 0);
    }

    if (tableExists(candidateDb, "payments")) {
      const payRow = queryRows(candidateDb, "SELECT COUNT(*) as cnt FROM payments")[0];
      paymentCount = Number(payRow?.cnt || 0);
    }

    try { candidateDb.close(); } catch (_) {}

    return {
      valid: isIntegrityOk,
      schemaVersion,
      targetVersion: SCHEMA_VERSION,
      isCompatible: schemaVersion <= SCHEMA_VERSION,
      integrity: isIntegrityOk ? "ok" : integrity.join(", "),
      companies: companyNames,
      companyCount: companies.length,
      primaryCompany: companyNames[0] || "Unknown",
      transactionCount,
      invoiceCount,
      partyCount,
      itemCount,
      paymentCount,
      totalSales,
      totalPurchases,
      dateRange,
      fileSizeBytes: stats.size,
      filePath: sourcePath,
      filename: path.basename(sourcePath),
    };
  } catch (err) {
    try { candidateDb.close(); } catch (_) {}
    throw new Error("Failed to inspect backup database: " + err.message);
  }
}

async function restoreBackup(sourcePath, options = {}) {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Backup file not found at ${sourcePath}`);
  }

  const sourceBytes = fs.readFileSync(sourcePath);
  if (sourceBytes.length < 16) {
    throw new Error("Invalid backup file: file is too small to be a SQLite database.");
  }

  const header = sourceBytes.subarray(0, 16).toString("utf8");
  if (!header.startsWith("SQLite format 3")) {
    throw new Error("Invalid backup file: file does not have a valid SQLite database header.");
  }

  if (!SQL) {
    SQL = await initSqlJs();
  }

  let candidateDb;
  try {
    candidateDb = new SQL.Database(sourceBytes);
    enforceForeignKeys(candidateDb);
  } catch (err) {
    throw new Error("Failed to read backup database: " + err.message);
  }

  try {
    const integrityRows = queryRows(candidateDb, "PRAGMA integrity_check");
    const integrity = integrityRows.map((row) => String(row.integrity_check || Object.values(row)[0] || ""));
    if (integrity.length !== 1 || integrity[0].toLowerCase() !== "ok") {
      throw new Error("Backup file failed integrity check: " + integrity.join(", "));
    }

    const migrations = getMigrations(options.additionalMigrations);
    runMigrations({
      db: candidateDb,
      migrations,
      databaseExists: true,
      createBackup: () => null,
      captureSnapshot: (database) => captureBusinessSnapshot(database),
      validateDatabase: (database, version) => validateDatabase(database, version),
      logger: options.migrationLogger,
    });
    enforceForeignKeys(candidateDb);
  } catch (err) {
    try { candidateDb.close(); } catch (_) {}
    throw new Error("Backup validation or migration failed: " + err.message);
  }

  const userDataPath = options.userDataPath || (dbPath ? path.dirname(dbPath) : null);
  let safetyBackupPath = null;
  if (dbPath && fs.existsSync(dbPath) && userDataPath) {
    const backupDirectory = path.join(userDataPath, "migration-backups");
    fs.mkdirSync(backupDirectory, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    safetyBackupPath = path.join(backupDirectory, `gi-billing-pre-restore-${timestamp}.sqlite`);
    fs.copyFileSync(dbPath, safetyBackupPath);
  }

  const finalBytes = Buffer.from(candidateDb.export());
  try { candidateDb.close(); } catch (_) {}

  safeWriteFileAtomic(dbPath, finalBytes);

  if (db) {
    try { db.close(); } catch (_) {}
  }

  db = new SQL.Database(fs.readFileSync(dbPath));
  enforceForeignKeys(db);
  seedDefaults();
  ensureDebitNoteSchema();
  ensureLocalSyncIdentity();
  ensureUsersSchema();

  recordAuditLog(
    getCurrentCompany()?.id,
    "RESTORE_BACKUP",
    "system",
    "database",
    null,
    { sourcePath, safetyBackupPath, restoredAt: new Date().toISOString() }
  );
  persist();

  return {
    success: true,
    restoredPath: dbPath,
    safetyBackupPath,
    state: getState(),
  };
}

function getUsers(explicitCompanyId = null) {
  const company = explicitCompanyId ? { id: explicitCompanyId } : getCurrentCompany();
  if (!company?.id) return [];
  ensureUsersSchema();
  return all(
    "SELECT id, company_id AS companyId, username, display_name AS displayName, role, is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt FROM users WHERE company_id = ? ORDER BY username ASC",
    [company.id]
  );
}

function createUser(payload = {}) {
  const company = getCurrentCompany();
  if (!company?.id) throw new Error("No active company found.");
  ensureUsersSchema();
  const username = String(payload.username || "").trim().toLowerCase();
  if (!username) throw new Error("Username is required.");
  const displayName = String(payload.displayName || payload.name || username).trim();
  const role = String(payload.role || "viewer").trim().toLowerCase();
  const validRoles = ["admin", "accountant", "cashier", "viewer"];
  if (!validRoles.includes(role)) {
    throw new Error(`Invalid role '${role}'. Allowed roles: ${validRoles.join(", ")}`);
  }
  const existing = one("SELECT id FROM users WHERE company_id = ? AND username = ?", [company.id, username]);
  if (existing) {
    throw new Error(`User '${username}' already exists.`);
  }
  const id = payload.id || makeId();
  const now = new Date().toISOString();
  run(
    "INSERT INTO users (id, company_id, username, display_name, role, pin_hash, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, company.id, username, displayName, role, payload.pinHash || null, payload.isActive !== false ? 1 : 0, now, now]
  );
  recordAuditLog(company.id, "CREATE", "user", id, username, { role, displayName });
  persist();
  return getUsers(company.id);
}

function updateUser(payload = {}) {
  const company = getCurrentCompany();
  if (!company?.id) throw new Error("No active company found.");
  ensureUsersSchema();
  const id = String(payload.id || "").trim();
  if (!id) throw new Error("User ID is required.");
  const existing = one("SELECT id, username, role FROM users WHERE company_id = ? AND id = ?", [company.id, id]);
  if (!existing) throw new Error("User not found.");

  const username = payload.username ? String(payload.username).trim().toLowerCase() : existing.username;
  if (username !== existing.username) {
    const dup = one("SELECT id FROM users WHERE company_id = ? AND username = ? AND id != ?", [company.id, username, id]);
    if (dup) throw new Error(`Username '${username}' is already taken.`);
  }

  const role = payload.role ? String(payload.role).trim().toLowerCase() : existing.role;
  const validRoles = ["admin", "accountant", "cashier", "viewer"];
  if (role && !validRoles.includes(role)) {
    throw new Error(`Invalid role '${role}'. Allowed roles: ${validRoles.join(", ")}`);
  }

  const displayName = payload.displayName !== undefined ? String(payload.displayName).trim() : null;
  const isActive = payload.isActive !== undefined ? (payload.isActive ? 1 : 0) : null;
  const pinHash = payload.pinHash !== undefined ? payload.pinHash : null;
  const now = new Date().toISOString();

  run(
    `UPDATE users SET 
      username = ?, 
      display_name = COALESCE(?, display_name), 
      role = ?, 
      is_active = COALESCE(?, is_active), 
      pin_hash = COALESCE(?, pin_hash), 
      updated_at = ? 
    WHERE company_id = ? AND id = ?`,
    [username, displayName, role, isActive, pinHash, now, company.id, id]
  );
  recordAuditLog(company.id, "UPDATE", "user", id, username, { role, displayName, isActive });
  persist();
  return getUsers(company.id);
}

function deleteUser(payload = {}) {
  const company = getCurrentCompany();
  if (!company?.id) throw new Error("No active company found.");
  ensureUsersSchema();
  const id = typeof payload === "string" ? payload : String(payload.id || "").trim();
  if (!id) throw new Error("User ID is required.");
  const existing = one("SELECT id, username, role FROM users WHERE company_id = ? AND id = ?", [company.id, id]);
  if (!existing) throw new Error("User not found.");
  if (existing.username === "admin") {
    throw new Error("Cannot delete primary admin user.");
  }
  run("DELETE FROM users WHERE company_id = ? AND id = ?", [company.id, id]);
  recordAuditLog(company.id, "DELETE", "user", id, existing.username);
  persist();
  return getUsers(company.id);
}

function getMigrationInfo() {
  return {
    targetVersion: SCHEMA_VERSION,
    currentVersion: db && tableExists(db, "schema_migrations")
      ? Number(queryRows(db, "SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations")[0]?.version || 0)
      : 0,
    lastResult: lastMigrationResult,
  };
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// ── Journal Voucher — Manual Double-Entry Posting ─────────────────────────────
function saveJournalVoucher(payload) {
  const company = getCurrentCompany();
  const now = new Date().toISOString();
  const lines = payload.lines || [];

  if (!lines.length) throw new Error("Journal voucher must have at least one line.");

  const totalDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`Journal voucher does not balance. Debits: ${totalDebit.toFixed(2)}, Credits: ${totalCredit.toFixed(2)}`);
  }

  const voucherId = randomUUID();
  const voucherNo = payload.voucherNo || `JV-${Date.now()}`;
  const entryDate = payload.entryDate || now.slice(0, 10);
  const narration = payload.narration || "";

  // Insert a transaction stub so ledger_entries FK is satisfied
  run(
    `INSERT INTO transactions
      (id, company_id, invoice_id, invoice_no, type, party, party_id, item, amount,
       payment_type, status, notes, meta_json, transaction_date, created_at, updated_at)
     VALUES (?, ?, NULL, ?, 'journal_voucher', 'Manual Entry', NULL, '', 0, 'journal', 'posted', ?, '{}', ?, ?, ?)`,
    [voucherId, company.id, voucherNo, narration, entryDate, now, now]
  );

  for (const line of lines) {
    run(
      `INSERT INTO ledger_entries
        (company_id, transaction_id, account, debit, credit, entry_date, narration, voucher_no, entry_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'journal')`,
      [
        company.id, voucherId,
        String(line.account || ""),
        Number(line.debit || 0),
        Number(line.credit || 0),
        entryDate, narration, voucherNo,
      ]
    );
  }

  persist();
  return getState();
}

module.exports = {
  initDatabase,
  getDatabasePath,
  getMigrationInfo,
  validateDatabase,
  captureBusinessSnapshot,
  backupTo,
  previewBackup,
  restoreBackup,
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  recordAuditLog,
  getState,
  setCurrentCompany,
  setCountry,
  updateBusinessSettings,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  setDefaultBankAccount,
  createParty,
  updateParty,
  createItem,
  updateItem,
  createUnit,
  updateUnit,
  deleteUnit,
  toggleUnitActive,
  getUnitsList,
  getCategoriesWithHierarchy,
  createItemCategory,
  updateItemCategory,
  deleteItemCategory,
  toggleItemCategoryActive,
  getSyncStatus,
  claimSyncOutbox,
  completeSyncPush,
  retryClaimedSyncEvents,
  applySyncPull,
  markDeviceSynced,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  updateInvoice,
  createEstimate,
  updateEstimate,
  setEstimateStatus,
  deleteEstimate,
  createCreditNote,
  updateCreditNote,
  setCreditNoteStatus,
  deleteCreditNote,
  createDebitNote,
  updateDebitNote,
  setDebitNoteStatus,
  deleteDebitNote,
  recordInvoicePayment,
  recordPaymentIn,
  recordPaymentOut,
  recordStockAdjustment,
  isForeignKeyEnforced,
  enforceForeignKeys,
  executeRaw: run,
  setInvoiceStatus,
  deleteInvoice,
  createCompany,
  deleteCompany,
  updateCompanyProfile,
  getTaxEntries,
  nextInvoiceNumber,
  previewNextInvoiceNumber,
  syncDocumentSequence,
  currentFinancialYear,
  getAuditTrail,
  saveJournalVoucher,
  getCurrentCompany,
};
