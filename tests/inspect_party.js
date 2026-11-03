const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
const dbPath = path.join(process.env.APPDATA, 'gi-billing-software', 'gi-billing.sqlite');

async function main() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const party = db.exec("SELECT id, name, type, state, gstin, billing_address FROM parties WHERE name LIKE '%asda%'");
  console.log('Party asda:', JSON.stringify(party, null, 2));

  const allParties = db.exec("SELECT id, name, type, state, gstin FROM parties");
  console.log('All parties:', JSON.stringify(allParties, null, 2));
}

main().catch(console.error);
