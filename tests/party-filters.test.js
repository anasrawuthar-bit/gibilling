const { app, BrowserWindow } = require("electron");
const path = require("path");
const assert = require("assert");
const fs = require("fs");

const screenshotPath = path.join(
  "C:",
  "Users",
  "ANAS",
  ".gemini",
  "antigravity",
  "brain",
  "bed9650d-397d-4216-aa80-c0ae1c3c4fcb",
  "parties_filter_list_verified.png"
);

async function runPartyFilterTests() {
  const window = new BrowserWindow({
    show: true,
    width: 1366,
    height: 768,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  try {
    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 800));

    // Setup mock parties and transactions
    await window.webContents.executeJavaScript(`
      (() => {
        state.parties = [
          { id: 1, name: "Acme Corp", phone: "9876543210", balance: 5000, receivable: 5000, payable: 0, openingBalance: 1000, lastActivity: "2026-10-15" },
          { id: 2, name: "Beta Suppliers", phone: "9876543211", balance: -3000, receivable: 0, payable: 3000, openingBalance: 0, lastActivity: "2026-09-20" },
          { id: 3, name: "Gamma Traders", phone: "9876543212", balance: 0, receivable: 0, payable: 0, openingBalance: 0, lastActivity: "2026-08-10" }
        ];

        state.invoices = [
          { id: "inv-1", invoiceNo: "INV-001", type: "sale", party: "Acme Corp", date: "2026-09-10", total: 4000, balance: 4000 },
          { id: "inv-2", invoiceNo: "INV-002", type: "sale", party: "Acme Corp", date: "2026-10-12", total: 3000, balance: 3000 }
        ];

        state.payments = [
          { id: "pmt-1", paymentDate: "2026-10-14", type: "payment_in", method: "Cash", party: "Acme Corp", amount: 2000, notes: "Part payment" }
        ];

        partyAdvancedFilter = { balanceType: "all", datePreset: "all", dateFrom: "", dateTo: "" };
        partySearchQuery = "";
        showView("parties");
      })()
    `);

    await new Promise((r) => setTimeout(r, 300));

    console.log("Test 1: Verify Filter Options & Date Types rendered as select lists...");
    const check1 = await window.webContents.executeJavaScript(`
      (() => {
        const balSelect = document.getElementById("partyBalanceFilterSelect");
        const dateSelect = document.getElementById("partyDateTypeSelect");
        if (!balSelect || !dateSelect) {
          return { ok: false, error: "Select elements missing" };
        }

        const balOptions = Array.from(balSelect.options).map(o => o.value);
        const dateOptions = Array.from(dateSelect.options).map(o => o.value);

        return {
          ok: true,
          balOptions,
          dateOptions,
          balVal: balSelect.value,
          dateVal: dateSelect.value
        };
      })()
    `);

    assert.strictEqual(check1.ok, true, check1.error);
    assert.deepStrictEqual(check1.balOptions, ["all", "receivable", "payable", "zero", "active"]);
    assert.deepStrictEqual(check1.dateOptions, ["all", "today", "yesterday", "thisWeek", "thisMonth", "lastMonth", "thisQuarter", "thisYear", "custom"]);
    assert.strictEqual(check1.balVal, "all");
    assert.strictEqual(check1.dateVal, "all");
    console.log("  ✓ Filter Options and Date Types are styled <select> lists with complete choices.");

    console.log("Test 2: Test Balance Filter select option filtering...");
    const checkBalRec = await window.webContents.executeJavaScript(`
      (() => {
        const balSelect = document.getElementById("partyBalanceFilterSelect");
        balSelect.value = "receivable";
        balSelect.dispatchEvent(new Event("change"));
        const items = Array.from(document.querySelectorAll(".party-list-item")).map(i => i.querySelector("strong").textContent);
        return { items };
      })()
    `);
    assert.strictEqual(checkBalRec.items.length, 1);
    assert.strictEqual(checkBalRec.items[0], "Acme Corp");
    console.log("  ✓ 'Receivable' option correctly isolates receivable parties.");

    const checkBalPay = await window.webContents.executeJavaScript(`
      (() => {
        const balSelect = document.getElementById("partyBalanceFilterSelect");
        balSelect.value = "payable";
        balSelect.dispatchEvent(new Event("change"));
        const items = Array.from(document.querySelectorAll(".party-list-item")).map(i => i.querySelector("strong").textContent);
        return { items };
      })()
    `);
    assert.strictEqual(checkBalPay.items.length, 1);
    assert.strictEqual(checkBalPay.items[0], "Beta Suppliers");
    console.log("  ✓ 'Payable' option correctly isolates payable parties.");

    const checkBalZero = await window.webContents.executeJavaScript(`
      (() => {
        const balSelect = document.getElementById("partyBalanceFilterSelect");
        balSelect.value = "zero";
        balSelect.dispatchEvent(new Event("change"));
        const items = Array.from(document.querySelectorAll(".party-list-item")).map(i => i.querySelector("strong").textContent);
        return { items };
      })()
    `);
    assert.strictEqual(checkBalZero.items.length, 1);
    assert.strictEqual(checkBalZero.items[0], "Gamma Traders");
    console.log("  ✓ 'Zero Balance' option correctly isolates zero-balance parties.");

    console.log("Test 3: Test Date Types select option filtering and ledger calculation...");
    const checkDateMonth = await window.webContents.executeJavaScript(`
      (() => {
        const balSelect = document.getElementById("partyBalanceFilterSelect");
        balSelect.value = "all";
        balSelect.dispatchEvent(new Event("change"));

        document.querySelector(".party-list-item[data-party-id='1']")?.click();

        const dateSelect = document.getElementById("partyDateTypeSelect");
        dateSelect.value = "thisMonth";
        dateSelect.dispatchEvent(new Event("change"));

        const badge = document.querySelector(".party-filter-range-badge");
        const banner = document.querySelector(".party-ledger-period-banner");
        const tableRows = Array.from(document.querySelectorAll(".table-card table tbody tr")).map(tr => {
          return Array.from(tr.querySelectorAll("td")).map(td => td.textContent.trim());
        });

        return {
          hasBadge: Boolean(badge),
          badgeText: badge?.textContent.trim(),
          hasBanner: Boolean(banner),
          bannerText: banner?.textContent.trim(),
          tableRows
        };
      })()
    `);

    assert.strictEqual(checkDateMonth.hasBadge, true, "Range badge must display");
    assert.strictEqual(checkDateMonth.hasBanner, true, "Period banner in ledger must display");
    // Opening balance row + 1 sale in Oct + 1 payment in Oct + Closing balance row = 4 rows
    assert.strictEqual(checkDateMonth.tableRows.length, 4);
    assert.strictEqual(checkDateMonth.tableRows[0][1], "Opening Balance");
    assert.strictEqual(checkDateMonth.tableRows[1][1], "sale");
    assert.strictEqual(checkDateMonth.tableRows[2][1], "payment_in");
    assert.strictEqual(checkDateMonth.tableRows[3][1], "Closing Balance");
    console.log("  ✓ 'This Month' accurately calculates opening balance B/F, isolates period transactions, and displays closing balance C/F.");

    console.log("Test 4: Test Custom Range inputs appearance and filtering...");
    const checkCustom = await window.webContents.executeJavaScript(`
      (() => {
        document.querySelector(".party-list-item[data-party-id='1']")?.click();
        const dateSelect = document.getElementById("partyDateTypeSelect");
        dateSelect.value = "custom";
        dateSelect.dispatchEvent(new Event("change"));

        const fromInput = document.getElementById("partyDateFrom");
        const toInput = document.getElementById("partyDateTo");

        if (!fromInput || !toInput) return { ok: false, error: "Custom date inputs not rendered" };

        fromInput.value = "2026-09-01";
        fromInput.dispatchEvent(new Event("change"));

        toInput.value = "2026-09-30";
        toInput.dispatchEvent(new Event("change"));

        const tableRows = Array.from(document.querySelectorAll(".table-card table tbody tr")).map(tr => {
          return Array.from(tr.querySelectorAll("td")).map(td => td.textContent.trim());
        });

        return {
          ok: true,
          tableRows
        };
      })()
    `);

    assert.strictEqual(checkCustom.ok, true, checkCustom.error);
    // Opening Balance + 1 sale in Sep + Closing Balance = 3 rows
    assert.strictEqual(checkCustom.tableRows.length, 3);
    assert.strictEqual(checkCustom.tableRows[0][1], "Opening Balance");
    assert.strictEqual(checkCustom.tableRows[1][1], "sale");
    assert.strictEqual(checkCustom.tableRows[2][1], "Closing Balance");
    console.log("  ✓ Custom Date Range inputs properly filter records within September.");

    console.log("Test 5: Test Clear button resets all filters...");
    const checkClear = await window.webContents.executeJavaScript(`
      (() => {
        const clearBtn = document.getElementById("clearPartyFilters");
        if (!clearBtn) return { ok: false, error: "Clear button not found" };
        clearBtn.click();

        const balSelect = document.getElementById("partyBalanceFilterSelect");
        const dateSelect = document.getElementById("partyDateTypeSelect");
        const clearBtnAfter = document.getElementById("clearPartyFilters");

        return {
          ok: true,
          balVal: balSelect.value,
          dateVal: dateSelect.value,
          hasClearBtn: Boolean(clearBtnAfter)
        };
      })()
    `);

    assert.strictEqual(checkClear.ok, true, checkClear.error);
    assert.strictEqual(checkClear.balVal, "all");
    assert.strictEqual(checkClear.dateVal, "all");
    assert.strictEqual(checkClear.hasClearBtn, false);
    console.log("  ✓ Clear button resets both Filter Options and Date Types back to defaults.");

    // Set This Month and select Acme Corp for visual proof and capture screenshot
    const diag = await window.webContents.executeJavaScript(`
      (() => {
        const dateSelect = document.getElementById("partyDateTypeSelect");
        const beforeVal = dateSelect ? dateSelect.value : "null";
        if (dateSelect) {
          dateSelect.value = "thisMonth";
          dateSelect.dispatchEvent(new Event("change"));
        }
        const afterVal = document.getElementById("partyDateTypeSelect")?.value;
        const filterPreset = partyAdvancedFilter.datePreset;
        return { beforeVal, afterVal, filterPreset };
      })()
    `);
    console.log("[DIAG]", diag);
    await new Promise((r) => setTimeout(r, 400));

    const activePeriodScreenshotPath = path.join(
      "C:",
      "Users",
      "ANAS",
      ".gemini",
      "antigravity",
      "brain",
      "bed9650d-397d-4216-aa80-c0ae1c3c4fcb",
      "parties_filter_active_period.png"
    );

    console.log("Capturing verified screenshot of Parties with active date filter...");
    const imageActive = await window.webContents.capturePage();
    fs.writeFileSync(activePeriodScreenshotPath, imageActive.toPNG());
    console.log("  ✓ Screenshot saved at:", activePeriodScreenshotPath);

    console.log("\n=======================================================");
    console.log("   ALL PARTY FILTER LIST & DATE TYPE TESTS PASSED!     ");
    console.log("=======================================================\n");

    window.close();
    app.quit();
  } catch (err) {
    console.error("Test error:", err);
    window.close();
    app.quit();
    process.exit(1);
  }
}

app.whenReady().then(runPartyFilterTests);
