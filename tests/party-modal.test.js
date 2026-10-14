const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const database = require("../database");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-party-modal-test-"));
app.setPath("userData", testRoot);

app.whenReady().then(async () => {
  const rendererErrors = [];

  try {
    await database.initDatabase(testRoot);
    ipcMain.handle("db:get-state", () => database.getState());
    ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));
    ipcMain.handle("db:create-party", (_event, party) => database.createParty(party));
    ipcMain.handle("db:update-party", (_event, party) => database.updateParty(party));
    ipcMain.handle("db:create-item", (_event, item) => database.createItem(item));

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

    window.webContents.on("console-message", (_event, level, message) => {
      if (level >= 2) rendererErrors.push(message);
    });

    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Open first company
    await window.webContents.executeJavaScript(`document.querySelector(".open-company-button").click(); undefined`);
    await new Promise((resolve) => setTimeout(resolve, 300));

    console.log("Test 1: Opening Add Party modal and verifying header, tabs, and pinned footer...");
    const modalInitialState = await window.webContents.executeJavaScript(`(() => {
      openEntryModal("party");
      const modal = document.getElementById("entryModal");
      const header = modal.querySelector(".entry-modal-header");
      const title = document.getElementById("entryTitle");
      const subtitle = document.getElementById("entrySubtitle");
      const tabs = document.getElementById("partyTabs");
      const tabBtns = Array.from(tabs.querySelectorAll(".party-tab-btn")).map(b => ({
        tab: b.dataset.tab,
        text: b.innerText.trim(),
        active: b.classList.contains("active")
      }));
      const tabPanels = {
        basic: !document.getElementById("partyTabBasic").classList.contains("hidden"),
        gst: !document.getElementById("partyTabGst").classList.contains("hidden"),
        credit: !document.getElementById("partyTabCredit").classList.contains("hidden"),
      };
      const footer = modal.querySelector(".entry-modal-footer");
      const saveBtn = document.getElementById("saveEntryButton");
      const cancelBtn = document.getElementById("cancelEntryButton");

      const modalRect = modal.querySelector(".entry-modal").getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();

      return {
        isVisible: !modal.classList.contains("hidden"),
        titleText: title.innerText.trim(),
        subtitleText: subtitle.innerText.trim(),
        tabBtns,
        tabPanels,
        saveBtnText: saveBtn.innerText.trim(),
        footerVisibleWithinModal: footerRect.bottom <= modalRect.bottom + 2,
        modalHeight: modalRect.height,
        windowHeight: window.innerHeight
      };
    })()`);

    assert.strictEqual(modalInitialState.isVisible, true, "Entry modal must be visible");
    assert.strictEqual(modalInitialState.titleText, "Add Party", "Title must be Add Party");
    assert.strictEqual(modalInitialState.tabBtns.length, 3, "Must have 3 tabs");
    assert.strictEqual(modalInitialState.tabBtns[0].tab, "basic");
    assert.strictEqual(modalInitialState.tabBtns[0].active, true, "Basic Info tab must start active");
    assert.strictEqual(modalInitialState.tabPanels.basic, true, "Basic panel must be visible");
    assert.strictEqual(modalInitialState.tabPanels.gst, false, "GST panel must be hidden initially");
    assert.strictEqual(modalInitialState.tabPanels.credit, false, "Credit panel must be hidden initially");
    assert.strictEqual(modalInitialState.saveBtnText, "Save Party", "Save button text must be Save Party");
    assert.strictEqual(modalInitialState.footerVisibleWithinModal, true, "Footer must be pinned and within modal bounds");
    console.log("  ✓ Add Party modal header, tabs, and pinned footer verified.");

    console.log("Test 2: Switching tabs (GST & Address, Credit & Balance)...");
    const tabSwitchResult = await window.webContents.executeJavaScript(`(() => {
      const gstBtn = document.querySelector('.party-tab-btn[data-tab="gst"]');
      gstBtn.click();
      const afterGstClick = {
        gstActive: gstBtn.classList.contains("active"),
        gstPanelVisible: !document.getElementById("partyTabGst").classList.contains("hidden"),
        basicPanelVisible: !document.getElementById("partyTabBasic").classList.contains("hidden"),
      };

      const creditBtn = document.querySelector('.party-tab-btn[data-tab="credit"]');
      creditBtn.click();
      const afterCreditClick = {
        creditActive: creditBtn.classList.contains("active"),
        creditPanelVisible: !document.getElementById("partyTabCredit").classList.contains("hidden"),
        gstPanelVisible: !document.getElementById("partyTabGst").classList.contains("hidden"),
      };

      return { afterGstClick, afterCreditClick };
    })()`);

    assert.strictEqual(tabSwitchResult.afterGstClick.gstActive, true, "GST tab button should be active");
    assert.strictEqual(tabSwitchResult.afterGstClick.gstPanelVisible, true, "GST panel should be visible");
    assert.strictEqual(tabSwitchResult.afterGstClick.basicPanelVisible, false, "Basic panel should be hidden");
    assert.strictEqual(tabSwitchResult.afterCreditClick.creditActive, true, "Credit tab button should be active");
    assert.strictEqual(tabSwitchResult.afterCreditClick.creditPanelVisible, true, "Credit panel should be visible");
    assert.strictEqual(tabSwitchResult.afterCreditClick.gstPanelVisible, false, "GST panel should be hidden");
    console.log("  ✓ Tab switching between Basic, GST, and Credit works correctly.");

    console.log("Test 3: Testing Party Type chips...");
    const chipTest = await window.webContents.executeJavaScript(`(() => {
      const customerChip = document.querySelector('.party-type-chip[data-type="customer"]');
      const supplierChip = document.querySelector('.party-type-chip[data-type="supplier"]');
      const bothChip = document.querySelector('.party-type-chip[data-type="party"]');
      const hiddenInput = document.querySelector('input[name="type"]');

      const initialCustomer = customerChip.classList.contains("active") && hiddenInput.value === "customer";

      supplierChip.click();
      const afterSupplier = supplierChip.classList.contains("active") && !customerChip.classList.contains("active") && hiddenInput.value === "supplier";

      bothChip.click();
      const afterBoth = bothChip.classList.contains("active") && !supplierChip.classList.contains("active") && hiddenInput.value === "party";

      return { initialCustomer, afterSupplier, afterBoth };
    })()`);

    assert.strictEqual(chipTest.initialCustomer, true, "Default party type must be customer");
    assert.strictEqual(chipTest.afterSupplier, true, "Clicking supplier chip must update selection");
    assert.strictEqual(chipTest.afterBoth, true, "Clicking both chip must update selection");
    console.log("  ✓ Party type chips toggle correctly.");

    console.log("Test 4: Testing GSTIN auto-fill of State and PAN on Tab 2...");
    const gstinTest = await window.webContents.executeJavaScript(`(() => {
      document.querySelector('.party-tab-btn[data-tab="gst"]').click();
      const gstinInput = document.getElementById("partyGstinInput");
      const stateInput = document.getElementById("partyStateInput");
      const panInput = document.getElementById("partyPanInput");

      gstinInput.value = "27ABCDE1234F1Z5";
      gstinInput.dispatchEvent(new Event("input", { bubbles: true }));

      return {
        gstin: gstinInput.value,
        state: stateInput.value,
        pan: panInput.value
      };
    })()`);

    assert.strictEqual(gstinTest.state, "Maharashtra", "GSTIN prefix 27 must auto-fill Maharashtra");
    assert.strictEqual(gstinTest.pan, "ABCDE1234F", "GSTIN characters 3-12 must auto-fill PAN");
    console.log("  ✓ GSTIN 27ABCDE1234F1Z5 correctly auto-filled State (Maharashtra) and PAN (ABCDE1234F).");

    console.log("Test 5: Testing Payment Terms chips and Due Days...");
    const termsTest = await window.webContents.executeJavaScript(`(() => {
      document.querySelector('.party-tab-btn[data-tab="credit"]').click();
      const net30Chip = document.querySelector('.terms-chip[data-terms="Net 30"]');
      net30Chip.click();

      const termsInput = document.getElementById("partyPaymentTermsInput");
      const dueDaysInput = document.getElementById("partyDueDaysInput");

      const balanceToPayChip = document.querySelector('.balance-type-chip.to-pay');
      balanceToPayChip.click();
      const hiddenBalanceSelect = document.getElementById("partyOpeningBalanceType");

      return {
        terms: termsInput.value,
        dueDays: dueDaysInput.value,
        balanceType: hiddenBalanceSelect.value,
        toPayActive: balanceToPayChip.classList.contains("active")
      };
    })()`);

    assert.strictEqual(termsTest.terms, "Net 30", "Net 30 chip should set paymentTerms to 'Net 30'");
    assert.strictEqual(termsTest.dueDays, "30", "Net 30 chip should set dueDays to 30");
    assert.strictEqual(termsTest.balanceType, "payable", "To Pay chip should set openingBalanceType to payable");
    assert.strictEqual(termsTest.toPayActive, true, "To Pay chip should be active");
    console.log("  ✓ Payment terms chips and balance type chips behave as expected.");

    console.log("Test 6: Creating Party through form submission...");
    const creationResult = await window.webContents.executeJavaScript(`(async () => {
      // Switch to Basic tab
      document.querySelector('.party-tab-btn[data-tab="basic"]').click();
      document.querySelector('.party-type-chip[data-type="customer"]').click();
      document.getElementById("partyNameInput").value = "Apex Global Enterprises";
      document.getElementById("partyPhoneInput").value = "9876543210";
      document.getElementById("partyEmailInput").value = "info@apexglobal.in";
      document.getElementById("partyContactPersonInput").value = "Rajesh Sharma";
      document.getElementById("partyNotesInput").value = "Preferred VIP Customer";

      // GST tab
      document.querySelector('.party-tab-btn[data-tab="gst"]').click();
      document.getElementById("partyBillingAddress").value = "Plot 42, Tech Park, Andheri East, Mumbai 400069";

      // Credit tab
      document.querySelector('.party-tab-btn[data-tab="credit"]').click();
      document.getElementById("partyOpeningBalanceInput").value = "15000";
      document.querySelector('.balance-type-chip.to-receive').click();
      document.getElementById("partyCreditLimitInput").value = "100000";

      // Submit form
      const form = document.getElementById("entryForm");
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

      await new Promise(r => setTimeout(r, 600));

      const modalHidden = document.getElementById("entryModal").classList.contains("hidden");
      const createdParty = (state.parties || []).find(p => p.name === "Apex Global Enterprises");

      return {
        modalHidden,
        createdParty: createdParty ? {
          name: createdParty.name,
          phone: createdParty.phone,
          email: createdParty.email,
          contactPerson: createdParty.contactPerson,
          state: createdParty.state,
          pan: createdParty.pan,
          billingAddress: createdParty.billingAddress,
          openingBalance: createdParty.openingBalance,
          creditLimit: createdParty.creditLimit,
          paymentTerms: createdParty.paymentTerms,
          dueDays: createdParty.dueDays
        } : null
      };
    })()`);

    assert.strictEqual(creationResult.modalHidden, true, "Modal should close on save");
    assert.ok(creationResult.createdParty, "Party should be created in state");
    assert.strictEqual(creationResult.createdParty.name, "Apex Global Enterprises");
    assert.strictEqual(creationResult.createdParty.phone, "9876543210");
    assert.strictEqual(creationResult.createdParty.state, "Maharashtra");
    assert.strictEqual(creationResult.createdParty.pan, "ABCDE1234F");
    assert.strictEqual(creationResult.createdParty.billingAddress, "Plot 42, Tech Park, Andheri East, Mumbai 400069");
    assert.strictEqual(creationResult.createdParty.openingBalance, 15000);
    assert.strictEqual(creationResult.createdParty.creditLimit, 100000);
    console.log("  ✓ Party 'Apex Global Enterprises' created with all tab details intact.");

    console.log("Test 7: Editing Party loads values and sets tabs/chips properly...");
    const editResult = await window.webContents.executeJavaScript(`(() => {
      const party = (state.parties || []).find(p => p.name === "Apex Global Enterprises");
      openEntryModal("party", party);

      const title = document.getElementById("entryTitle").innerText.trim();
      const saveBtn = document.getElementById("saveEntryButton").innerText.trim();
      const partyName = document.getElementById("partyNameInput").value;
      const phone = document.getElementById("partyPhoneInput").value;
      const stateVal = document.getElementById("partyStateInput").value;
      const panVal = document.getElementById("partyPanInput").value;
      const balance = document.getElementById("partyOpeningBalanceInput").value;
      const customerChipActive = document.querySelector('.party-type-chip[data-type="customer"]').classList.contains("active");

      // Verify Basic tab is active on edit
      const basicTabActive = document.querySelector('.party-tab-btn[data-tab="basic"]').classList.contains("active");

      return {
        title,
        saveBtn,
        partyName,
        phone,
        stateVal,
        panVal,
        balance,
        customerChipActive,
        basicTabActive
      };
    })()`);

    assert.strictEqual(editResult.title, "Edit Party", "Title must be Edit Party in edit mode");
    assert.strictEqual(editResult.saveBtn, "Update Party", "Button must be Update Party in edit mode");
    assert.strictEqual(editResult.partyName, "Apex Global Enterprises");
    assert.strictEqual(editResult.phone, "9876543210");
    assert.strictEqual(editResult.stateVal, "Maharashtra");
    assert.strictEqual(editResult.panVal, "ABCDE1234F");
    assert.strictEqual(editResult.balance, "15000");
    assert.strictEqual(editResult.customerChipActive, true);
    assert.strictEqual(editResult.basicTabActive, true);
    console.log("  ✓ Edit Party correctly populated all inputs and preserved tab/chip states.");

    console.log("Test 8: Compatibility check with Add Item modal...");
    const itemModalState = await window.webContents.executeJavaScript(`(() => {
      document.getElementById("cancelEntryButton").click();
      openEntryModal("item");

      const modal = document.getElementById("entryModal");
      const title = document.getElementById("entryTitle").innerText.trim();
      const saveBtn = document.getElementById("saveEntryButton").innerText.trim();
      const partyTabs = document.getElementById("partyTabs");
      const partyTabsVisible = partyTabs.offsetParent !== null;
      const itemSection = modal.querySelector(".entry-section.item-only");
      const itemSectionVisible = itemSection && itemSection.offsetParent !== null;

      return {
        title,
        saveBtn,
        partyTabsVisible,
        itemSectionVisible
      };
    })()`);

    assert.strictEqual(itemModalState.title, "Add Item");
    assert.strictEqual(itemModalState.saveBtn, "Save Item");
    assert.strictEqual(itemModalState.partyTabsVisible, false, "Party tabs must be hidden when adding item");
    assert.strictEqual(itemModalState.itemSectionVisible, true, "Item sections must be visible when adding item");
    console.log("  ✓ Add Item modal compatibility verified.");

    console.log("\n=== ALL PARTY MODAL TESTS PASSED SUCCESSFULLY! ===");
  } catch (error) {
    console.error("Test failed:", error);
    process.exitCode = 1;
  } finally {
    try { fs.rmSync(testRoot, { recursive: true, force: true }); } catch {}
    app.exit(process.exitCode || 0);
  }
});
