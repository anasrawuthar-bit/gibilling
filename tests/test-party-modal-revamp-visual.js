const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity-ide\\brain\\9dd39af8-a7ad-430b-8ee8-49729ceb732f";

async function runVisualTest() {
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

    console.log("Setting up Party Modal matching user's Screenshot 1 (GST & Address)...");
    await window.webContents.executeJavaScript(`
      (() => {
        openEntryModal("party");
        document.getElementById("partyNameInput").value = "sadfr";
        document.getElementById("partyGstinInput").value = "27ABCDE1234F1Z5";
        document.getElementById("partyPhoneInput").value = "9568487525";

        document.getElementById("partyTaxType").value = "gst_registered";
        document.getElementById("partyStateInput").value = "Maharashtra";
        document.getElementById("partyEmailInput").value = "contact@example.com";

        // Setup billing address card
        const billingCard = document.querySelector('[data-address-card="billing-0"]');
        if (billingCard) {
          billingCard.classList.add("active");
          const ta = billingCard.querySelector("textarea");
          if (ta) ta.value = "xcvbxcvb";
        }
        // Add second billing address card
        const billingList = document.getElementById("billingAddressList");
        if (billingList) {
          const card2 = document.createElement("div");
          card2.className = "address-card";
          card2.innerHTML = '<textarea class="address-card-textarea" readonly>xcfgbxcdvb</textarea><div class="address-card-actions"><button type="button" class="address-card-menu-btn">⋮</button></div>';
          billingList.appendChild(card2);
        }

        // Setup shipping address cards
        const shippingCard = document.querySelector('[data-address-card="shipping-0"]');
        if (shippingCard) {
          const ta = shippingCard.querySelector("textarea");
          if (ta) ta.value = "xcvbxcvb";
        }
        const shippingList = document.getElementById("shippingAddressList");
        if (shippingList) {
          const sCard2 = document.createElement("div");
          sCard2.className = "address-card";
          sCard2.innerHTML = '<textarea class="address-card-textarea" readonly>zxcfzsdfaf</textarea><div class="address-card-actions"><button type="button" class="address-card-menu-btn">⋮</button></div>';
          shippingList.appendChild(sCard2);
        }

        activatePartyTab("gst");
      })()
    `);
    await new Promise((r) => setTimeout(r, 600));

    const shot1 = await window.webContents.capturePage();
    const shot1Path = path.join(artifactDir, "party_page_gst_and_address_verified.png");
    fs.writeFileSync(shot1Path, shot1.toPNG());
    console.log("  Saved Screenshot 1 (GST & Address) to:", shot1Path);

    console.log("Setting up Party Modal matching user's Screenshot 2 (Credit & Balance)...");
    await window.webContents.executeJavaScript(`
      (() => {
        activatePartyTab("credit");
        document.getElementById("partyOpeningBalanceInput").value = "15000";
        document.getElementById("partyAsOfDateInput").value = "2026-10-19";

        const receiveRadio = document.querySelector('input[name="creditBalanceRadio"][value="receivable"]');
        if (receiveRadio) receiveRadio.checked = true;

        const creditLimitToggle = document.getElementById("partyCreditLimitToggle");
        if (creditLimitToggle) creditLimitToggle.checked = false;
        document.getElementById("noLimitLabel")?.classList.add("active");
        document.getElementById("customLimitLabel")?.classList.remove("active");
      })()
    `);
    await new Promise((r) => setTimeout(r, 600));

    const shot2 = await window.webContents.capturePage();
    const shot2Path = path.join(artifactDir, "party_page_credit_and_balance_verified.png");
    fs.writeFileSync(shot2Path, shot2.toPNG());
    console.log("  Saved Screenshot 2 (Credit & Balance) to:", shot2Path);

    console.log("\n===================================================================");
    console.log("  VISUAL VERIFICATION SCREENSHOTS CAPTURED SUCCESSFULLY!          ");
    console.log("===================================================================\n");

  } catch (err) {
    console.error("Visual test error:", err);
    process.exitCode = 1;
  } finally {
    window.close();
    app.quit();
  }
}

app.whenReady().then(runVisualTest);
