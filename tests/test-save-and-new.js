const { app, BrowserWindow } = require("electron");
const path = require("path");
const assert = require("assert");
const fs = require("fs");

const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity-ide\\brain\\9dd39af8-a7ad-430b-8ee8-49729ceb732f";

async function runTest() {
  const window = new BrowserWindow({
    show: true,
    width: 1366,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  try {
    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 1200));

    console.log("TEST 1: Testing Party Modal with Save & New...");
    await window.webContents.executeJavaScript(`
      (() => {
        openEntryModal("party");
      })()
    `);
    await new Promise((r) => setTimeout(r, 500));

    // Capture screenshot of Add Party Modal showing Save & New button
    const partyShot = await window.webContents.capturePage();
    const partyShotPath = path.join(artifactDir, "party_modal_save_and_new_verified.png");
    fs.writeFileSync(partyShotPath, partyShot.toPNG());
    console.log("  Saved Add Party screenshot to:", partyShotPath);

    const partyBtnCheck = await window.webContents.executeJavaScript(`
      (() => {
        const saveNewBtn = document.getElementById("saveAndNewEntryButton");
        const saveBtn = document.getElementById("saveEntryButton");
        const cancelBtn = document.getElementById("cancelEntryButton");
        const computed = saveNewBtn ? window.getComputedStyle(saveNewBtn) : null;
        return {
          hasSaveNew: !!saveNewBtn,
          saveNewText: saveNewBtn?.textContent.trim(),
          saveNewDisplay: computed?.display,
          saveBtnText: saveBtn?.textContent.trim(),
          cancelBtnText: cancelBtn?.textContent.trim(),
          color: computed?.color,
          borderColor: computed?.borderColor
        };
      })()
    `);
    console.log("  Party buttons check:", partyBtnCheck);
    assert.strictEqual(partyBtnCheck.hasSaveNew, true, "Save & New button must exist");
    assert.strictEqual(partyBtnCheck.saveNewText, "Save & New", "Button text must be 'Save & New'");
    assert.notStrictEqual(partyBtnCheck.saveNewDisplay, "none", "Save & New must be visible in party modal");
    assert.strictEqual(partyBtnCheck.saveBtnText, "Save Party", "Save button must be 'Save Party'");

    console.log("  Submitting Party 1 using 'Save & New'...");
    await window.webContents.executeJavaScript(`
      (() => {
        document.getElementById("partyNameInput").value = "SaveNew Alpha Corp";
        document.querySelector('#entryForm [name="phone"]').value = "9988776655";
        document.getElementById("saveAndNewEntryButton").click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 600));

    // Verify Party 1 was saved and modal is still open
    const party1SavedCheck = await window.webContents.executeJavaScript(`
      (() => {
        const modal = document.getElementById("entryModal");
        const isModalOpen = !modal.classList.contains("hidden");
        const nameVal = document.getElementById("partyNameInput").value;
        const partyExists = state.parties.some(p => p.name === "SaveNew Alpha Corp");
        const activeElId = document.activeElement?.id;
        return { isModalOpen, nameVal, partyExists, activeElId };
      })()
    `);
    console.log("  After Party 1 Save & New:", party1SavedCheck);
    assert.strictEqual(party1SavedCheck.partyExists, true, "Party 1 must be saved in state");
    assert.strictEqual(party1SavedCheck.isModalOpen, true, "Modal must remain open after Save & New");
    assert.strictEqual(party1SavedCheck.nameVal, "", "Party name input must be cleared for next entry");

    console.log("  Submitting Party 2 using standard 'Save Party'...");
    await window.webContents.executeJavaScript(`
      (() => {
        document.getElementById("partyNameInput").value = "SaveNew Beta Industries";
        document.querySelector('#entryForm [name="phone"]').value = "9988776644";
        document.getElementById("saveEntryButton").click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 600));

    // Verify Party 2 was saved and modal is closed
    const party2SavedCheck = await window.webContents.executeJavaScript(`
      (() => {
        const modal = document.getElementById("entryModal");
        const isModalOpen = !modal.classList.contains("hidden");
        const party1Exists = state.parties.some(p => p.name === "SaveNew Alpha Corp");
        const party2Exists = state.parties.some(p => p.name === "SaveNew Beta Industries");
        return { isModalOpen, party1Exists, party2Exists };
      })()
    `);
    console.log("  After Party 2 Save:", party2SavedCheck);
    assert.strictEqual(party2SavedCheck.party2Exists, true, "Party 2 must be saved in state");
    assert.strictEqual(party2SavedCheck.party1Exists, true, "Party 1 must still exist");
    assert.strictEqual(party2SavedCheck.isModalOpen, false, "Modal must be closed after normal Save");


    console.log("\nTEST 2: Testing Item Modal with Save & New...");
    await window.webContents.executeJavaScript(`
      (() => {
        openEntryModal("item");
      })()
    `);
    await new Promise((r) => setTimeout(r, 500));

    // Capture screenshot of Add Item Modal showing Save & New button
    const itemShot = await window.webContents.capturePage();
    const itemShotPath = path.join(artifactDir, "item_modal_save_and_new_verified.png");
    fs.writeFileSync(itemShotPath, itemShot.toPNG());
    console.log("  Saved Add Item screenshot to:", itemShotPath);

    const itemBtnCheck = await window.webContents.executeJavaScript(`
      (() => {
        const saveNewBtn = document.getElementById("saveAndNewEntryButton");
        const saveBtn = document.getElementById("saveEntryButton");
        const cancelBtn = document.getElementById("cancelEntryButton");
        const computed = saveNewBtn ? window.getComputedStyle(saveNewBtn) : null;
        return {
          hasSaveNew: !!saveNewBtn,
          saveNewText: saveNewBtn?.textContent.trim(),
          saveNewDisplay: computed?.display,
          saveBtnText: saveBtn?.textContent.trim(),
          cancelBtnText: cancelBtn?.textContent.trim()
        };
      })()
    `);
    console.log("  Item buttons check:", itemBtnCheck);
    assert.strictEqual(itemBtnCheck.hasSaveNew, true, "Save & New button must exist");
    assert.strictEqual(itemBtnCheck.saveNewText, "Save & New", "Button text must be 'Save & New'");
    assert.notStrictEqual(itemBtnCheck.saveNewDisplay, "none", "Save & New must be visible in item modal");
    assert.strictEqual(itemBtnCheck.saveBtnText, "Save Item", "Save button must be 'Save Item'");

    console.log("  Submitting Item 1 using 'Save & New'...");
    await window.webContents.executeJavaScript(`
      (() => {
        document.getElementById("itemNameInput").value = "Speed Turbine 500";
        document.querySelector('#entryForm [name="salePrice"]').value = "4500";
        document.getElementById("saveAndNewEntryButton").click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 600));

    // Verify Item 1 was saved and modal is still open
    const item1SavedCheck = await window.webContents.executeJavaScript(`
      (() => {
        const modal = document.getElementById("entryModal");
        const isModalOpen = !modal.classList.contains("hidden");
        const nameVal = document.getElementById("itemNameInput").value;
        const itemExists = state.items.some(i => i.name === "Speed Turbine 500");
        return { isModalOpen, nameVal, itemExists };
      })()
    `);
    console.log("  After Item 1 Save & New:", item1SavedCheck);
    assert.strictEqual(item1SavedCheck.itemExists, true, "Item 1 must be saved in state");
    assert.strictEqual(item1SavedCheck.isModalOpen, true, "Modal must remain open after Save & New");
    assert.strictEqual(item1SavedCheck.nameVal, "", "Item name input must be cleared for next entry");

    console.log("  Submitting Item 2 using standard 'Save Item'...");
    await window.webContents.executeJavaScript(`
      (() => {
        document.getElementById("itemNameInput").value = "Speed Turbine 800";
        document.querySelector('#entryForm [name="salePrice"]').value = "7500";
        document.getElementById("saveEntryButton").click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 600));

    // Verify Item 2 was saved and modal is closed
    const item2SavedCheck = await window.webContents.executeJavaScript(`
      (() => {
        const modal = document.getElementById("entryModal");
        const isModalOpen = !modal.classList.contains("hidden");
        const item1Exists = state.items.some(i => i.name === "Speed Turbine 500");
        const item2Exists = state.items.some(i => i.name === "Speed Turbine 800");
        return { isModalOpen, item1Exists, item2Exists };
      })()
    `);
    console.log("  After Item 2 Save:", item2SavedCheck);
    assert.strictEqual(item2SavedCheck.item2Exists, true, "Item 2 must be saved in state");
    assert.strictEqual(item2SavedCheck.item1Exists, true, "Item 1 must still exist");
    assert.strictEqual(item2SavedCheck.isModalOpen, false, "Modal must be closed after normal Save");

    console.log("\n===================================================================");
    console.log("  ALL SAVE & NEW TESTS FOR BOTH ITEM AND PARTY PASSED 100%!        ");
    console.log("===================================================================\n");

  } catch (err) {
    console.error("Test error:", err);
    process.exitCode = 1;
  } finally {
    window.close();
    app.quit();
  }
}

app.whenReady().then(runTest);
