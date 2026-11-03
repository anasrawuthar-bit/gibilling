const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const database = require("../database");

const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity\\brain\\bed9650d-397d-4216-aa80-c0ae1c3c4fcb";
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-arrow-visual-test-"));
app.setPath("userData", testRoot);

async function runVisualTest() {
  await database.initDatabase(testRoot);

  ipcMain.handle("db:get-state", () => database.getState());
  ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
  ipcMain.handle("db:create-party", (_event, party) => database.createParty(party));
  ipcMain.handle("db:create-transaction", (_event, txn) => database.createTransaction(txn));
  ipcMain.handle("db:preview-next-invoice-number", (_event, type, date) => database.previewNextInvoiceNumber(type, date));



  const win = new BrowserWindow({
    show: true,
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 800));

    // Open first company
    await win.webContents.executeJavaScript(`document.querySelector(".open-company-button").click(); undefined`);
    await new Promise((r) => setTimeout(r, 600));

    // Create parties inside the active company
    await win.webContents.executeJavaScript(`
      (async () => {
        state = normalizeState(await window.giDB.createParty({
          name: "Apex Receivables Ltd",
          phone: "9876543210",
          type: "customer",
          openingBalance: 14500,
          openingBalanceType: "receivable",
          taxType: "gst_registered",
          gstin: "27ABCDE1234F1Z5"
        }));
        state = normalizeState(await window.giDB.createParty({
          name: "Bharat Suppliers Corp",
          phone: "9123456780",
          type: "supplier",
          openingBalance: 8200,
          openingBalanceType: "payable",
          taxType: "gst_registered",
          gstin: "27XYZAB9876C1Z3"
        }));
        state = normalizeState(await window.giDB.createParty({
          name: "Zero Balance Trader",
          phone: "9988776655",
          type: "customer",
          openingBalance: 0,
          taxType: "unregistered"
        }));
        state = normalizeState(await window.giDB.createParty({
          name: "rafi",
          phone: "",
          type: "customer",
          openingBalance: 680,
          openingBalanceType: "receivable",
          taxType: "unregistered"
        }));
      })()
    `);
    await new Promise((r) => setTimeout(r, 400));

    // Open sale transaction editor
    await win.webContents.executeJavaScript(`openTransactionEditor("sale"); undefined`);
    await new Promise((r) => setTimeout(r, 600));

    // Focus on Customer Name input to trigger lookup dropdown
    const lookupCheck = await win.webContents.executeJavaScript(`
      (() => {
        const partyInput = document.querySelector('.transaction-editor input[name="party"]');
        partyInput.focus();
        renderPartyLookupPanel("party");

        const panel = document.getElementById("editorPartyLookup");
        const buttons = Array.from(panel.querySelectorAll(".lookup-result-button"));

        const results = buttons.map(btn => {
          const name = btn.querySelector("strong")?.textContent;
          const em = btn.querySelector("em");
          const arrow = em?.querySelector("svg");
          const arrowUse = arrow?.querySelector("use")?.getAttribute("href");
          const computedColor = window.getComputedStyle(em).color;
          return {
            name,
            text: em?.textContent?.trim(),
            hasArrow: Boolean(arrow),
            arrowHref: arrowUse,
            arrowClass: arrow?.getAttribute("class"),
            computedColor,
            isReceivableClass: em?.classList.contains("lookup-balance-receivable"),
            isPayableClass: em?.classList.contains("lookup-balance-payable"),
            isZeroClass: em?.classList.contains("lookup-balance-zero")
          };
        });

        return {
          panelVisible: !panel.classList.contains("hidden"),
          totalResults: buttons.length,
          results
        };
      })()
    `);

    console.log("Lookup check results:", JSON.stringify(lookupCheck, null, 2));

    assert.strictEqual(lookupCheck.panelVisible, true, "Party lookup dropdown must be visible");
    assert(lookupCheck.totalResults >= 2, "Should show party results");

    const recItem = lookupCheck.results.find(r => r.name === "Apex Receivables Ltd");
    assert(recItem, "Must find Apex Receivables Ltd");
    assert(recItem.text.includes("14,500"), "Apex must show amount ₹14,500");
    assert(!recItem.text.includes("Receivable"), "Must NOT display the word Receivable - only in-arrow + amount");
    assert.strictEqual(recItem.arrowHref, "#gi-arrow-down-left", "Receivable must use in-arrow (#gi-arrow-down-left)");
    assert(recItem.arrowClass.includes("in-arrow"), "Must have in-arrow class");
    assert.strictEqual(recItem.isReceivableClass, true, "Must have lookup-balance-receivable class");

    // Zero balance trader in lookup: must NOT have an arrow, and must display ₹0
    const zeroItem = lookupCheck.results.find(r => r.name === "Zero Balance Trader");
    assert(zeroItem, "Must find Zero Balance Trader");
    assert.strictEqual(zeroItem.hasArrow, false, "Zero balance must NOT have an arrow in lookup dropdown");
    assert.strictEqual(zeroItem.text, "₹0", "Zero balance must say '₹0' with no Receivable/Payable label");
    assert.strictEqual(zeroItem.isZeroClass, true, "Zero balance must have lookup-balance-zero class");

    // Capture screenshot of the exact lookup panel dropdown matching user's view
    await new Promise((r) => setTimeout(r, 400));
    const shot = await win.webContents.capturePage();
    const shotPath = path.join(artifactDir, "party_lookup_in_out_arrows_verified.png");
    fs.writeFileSync(shotPath, shot.toPNG());
    console.log("Verified screenshot saved to:", shotPath);

    // Now test selecting a party and check the balance pill in the header
    const pillCheck = await win.webContents.executeJavaScript(`
      (() => {
        const party = state.parties.find(p => p.name === "Apex Receivables Ltd");
        selectTransactionParty(party);

        const pill = document.querySelector(".editor-unified-balance-pill");
        const arrow = pill?.querySelector("svg");
        const arrowUse = arrow?.querySelector("use")?.getAttribute("href");

        return {
          pillClass: pill?.className,
          pillText: pill?.textContent?.trim(),
          hasArrow: Boolean(arrow),
          arrowHref: arrowUse
        };
      })()
    `);

    console.log("Header balance pill check (Apex):", pillCheck);
    assert.strictEqual(pillCheck.hasArrow, true, "Balance pill must have an arrow for non-zero balance");
    assert.strictEqual(pillCheck.arrowHref, "#gi-arrow-down-left", "Receivable pill must have in-arrow");

    // Test selecting zero-balance party
    const zeroPillCheck = await win.webContents.executeJavaScript(`
      (() => {
        const party = state.parties.find(p => p.name === "Zero Balance Trader");
        selectTransactionParty(party);

        const pill = document.querySelector(".editor-unified-balance-pill");
        const arrow = pill?.querySelector("svg");

        return {
          pillClass: pill?.className,
          pillText: pill?.textContent?.trim(),
          hasArrow: Boolean(arrow)
        };
      })()
    `);
    console.log("Header balance pill check (Zero balance):", zeroPillCheck);
    assert.strictEqual(zeroPillCheck.hasArrow, false, "Zero balance pill must NOT have an arrow");
    assert.strictEqual(zeroPillCheck.pillText, "Balance: ₹0", "Zero balance pill must display Balance: ₹0");
    assert(zeroPillCheck.pillClass.includes("pill-zero"), "Zero balance pill must have pill-zero class");

    // Now test Purchase editor for Payable out-arrow
    console.log("Testing Purchase editor for Payable out-arrow...");
    await win.webContents.executeJavaScript(`openTransactionEditor("purchase", { skipDirtyCheck: true }); undefined`);
    await new Promise((r) => setTimeout(r, 600));

    const purchaseLookupCheck = await win.webContents.executeJavaScript(`
      (() => {
        const partyInput = document.querySelector('.transaction-editor input[name="party"]');
        partyInput.focus();
        renderPartyLookupPanel("party");

        const panel = document.getElementById("editorPartyLookup");
        const buttons = Array.from(panel.querySelectorAll(".lookup-result-button"));

        return buttons.map(btn => {
          const name = btn.querySelector("strong")?.textContent;
          const em = btn.querySelector("em");
          const arrow = em?.querySelector("svg");
          const arrowUse = arrow?.querySelector("use")?.getAttribute("href");
          const computedColor = window.getComputedStyle(em).color;
          return {
            name,
            text: em?.textContent?.trim(),
            hasArrow: Boolean(arrow),
            arrowHref: arrowUse,
            arrowClass: arrow?.getAttribute("class"),
            computedColor,
            isReceivableClass: em?.classList.contains("lookup-balance-receivable"),
            isPayableClass: em?.classList.contains("lookup-balance-payable")
          };
        });
      })()
    `);

    console.log("Purchase lookup check results:", purchaseLookupCheck);
    const purchasePayItem = purchaseLookupCheck.find(r => r.name === "Bharat Suppliers Corp");
    assert(purchasePayItem, "Must find Bharat Suppliers Corp");
    assert(purchasePayItem.text.includes("8,200"), "Supplier must show amount ₹8,200");
    assert(!purchasePayItem.text.includes("Payable"), "Must NOT display the word Payable - only out-arrow + amount");
    assert.strictEqual(purchasePayItem.arrowHref, "#gi-arrow-up-right", "Payable must use out-arrow (#gi-arrow-up-right)");
    assert(purchasePayItem.arrowClass.includes("out-arrow"), "Must have out-arrow class");
    assert.strictEqual(purchasePayItem.isPayableClass, true, "Must have lookup-balance-payable class");

    // Capture screenshot of the purchase lookup panel dropdown with out-arrow
    await new Promise((r) => setTimeout(r, 400));
    const purchaseShot = await win.webContents.capturePage();
    const purchaseShotPath = path.join(artifactDir, "party_lookup_payable_out_arrow_verified.png");
    fs.writeFileSync(purchaseShotPath, purchaseShot.toPNG());
    console.log("Verified purchase screenshot saved to:", purchaseShotPath);

    // Now navigate to Parties page and verify party list sidebar balances
    console.log("Testing Parties page list sidebar...");
    await win.webContents.executeJavaScript(`renderFeatureView("parties"); undefined`);
    await new Promise((r) => setTimeout(r, 600));

    const partiesListCheck = await win.webContents.executeJavaScript(`
      (() => {
        const items = Array.from(document.querySelectorAll(".party-list-item"));
        return items.map(item => {
          const name = item.querySelector("strong")?.textContent;
          const side = item.querySelector(".party-list-side");
          const b = side?.querySelector("b");
          const arrow = b?.querySelector("svg");
          const arrowUse = arrow?.querySelector("use")?.getAttribute("href");
          return {
            name,
            text: b?.textContent?.trim(),
            hasArrow: Boolean(arrow),
            arrowHref: arrowUse,
            arrowClass: arrow?.getAttribute("class"),
            isZeroClass: b?.classList.contains("zero-balance-text"),
            isReceivableClass: b?.classList.contains("receivable-text"),
            isPayableClass: b?.classList.contains("payable-text")
          };
        });
      })()
    `);
    console.log("Parties list check results:", partiesListCheck);

    const listZero = partiesListCheck.find(p => p.name === "Zero Balance Trader");
    assert(listZero, "Zero Balance Trader must be in parties list");
    assert.strictEqual(listZero.hasArrow, false, "Zero balance party in list must NOT have arrow");
    assert.strictEqual(listZero.text, "₹0", "Zero balance party in list must display ₹0");
    assert.strictEqual(listZero.isZeroClass, true, "Zero balance party must have zero-balance-text class");

    const listRec = partiesListCheck.find(p => p.name === "Apex Receivables Ltd");
    assert(listRec, "Apex Receivables Ltd must be in parties list");
    assert.strictEqual(listRec.hasArrow, true, "Receivable party must have arrow");
    assert.strictEqual(listRec.arrowHref, "#gi-arrow-down-left", "Receivable must have in-arrow");

    const listPay = partiesListCheck.find(p => p.name === "Bharat Suppliers Corp");
    assert(listPay, "Bharat Suppliers Corp must be in parties list");
    assert.strictEqual(listPay.hasArrow, true, "Payable party must have arrow");
    assert.strictEqual(listPay.arrowHref, "#gi-arrow-up-right", "Payable must have out-arrow");

    // Capture screenshot of the Parties page matching user's Image 1
    await new Promise((r) => setTimeout(r, 400));
    const partiesShot = await win.webContents.capturePage();
    const partiesShotPath = path.join(artifactDir, "parties_list_zero_balance_verified.png");
    fs.writeFileSync(partiesShotPath, partiesShot.toPNG());
    console.log("Verified parties list screenshot saved to:", partiesShotPath);

    console.log("\n========================================================");
    console.log("  PARTY LOOKUP & PILL ARROW VERIFICATION PASSED 100%!   ");
    console.log("========================================================\n");

  } catch (err) {
    console.error("Test error:", err);
    process.exitCode = 1;
  } finally {
    win.close();
    app.quit();
  }
}

app.whenReady().then(runVisualTest);
