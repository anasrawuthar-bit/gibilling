const { app, BrowserWindow } = require("electron");
const path = require("path");
const assert = require("assert");

async function runPrivacyTests() {
  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  try {
    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 600));

    // Ensure clean state before tests begin
    await window.webContents.executeJavaScript(`
      (() => {
        localStorage.removeItem("gi_privacy_mode");
        window.giSetPrivacyMode(false, false);
      })()
    `);

    console.log("Test 1: Verify Privacy Toggle button exists on Dashboard...");
    const initialCheck = await window.webContents.executeJavaScript(`
      (() => {
        showView("home");
        const btn = document.getElementById("dashboardPrivacyToggle");
        if (!btn) return { ok: false, error: "dashboardPrivacyToggle button not found in DOM" };
        const label = btn.querySelector(".privacy-btn-label")?.textContent.trim();
        const iconUse = btn.querySelector("use")?.getAttribute("href");
        const ariaPressed = btn.getAttribute("aria-pressed");
        const hasActiveClass = btn.classList.contains("active");
        const bodyHasClass = document.body.classList.contains("privacy-mode-active");

        return {
          ok: true,
          label,
          iconUse,
          ariaPressed,
          hasActiveClass,
          bodyHasClass
        };
      })()
    `);

    assert.strictEqual(initialCheck.ok, true, initialCheck.error);
    assert.strictEqual(initialCheck.label, "Privacy");
    assert.strictEqual(initialCheck.iconUse, "#gi-eye");
    assert.strictEqual(initialCheck.ariaPressed, "false");
    assert.strictEqual(initialCheck.hasActiveClass, false);
    assert.strictEqual(initialCheck.bodyHasClass, false);
    console.log("  ✓ Button exists with initial inactive state, #gi-eye icon, and 'Privacy' label.");

    console.log("Test 2: Clicking button toggles Privacy Mode ON...");
    const clickOn = await window.webContents.executeJavaScript(`
      (() => {
        const btn = document.getElementById("dashboardPrivacyToggle");
        btn.click();
        const label = btn.querySelector(".privacy-btn-label")?.textContent.trim();
        const iconUse = btn.querySelector("use")?.getAttribute("href");
        const ariaPressed = btn.getAttribute("aria-pressed");
        const hasActiveClass = btn.classList.contains("active");
        const bodyHasClass = document.body.classList.contains("privacy-mode-active");
        const homeHasClass = document.getElementById("homeView")?.classList.contains("privacy-mode-active");
        const stored = localStorage.getItem("gi_privacy_mode");

        return {
          label,
          iconUse,
          ariaPressed,
          hasActiveClass,
          bodyHasClass,
          homeHasClass,
          stored,
          privacyModeState: state.privacyMode
        };
      })()
    `);

    assert.strictEqual(clickOn.privacyModeState, true);
    assert.strictEqual(clickOn.bodyHasClass, true);
    assert.strictEqual(clickOn.homeHasClass, true);
    assert.strictEqual(clickOn.hasActiveClass, true);
    assert.strictEqual(clickOn.ariaPressed, "true");
    assert.strictEqual(clickOn.iconUse, "#gi-eye-off");
    assert.strictEqual(clickOn.label, "Masked");
    assert.strictEqual(clickOn.stored, "1");
    console.log("  ✓ Privacy Mode activated: state=true, icon=#gi-eye-off, label='Masked', stored='1'.");

    console.log("Test 3: Verify text masking and hover peek on sensitive numbers when Privacy Mode is ON...");
    const maskCheck = await window.webContents.executeJavaScript(`
      (() => {
        const recEl = document.getElementById("receivableTotal");
        const payEl = document.getElementById("payableTotal");
        const saleEl = document.getElementById("saleTotal");
        const chartEl = document.getElementById("salesChart");

        const recText = recEl.textContent.trim();
        const payText = payEl.textContent.trim();
        const saleText = saleEl.textContent.trim();
        const chartFilter = window.getComputedStyle(chartEl).filter;

        // Test hover peek on metric card
        const recCard = recEl.closest(".metric-card");
        recCard.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
        const peekingText = recEl.textContent.trim();

        recCard.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
        const remaskedText = recEl.textContent.trim();

        return {
          recText,
          payText,
          saleText,
          chartFilter,
          peekingText,
          remaskedText
        };
      })()
    `);

    assert.strictEqual(maskCheck.recText, "₹ ••••••");
    assert.strictEqual(maskCheck.payText, "₹ ••••••");
    assert.strictEqual(maskCheck.saleText, "₹ ••••••");
    assert(maskCheck.chartFilter.includes("blur"), `Expected chart blur, got: ${maskCheck.chartFilter}`);
    assert.notStrictEqual(maskCheck.peekingText, "₹ ••••••", "Hover peek should reveal actual text");
    assert.strictEqual(maskCheck.remaskedText, "₹ ••••••", "Mouse leave should re-mask text");
    console.log("  ✓ Masked text (₹ ••••••), chart blur, and hover peek verified.");

    console.log("Test 4: Clicking button again toggles Privacy Mode OFF...");
    const clickOff = await window.webContents.executeJavaScript(`
      (() => {
        const btn = document.getElementById("dashboardPrivacyToggle");
        btn.click();
        return {
          privacyMode: state.privacyMode,
          bodyHasClass: document.body.classList.contains("privacy-mode-active"),
          iconUse: btn.querySelector("use")?.getAttribute("href"),
          label: btn.querySelector(".privacy-btn-label")?.textContent.trim(),
          stored: localStorage.getItem("gi_privacy_mode")
        };
      })()
    `);

    assert.strictEqual(clickOff.privacyMode, false);
    assert.strictEqual(clickOff.bodyHasClass, false);
    assert.strictEqual(clickOff.iconUse, "#gi-eye");
    assert.strictEqual(clickOff.label, "Privacy");
    assert.strictEqual(clickOff.stored, "0");
    console.log("  ✓ Privacy Mode deactivated cleanly.");

    console.log("Test 5: Keyboard shortcut Alt+P toggles Privacy Mode...");
    const shortcutTest = await window.webContents.executeJavaScript(`
      (() => {
        document.dispatchEvent(new KeyboardEvent("keydown", {
          key: "p",
          altKey: true,
          bubbles: true,
          cancelable: true
        }));
        const afterFirst = {
          privacyMode: state.privacyMode,
          bodyHasClass: document.body.classList.contains("privacy-mode-active")
        };

        document.dispatchEvent(new KeyboardEvent("keydown", {
          key: "p",
          altKey: true,
          bubbles: true,
          cancelable: true
        }));
        const afterSecond = {
          privacyMode: state.privacyMode,
          bodyHasClass: document.body.classList.contains("privacy-mode-active")
        };

        return { afterFirst, afterSecond };
      })()
    `);

    assert.strictEqual(shortcutTest.afterFirst.privacyMode, true);
    assert.strictEqual(shortcutTest.afterFirst.bodyHasClass, true);
    assert.strictEqual(shortcutTest.afterSecond.privacyMode, false);
    assert.strictEqual(shortcutTest.afterSecond.bodyHasClass, false);
    console.log("  ✓ Alt+P keyboard shortcut verified for instant counter privacy toggle.");

    console.log("Test 6: Persistence on reload...");
    await window.webContents.executeJavaScript(`
      (() => {
        window.giSetPrivacyMode(true, false);
      })()
    `);
    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 600));

    const reloadedCheck = await window.webContents.executeJavaScript(`
      (() => {
        const btn = document.getElementById("dashboardPrivacyToggle");
        return {
          privacyMode: state.privacyMode,
          bodyHasClass: document.body.classList.contains("privacy-mode-active"),
          ariaPressed: btn?.getAttribute("aria-pressed"),
          label: btn?.querySelector(".privacy-btn-label")?.textContent.trim()
        };
      })()
    `);

    assert.strictEqual(reloadedCheck.privacyMode, true);
    assert.strictEqual(reloadedCheck.bodyHasClass, true);
    assert.strictEqual(reloadedCheck.ariaPressed, "true");
    assert.strictEqual(reloadedCheck.label, "Masked");
    console.log("  ✓ Persistence verified: saved state retained upon reload.");

    // Clean up localstorage
    await window.webContents.executeJavaScript(`
      (() => {
        window.giSetPrivacyMode(false, false);
      })()
    `);

    console.log("\nALL 6 PRIVACY TOGGLE TESTS PASSED SUCCESSFULLY!\n");
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  } finally {
    window.destroy();
    app.quit();
  }
}

app.whenReady().then(runPrivacyTests);
