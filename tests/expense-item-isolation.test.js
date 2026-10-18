const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-expense-item-test-"));
app.setPath("userData", testRoot);

app.whenReady().then(async () => {
  try {
    console.log("==================================================================");
    console.log("   TESTING EXPENSE INPUT ISOLATION FROM ITEM PAGE                ");
    console.log("==================================================================");

    await database.initDatabase(testRoot);
    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
    ipcMain.handle("db:create-party", (_event, party) => database.createParty(party));
    ipcMain.handle("db:create-item", (_event, item) => database.createItem(item));
    ipcMain.handle("db:create-transaction", (_event, tx) => database.createTransaction(tx));

    // 1. Create a legitimate item
    console.log("\n▶ [TEST 1] Create legitimate inventory product 'Wireless Router'...");
    database.createItem({
      name: "Wireless Router",
      itemType: "product",
      salePrice: 2500,
      purchasePrice: 1800,
      openingStock: 15,
      unit: "PCS",
    });
    let state = database.getState();
    assert.strictEqual(state.items.length, 1);
    assert.strictEqual(state.items[0].name, "Wireless Router");
    console.log("  ✓ 'Wireless Router' created successfully.");

    // 2. Create an expense transaction (e.g. Rent & Internet)
    console.log("\n▶ [TEST 2] Record expense transaction 'Office Rent' (₹35,000)...");
    database.createTransaction({
      type: "expense",
      party: "Expense",
      item: "Office Rent",
      amount: 35000,
      paymentType: "Bank",
      status: "paid",
      notes: "Monthly office rent",
      meta: {
        category: "Office Rent",
        vendor: "Expense",
        taxableValue: 35000,
      },
    });

    state = database.getState();
    const expenseTx = state.transactions.find((t) => t.type === "expense" && t.item === "Office Rent");
    assert.ok(expenseTx, "Expense transaction must be saved in transactions");
    assert.strictEqual(expenseTx.amount, 35000);

    // Verify Office Rent is NOT in items table!
    const rentItem = state.items.find((i) => i.name.toLowerCase() === "office rent");
    assert.strictEqual(rentItem, undefined, "Office Rent must NOT be added to state.items");
    assert.strictEqual(state.items.length, 1, "Only 'Wireless Router' should be in items");
    console.log("  ✓ 'Office Rent' was NOT added to items table.");

    // 3. Record second expense with vendor
    console.log("\n▶ [TEST 3] Record expense transaction 'Internet Bill' (₹2,500)...");
    database.createTransaction({
      type: "expense",
      party: "Airtel Broadband",
      item: "Internet Bill",
      amount: 2500,
      paymentType: "Cash",
      status: "paid",
      notes: "Broadband charges",
      meta: {
        category: "Internet Bill",
        vendor: "Airtel Broadband",
        taxableValue: 2500,
      },
    });

    state = database.getState();
    const internetItem = state.items.find((i) => i.name.toLowerCase() === "internet bill");
    assert.strictEqual(internetItem, undefined, "Internet Bill must NOT be added to state.items");
    assert.strictEqual(state.items.length, 1, "Item list must still only have 1 product");
    console.log("  ✓ 'Internet Bill' was NOT added to items table.");

    // 4. Verify party 'Expense' was not created as an actual customer/supplier party
    const expenseParty = state.parties.find((p) => p.name.toLowerCase() === "expense");
    assert.strictEqual(expenseParty, undefined, "Party 'Expense' must NOT be added to state.parties");
    console.log("  ✓ Party 'Expense' was NOT added to parties table.");

    // 5. Test frontend UI Item Page rendering
    console.log("\n▶ [TEST 4] Frontend: Verify Item Page does NOT display expense inputs...");
    const window = new BrowserWindow({
      width: 1366,
      height: 768,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Open company if prompt appears
    await window.webContents.executeJavaScript(`(() => {
      const btn = document.querySelector(".open-company-button");
      if (btn) btn.click();
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const itemPageCheck = await window.webContents.executeJavaScript(`(() => {
      showView("items");
      const itemButtons = Array.from(document.querySelectorAll(".item-list-item"));
      const renderedNames = itemButtons.map((b) => b.querySelector("strong")?.innerText.trim());

      const searchResults = searchItemsForLookup("Office");
      const searchRent = searchItemsForLookup("Rent");
      const searchRouter = searchItemsForLookup("Router");

      return {
        renderedNames,
        stateItems: (state.items || []).map((i) => i.name),
        searchResultsLength: searchResults.length,
        searchRentLength: searchRent.length,
        searchRouterLength: searchRouter.length,
        hasOfficeRent: renderedNames.includes("Office Rent"),
        hasInternetBill: renderedNames.includes("Internet Bill"),
        hasWirelessRouter: renderedNames.includes("Wireless Router"),
      };
    })()`);

    assert.strictEqual(itemPageCheck.hasOfficeRent, false, "Office Rent must not be in item page list");
    assert.strictEqual(itemPageCheck.hasInternetBill, false, "Internet Bill must not be in item page list");
    assert.strictEqual(itemPageCheck.hasWirelessRouter, true, "Wireless Router must be in item page list");
    assert.strictEqual(itemPageCheck.searchResultsLength, 0, "Lookup search for 'Office' should return 0 items");
    assert.strictEqual(itemPageCheck.searchRentLength, 0, "Lookup search for 'Rent' should return 0 items");
    assert.strictEqual(itemPageCheck.searchRouterLength, 1, "Lookup search for 'Router' should return 'Wireless Router'");
    console.log("  ✓ Item page verified: only inventory items rendered, all expense inputs excluded.");

    console.log("\n==================================================================");
    console.log("   ALL EXPENSE ITEM ISOLATION TESTS PASSED 100%!                 ");
    console.log("==================================================================");

    window.close();
    app.quit();
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  }
});
