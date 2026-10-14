const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const database = require("../database");

let mainWindow;
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gi-billing-company-test-"));
app.setPath("userData", testRoot);

app.whenReady().then(async () => {
  await database.initDatabase(testRoot);
  ipcMain.handle("db:get-state", () => database.getState());
  ipcMain.handle("db:set-current-company", (_event, name) => database.setCurrentCompany(name));

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "../index.html"));

  mainWindow.webContents.once("did-finish-load", async () => {
    try {
      const results = await mainWindow.webContents.executeJavaScript(`
        (async () => {
          const report = [];

          // 1. Verify company switch button exists
          const companySwitch = document.querySelector(".company-switch");
          report.push({
            name: "Company switch element exists in sidebar",
            pass: !!companySwitch,
            details: companySwitch ? companySwitch.className : "not found"
          });

          // 2. Click company switch and verify view changes to appSettings COMPANY
          companySwitch.click();
          await new Promise(r => setTimeout(r, 100));

          const pageHeading = document.querySelector(".settings-page-header h2")?.textContent.trim();
          const activeCompanyTab = document.querySelector('[data-settings-tab="COMPANY"]')?.classList.contains("active");
          const isSwitchActive = companySwitch.classList.contains("active");

          report.push({
            name: "Clicking company-switch opens appSettings COMPANY",
            pass: pageHeading === "Company Profile" && activeCompanyTab === true,
            details: "heading=" + pageHeading + ", companyTabActive=" + activeCompanyTab
          });

          report.push({
            name: "Company-switch element receives .active class",
            pass: isSwitchActive,
            details: "classList=" + companySwitch.className
          });

          // 3. Verify Switch Company button exists in settings header
          const switchCompanyBtn = document.querySelector("[data-action='switch-company']");
          report.push({
            name: "Switch Company button exists in Company Profile header",
            pass: !!switchCompanyBtn,
            details: switchCompanyBtn ? switchCompanyBtn.textContent.trim() : "not found"
          });

          // 4. Test clicking Switch Company button fires gi-change-company event
          let changeCompanyFired = false;
          window.addEventListener("gi-change-company", () => {
            changeCompanyFired = true;
          }, { once: true });

          if (switchCompanyBtn) {
            switchCompanyBtn.click();
          }

          report.push({
            name: "Clicking Switch Company button dispatches gi-change-company",
            pass: changeCompanyFired,
            details: "fired=" + changeCompanyFired
          });

          return report;
        })()
      `);

      console.log("\n=== COMPANY SWITCH TEST RESULTS ===");
      let allPassed = true;
      for (const res of results) {
        console.log((res.pass ? " PASS: " : " FAIL: ") + res.name + " (" + res.details + ")");
        if (!res.pass) allPassed = false;
      }
      console.log("===================================\n");

      if (allPassed) {
        console.log("ALL TESTS PASSED!");
        app.exit(0);
      } else {
        console.error("SOME TESTS FAILED!");
        app.exit(1);
      }
    } catch (err) {
      console.error("Test execution error:", err);
      app.exit(1);
    }
  });
});
