const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

const ARTIFACT_DIR = "C:/Users/ANAS/.gemini/antigravity/brain/bed9650d-397d-4216-aa80-c0ae1c3c4fcb";

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  await win.loadFile(path.join(__dirname, "../index.html"));
  await new Promise((r) => setTimeout(r, 1200));

  const result = await win.webContents.executeJavaScript(`
    (async () => {
      const logs = [];
      const log = (msg) => { logs.push(msg); console.log(msg); };

      try {
        // Populate 25 mock items for realistic scroll testing
        if (!state.items || state.items.length < 20) {
          state.items = Array.from({ length: 25 }, (_, i) => ({
            id: i + 1,
            name: "Item #" + (i + 1) + " - Premium Widget",
            itemType: "product",
            category: i % 2 === 0 ? "Hardware" : "Accessories",
            unit: "Pcs",
            salePrice: 1000 + i * 50,
            purchasePrice: 800 + i * 30,
            currentStock: 50 - i,
            openingStock: 50,
            sku: "SKU-" + (1000 + i)
          }));
        }

        // 1. Switch to Items view
        window.showView("items");
        await new Promise((r) => setTimeout(r, 300));

        // 2. Verify top "Print Labels" button is removed from feature header
        const printAllBtn = document.querySelector(".items-page .title-actions [data-action='print-all-barcodes']");
        log("Print Labels button in header: " + (printAllBtn ? "FOUND (FAIL)" : "NOT FOUND (PASS)"));

        const listPanel = document.querySelector(".item-list-panel");
        const listItems = document.querySelectorAll(".item-list-item");
        log("Total items displayed in list: " + listItems.length);

        // 3. Test Scroll preservation on click
        listPanel.scrollTop = 250;
        await new Promise((r) => setTimeout(r, 50));
        const scrollBefore = listPanel.scrollTop;
        log("Scroll position before click: " + scrollBefore);

        // Click on the 10th item (further down)
        const targetItemBtn = listItems[9];
        log("Clicking target item: " + targetItemBtn.querySelector("strong")?.textContent);
        targetItemBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 100));

        const scrollAfter = listPanel.scrollTop;
        log("Scroll position after click: " + scrollAfter);
        const scrollPreserved = Math.abs(scrollAfter - scrollBefore) < 5;
        log("Scroll preserved: " + (scrollPreserved ? "PASS" : "FAIL"));
        const itemIsActive = targetItemBtn.classList.contains("active");
        log("Target item active class: " + (itemIsActive ? "PASS" : "FAIL"));
        const detailTitle = document.querySelector(".item-detail-head h2")?.textContent || "";
        log("Item detail title: " + detailTitle);

        // 4. Test Double-click opens edit modal
        targetItemBtn.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 200));

        const entryModal = document.getElementById("entryModal");
        const isModalActive = entryModal?.classList.contains("active") || (!entryModal?.classList.contains("hidden") && entryModal?.style.display !== "none");
        const modalTitle = document.getElementById("entryModalTitle")?.textContent || "";
        log("Modal opened on dblclick: " + (isModalActive ? "PASS" : "FAIL") + " (Title: " + modalTitle + ")");

        // Close modal
        window.closeEntryModal();
        await new Promise((r) => setTimeout(r, 150));

        // 5. Test Units & Categories navigation & Back to Items button
        const manageMastersBtn = document.querySelector("[data-action='manage-item-masters']");
        manageMastersBtn.click();
        await new Promise((r) => setTimeout(r, 200));

        const mastersPage = document.querySelector(".masters-page");
        log("Units & Categories page opened: " + (mastersPage ? "PASS" : "FAIL"));

        const backBtn = document.querySelector("[data-action='back-to-items']");
        log("Back to Items button exists: " + (backBtn ? "PASS" : "FAIL"));

        if (backBtn) {
          backBtn.click();
          await new Promise((r) => setTimeout(r, 300));
          const itemsPageAfterBack = document.querySelector(".items-page");
          log("Returned to Items page after clicking Back to Items: " + (itemsPageAfterBack ? "PASS" : "FAIL"));
        }

        return {
          success: true,
          logs,
          printAllBtnRemoved: !printAllBtn,
          scrollPreserved,
          itemDetailLoaded: detailTitle.includes("Item #10"),
          dblclickOpenedModal: isModalActive,
          backBtnWorked: Boolean(document.querySelector(".items-page"))
        };
      } catch (err) {
        return { success: false, error: err.stack, logs };
      }
    })();
  `);

  console.log("Test Results:", JSON.stringify(result, null, 2));

  // Capture screenshot of Items view showing cleaned header and active item
  const image = await win.capturePage();
  const screenshotPath = path.join(ARTIFACT_DIR, "items_ux_improvements_verified.png");
  fs.writeFileSync(screenshotPath, image.toPNG());
  console.log("Saved screenshot to:", screenshotPath);

  // Also navigate to Units & Categories and screenshot it
  await win.webContents.executeJavaScript(`
    document.querySelector("[data-action='manage-item-masters']")?.click();
  `);
  await new Promise((r) => setTimeout(r, 300));
  const imageMasters = await win.capturePage();
  const mastersScreenshotPath = path.join(ARTIFACT_DIR, "units_and_categories_back_btn_verified.png");
  fs.writeFileSync(mastersScreenshotPath, imageMasters.toPNG());
  console.log("Saved masters screenshot to:", mastersScreenshotPath);

  win.close();
  app.quit();
});
