const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const initSqlJs = require("sql.js");
const database = require("../database");

async function createFixture(prefix = "gi-billing-test-") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  await database.initDatabase(root);
  return {
    root,
    databasePath: database.getDatabasePath(),
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

function seedMasters({ customerName = "Fixture Customer", supplierName = "Fixture Supplier", itemName = "Fixture Item" } = {}) {
  let state = database.createParty({ name: customerName, type: "customer", phone: "9000000001", state: "Karnataka" });
  state = database.createParty({ name: supplierName, type: "supplier", phone: "9000000002", state: "Karnataka" });
  state = database.createItem({
    name: itemName,
    itemType: "product",
    sku: "FIX-001",
    unit: "Pcs",
    openingStock: 20,
    salePrice: 100,
    purchasePrice: 70,
    taxRate: 18,
    hsnSac: "1001",
  });
  return {
    state,
    customer: state.parties.find((party) => party.name === customerName),
    supplier: state.parties.find((party) => party.name === supplierName),
    item: state.items.find((record) => record.name === itemName),
  };
}

function sampleInvoice({ type = "sale", party, item, id = `${type}-fixture`, qty = 2, received = 0, paymentType = "credit" }) {
  return {
    id: `txn-${id}`,
    invoiceId: `inv-${id}`,
    invoiceNo: `${type === "sale" ? "INV" : "PB"}-${id}`,
    type,
    party: party.name,
    partyId: party.id,
    paymentType,
    supplyType: "b2c",
    placeOfSupply: "Karnataka",
    firmState: "Karnataka",
    received,
    date: "2026-08-12T00:00:00.000Z",
    items: [{
      item: item.name,
      itemId: item.id,
      qty,
      unit: "Pcs",
      price: type === "sale" ? 100 : 70,
      discount: 0,
      taxRate: 18,
      hsnSac: "1001",
    }],
  };
}

async function reopen(root, options = {}) {
  return database.initDatabase(root, options);
}

function snapshot() {
  return database.captureBusinessSnapshot();
}

function createBackup(targetPath) {
  return database.backupTo(targetPath);
}

async function convertToLegacyDatabase(databasePath) {
  const SQL = await initSqlJs();
  const legacy = new SQL.Database(fs.readFileSync(databasePath));
  legacy.run("DROP TABLE IF EXISTS schema_migrations");
  fs.writeFileSync(databasePath, Buffer.from(legacy.export()));
  legacy.close();
}

async function inspectDatabase(databasePath) {
  const SQL = await initSqlJs();
  const inspected = new SQL.Database(fs.readFileSync(databasePath));
  return {
    query(sql, params = []) {
      const statement = inspected.prepare(sql);
      statement.bind(params);
      const rows = [];
      while (statement.step()) rows.push(statement.getAsObject());
      statement.free();
      return rows;
    },
    close() {
      inspected.close();
    },
  };
}

function assertSnapshotsEqual(actual, expected, message = "database snapshot should remain unchanged") {
  assert.deepEqual(actual, expected, message);
}

module.exports = {
  assertSnapshotsEqual,
  convertToLegacyDatabase,
  createBackup,
  createFixture,
  inspectDatabase,
  reopen,
  sampleInvoice,
  seedMasters,
  snapshot,
};
