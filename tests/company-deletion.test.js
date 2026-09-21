const assert = require("assert");
const database = require("../database");
const { createFixture, seedMasters, sampleInvoice, reopen } = require("./database-fixtures");

async function run() {
  const fixture = await createFixture("gi-company-delete-");
  try {
    const original = database.getState().companies[0];
    assert.throws(() => database.deleteCompany(original.id), /only remaining/);
    const { customer, item } = seedMasters();
    database.createTransaction(sampleInvoice({ party: customer, item }));
    database.createCompany({ name: "Retained Company" });
    database.setCurrentCompany(original.name);
    assert.throws(() => database.deleteCompany(999999), /not found/);

    database.executeRaw(`CREATE TRIGGER block_company_delete BEFORE DELETE ON companies
      BEGIN SELECT RAISE(ABORT, 'Simulated deletion failure'); END`);
    assert.throws(() => database.deleteCompany(original.id), /Simulated deletion failure/);
    assert.equal(database.getState().invoices.length, 1, "failed deletion must restore invoice records");
    assert.equal(database.getState().parties.length, 2, "failed deletion must restore parties");
    database.executeRaw("DROP TRIGGER block_company_delete");

    const state = database.deleteCompany(original.id);
    assert.equal(state.companies.length, 1);
    assert.equal(state.activeCompany, "Retained Company");
    assert.equal(state.invoices.length, 0);
    assert.equal(state.parties.length, 0);
    database.validateDatabase();
    await reopen(fixture.root);
    assert.equal(database.getState().companies.length, 1, "restart must not recreate the deleted demo company");
    assert.equal(database.getState().activeCompany, "Retained Company");
    assert.ok(!database.getState().companies.some((company) => company.id === original.id));
    database.validateDatabase();
    console.log("Company deletion tests passed.");
  } finally {
    fixture.cleanup();
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
