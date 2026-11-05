const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const assert = require("assert");

const testRoot = path.join(__dirname, "..", "tmp-test-edit-icons");
if (!fs.existsSync(testRoot)) fs.mkdirSync(testRoot, { recursive: true });
app.setPath("userData", testRoot);

const ARTIFACT_DIR = "C:/Users/ANAS/.gemini/antigravity/brain/bed9650d-397d-4216-aa80-c0ae1c3c4fcb";

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  try {
    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 1200));

    const evalRes = await win.webContents.executeJavaScript(`
      (async () => {
        // Ensure test data exists
        if (!state.items || !state.items.length) {
          state.items = [
            { id: 101, name: "Sample Item A", salePrice: 1500, purchasePrice: 1200, currentStock: 25, itemType: "product" },
            { id: 102, name: "Sample Item B", salePrice: 3500, purchasePrice: 2800, currentStock: 10, itemType: "product" }
          ];
        }
        if (!state.parties || !state.parties.length) {
          state.parties = [
            { id: 201, name: "Test Party Alpha", phone: "9876543210", balance: 5000, state: "Kerala" },
            { id: 202, name: "Test Party Beta", phone: "9123456780", balance: -2000, state: "Kerala" }
          ];
        }

        // ==========================================
        // 1. TEST ITEMS VIEW
        // ==========================================
        showView("items");
        await new Promise(r => setTimeout(r, 300));

        const itemDetailEditBtn = document.querySelector(".item-detail [data-action='edit-item']");
        const itemDetailEditBtnByText = Array.from(document.querySelectorAll(".item-detail button")).find(b => b.textContent.trim() === "Edit Item");
        const itemEditIcons = document.querySelectorAll(".item-list-item [data-action='quick-edit-item']");
        const firstItemCard = document.querySelector(".item-list-item");
        const firstItemEditIcon = document.querySelector(".item-list-item [data-action='quick-edit-item']");

        // Click edit icon on first item -> should open Edit Item modal
        firstItemEditIcon?.click();
        await new Promise(r => setTimeout(r, 200));

        const entryModal = document.getElementById("entryModal");
        const modalTitleEl = document.getElementById("entryModalTitle");
        const itemModalOpenedViaIcon = entryModal?.classList.contains("active") || (!entryModal?.classList.contains("hidden") && entryModal?.style.display !== "none");
        const itemModalTitleViaIcon = modalTitleEl?.textContent || "";

        // Close modal
        closeEntryModal();
        await new Promise(r => setTimeout(r, 200));

        // Double click on first item card -> should also open Edit Item modal
        firstItemCard?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
        await new Promise(r => setTimeout(r, 200));

        const itemModalOpenedViaDblClick = entryModal?.classList.contains("active") || (!entryModal?.classList.contains("hidden") && entryModal?.style.display !== "none");
        const itemModalTitleViaDblClick = modalTitleEl?.textContent || "";

        closeEntryModal();
        await new Promise(r => setTimeout(r, 200));

        const itemsCheck = {
          editItemBtnRemoved: !itemDetailEditBtn && !itemDetailEditBtnByText,
          hasItemEditIcons: itemEditIcons.length > 0,
          itemModalOpenedViaIcon,
          itemModalTitleViaIcon,
          itemModalOpenedViaDblClick,
          itemModalTitleViaDblClick
        };

        // ==========================================
        // 2. TEST PARTIES VIEW
        // ==========================================
        showView("parties");
        await new Promise(r => setTimeout(r, 300));

        const partyHeaderEditBtn = document.querySelector(".parties-page .feature-titlebar [data-action='edit-party']");
        const partyHeaderEditBtnByText = Array.from(document.querySelectorAll(".parties-page .feature-titlebar button")).find(b => b.textContent.trim() === "Edit Party");
        const partyEditIcons = document.querySelectorAll(".party-list-item [data-action='quick-edit-party']");
        const firstPartyCard = document.querySelector(".party-list-item");
        const firstPartyEditIcon = document.querySelector(".party-list-item [data-action='quick-edit-party']");

        // Click edit icon on first party -> should open Edit Party modal
        firstPartyEditIcon?.click();
        await new Promise(r => setTimeout(r, 200));

        const partyModalOpenedViaIcon = entryModal?.classList.contains("active") || (!entryModal?.classList.contains("hidden") && entryModal?.style.display !== "none");
        const partyModalTitleViaIcon = modalTitleEl?.textContent || "";

        closeEntryModal();
        await new Promise(r => setTimeout(r, 200));

        // Double click on first party card -> should also open Edit Party modal
        firstPartyCard?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
        await new Promise(r => setTimeout(r, 200));

        const partyModalOpenedViaDblClick = entryModal?.classList.contains("active") || (!entryModal?.classList.contains("hidden") && entryModal?.style.display !== "none");
        const partyModalTitleViaDblClick = modalTitleEl?.textContent || "";

        closeEntryModal();
        await new Promise(r => setTimeout(r, 200));

        const partiesCheck = {
          editPartyBtnRemoved: !partyHeaderEditBtn && !partyHeaderEditBtnByText,
          hasPartyEditIcons: partyEditIcons.length > 0,
          partyModalOpenedViaIcon,
          partyModalTitleViaIcon,
          partyModalOpenedViaDblClick,
          partyModalTitleViaDblClick
        };

        return { itemsCheck, partiesCheck };
      })()
    `);

    console.log("Evaluation Results:", JSON.stringify(evalRes, null, 2));

    // Assert Items
    assert(evalRes.itemsCheck.editItemBtnRemoved, "Edit Item button must be removed from item detail");
    assert(evalRes.itemsCheck.hasItemEditIcons, "Item list items must have quick edit icons");
    assert(evalRes.itemsCheck.itemModalOpenedViaIcon, "Clicking item edit icon must open edit modal");
    assert(evalRes.itemsCheck.itemModalOpenedViaDblClick, "Double-clicking item card must open edit modal");

    // Assert Parties
    assert(evalRes.partiesCheck.editPartyBtnRemoved, "Edit Party button must be removed from header");
    assert(evalRes.partiesCheck.hasPartyEditIcons, "Party list items must have quick edit icons");
    assert(evalRes.partiesCheck.partyModalOpenedViaIcon, "Clicking party edit icon must open edit modal");
    assert(evalRes.partiesCheck.partyModalOpenedViaDblClick, "Double-clicking party card must open edit modal");

    // Capture screenshot of Parties view with edit icons
    const partiesImg = await win.webContents.capturePage();
    const partiesArtifact = path.join(ARTIFACT_DIR, "parties_view_edit_icons_verified.png");
    fs.writeFileSync(partiesArtifact, partiesImg.toPNG());
    console.log("✓ Parties screenshot saved:", partiesArtifact);

    // Switch to Items and capture screenshot
    await win.webContents.executeJavaScript(`showView("items");`);
    await new Promise(r => setTimeout(r, 400));
    const itemsImg = await win.webContents.capturePage();
    const itemsArtifact = path.join(ARTIFACT_DIR, "items_view_edit_icons_verified.png");
    fs.writeFileSync(itemsArtifact, itemsImg.toPNG());
    console.log("✓ Items screenshot saved:", itemsArtifact);

    console.log("=================================================");
    console.log("ALL ITEM & PARTY EDIT ICON UX CHECKS PASSED 100%!");
    console.log("=================================================");
    app.exit(0);
  } catch (err) {
    console.error("Test failed:", err);
    app.exit(1);
  }
});
