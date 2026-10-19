const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-unified-header-test-"));
app.setPath("userData", testRoot);

const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity\\brain\\bed9650d-397d-4216-aa80-c0ae1c3c4fcb";
const collapsedCapturePath = path.join(artifactDir, "editor_unified_header_collapsed.png");
const expandedCapturePath = path.join(artifactDir, "editor_unified_header_expanded.png");

app.whenReady().then(async () => {
  let win;
  try {
    await database.initDatabase(testRoot);

    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
    ipcMain.handle("db:get-last-active-company", () => database.getLastActiveCompany());
    ipcMain.handle("db:create-party", (_event, party) => database.createParty(party));
    ipcMain.handle("db:create-item", (_event, item) => database.createItem(item));
    ipcMain.handle("db:create-transaction", (_event, tx) => database.createTransaction(tx));
    ipcMain.handle("db:update-business-settings", (_event, s) => database.updateBusinessSettings(s));
    ipcMain.handle("db:preview-next-invoice-number", (_event, type, date) => database.previewNextInvoiceNumber(type, date));

    win = new BrowserWindow({
      show: true,
      width: 1366,
      height: 768,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 800));

    // Open active company
    await win.webContents.executeJavaScript(`
      (async () => {
        const btn = document.querySelector(".open-company-button");
        const companyName = btn?.dataset?.company || "testt";
        await openCompany(companyName);
      })()
    `);
    await new Promise((r) => setTimeout(r, 1200));

    // Open transaction editor (Sale)
    await win.webContents.executeJavaScript(`
      (async () => {
        openTransactionEditor("sale", { skipDirtyCheck: true });
      })()
    `);
    await new Promise((r) => setTimeout(r, 600));

    // 1. Verify that Customer and Document and Details are all in ONE group card
    const layoutCheck = await win.webContents.executeJavaScript(`
      (() => {
        const topGrid = document.querySelector(".editor-top-grid");
        const cards = topGrid.querySelectorAll(".editor-card");
        const unifiedCard = topGrid.querySelector(".editor-unified-card");
        const primaryRow = topGrid.querySelector(".editor-unified-primary-row");
        const moreDetails = topGrid.querySelector(".editor-more-details");
        
        // Measure input and label font sizes and heights
        const label = topGrid.querySelector(".editor-compact-label");
        const labelStyle = window.getComputedStyle(label);
        const input = topGrid.querySelector('input[name="party"]');
        const inputStyle = window.getComputedStyle(input);
        
        const topGridRect = topGrid.getBoundingClientRect();
        const cardRect = unifiedCard.getBoundingClientRect();
        const children = Array.from(unifiedCard.children).map(c => ({
          tag: c.tagName,
          className: c.className,
          rect: c.getBoundingClientRect(),
          computedHeight: window.getComputedStyle(c).height
        }));

        return {
          totalCardsInTopGrid: cards.length,
          hasUnifiedCard: Boolean(unifiedCard),
          hasPrimaryRow: Boolean(primaryRow),
          hasMoreDetailsInCard: unifiedCard.contains(moreDetails),
          labelFontSize: labelStyle.fontSize,
          inputFontSize: inputStyle.fontSize,
          inputHeight: inputStyle.height,
          cardHeight: cardRect.height,
          topGridHeight: topGridRect.height,
          isMoreDetailsOpen: moreDetails.open,
          children
        };
      })()
    `);

    console.log("Collapsed layout check:", layoutCheck);
    assert.strictEqual(layoutCheck.hasUnifiedCard, true, "Must have single unified card");
    assert.strictEqual(layoutCheck.totalCardsInTopGrid, 1, "Top section must have exactly ONE group card");
    assert.strictEqual(layoutCheck.hasMoreDetailsInCard, true, "More details must be inside the single group card");
    assert(parseFloat(layoutCheck.labelFontSize) <= 12, `Label font size must be small (<= 12px), got ${layoutCheck.labelFontSize}`);
    assert(parseFloat(layoutCheck.inputFontSize) <= 12, `Input font size must be small (<= 12px), got ${layoutCheck.inputFontSize}`);
    assert(parseFloat(layoutCheck.inputHeight) <= 30, `Input height must be compact (<= 30px), got ${layoutCheck.inputHeight}`);
    assert(layoutCheck.cardHeight < 95, `Collapsed card height must be compact (< 95px), got ${layoutCheck.cardHeight}px`);
    console.log("✓ Collapsed layout verified: single group card with compact height and smaller font!");

    // Capture collapsed screenshot
    const imgCollapsed = await win.webContents.capturePage();
    fs.writeFileSync(collapsedCapturePath, imgCollapsed.toPNG());
    console.log("✓ Captured collapsed screenshot to:", collapsedCapturePath);

    // 2. Click "More details" toggle button and verify smooth expansion
    await win.webContents.executeJavaScript(`
      (() => {
        const toggleBtn = document.querySelector('[data-editor-action="toggle-more-details"]');
        toggleBtn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 400));

    const expandedCheck = await win.webContents.executeJavaScript(`
      (() => {
        const topGrid = document.querySelector(".editor-top-grid");
        const unifiedCard = topGrid.querySelector(".editor-unified-card");
        const moreDetails = topGrid.querySelector(".editor-more-details");
        const cardRect = unifiedCard.getBoundingClientRect();
        const topGridRect = topGrid.getBoundingClientRect();

        // Check fields inside More details
        const address = topGrid.querySelector('[name="address"]');
        const terms = topGrid.querySelector('[name="paymentTerms"]');
        const dueDate = topGrid.querySelector('[name="dueDate"]');
        const gstin = topGrid.querySelector('[name="partyGstin"]');
        const notes = topGrid.querySelector('[name="invoiceDescription"]');

        const moreDetailsChildren = Array.from(moreDetails.children).map(c => ({
          tag: c.tagName,
          className: c.className,
          rect: c.getBoundingClientRect(),
          computedHeight: window.getComputedStyle(c).height
        }));

        return {
          isOpen: moreDetails.open,
          cardHeight: cardRect.height,
          topGridHeight: topGridRect.height,
          hasAddress: Boolean(address),
          hasTerms: Boolean(terms),
          hasDueDate: Boolean(dueDate),
          hasGstin: Boolean(gstin),
          hasNotes: Boolean(notes),
          moreDetailsChildren
        };
      })()
    `);

    console.log("Expanded layout check:", expandedCheck);

    // Capture expanded screenshot
    const imgExpanded = await win.webContents.capturePage();
    fs.writeFileSync(expandedCapturePath, imgExpanded.toPNG());
    console.log("✓ Captured expanded screenshot to:", expandedCapturePath);

    assert.strictEqual(expandedCheck.isOpen, true, "More details must be open after toggle click");
    assert.strictEqual(expandedCheck.hasAddress, true, "Address field exists");
    assert.strictEqual(expandedCheck.hasTerms, true, "Terms field exists");
    assert.strictEqual(expandedCheck.hasDueDate, true, "DueDate field exists");
    assert.strictEqual(expandedCheck.hasGstin, true, "GSTIN field exists");
    assert.strictEqual(expandedCheck.hasNotes, true, "Notes field exists");
    console.log("✓ Captured expanded screenshot to:", expandedCapturePath);

    console.log("=== ALL UNIFIED HEADER TESTS PASSED 100% ===");
  } catch (err) {
    console.error("Test failed:", err);
    process.exitCode = 1;
  } finally {
    if (win) win.close();
    app.quit();
  }
});
