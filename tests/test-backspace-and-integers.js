const { app, BrowserWindow } = require("electron");
const path = require("path");

async function run() {
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
    await new Promise((r) => setTimeout(r, 1000));

    const result = await window.webContents.executeJavaScript(`
      (() => {
        const res = {};
        openTransactionEditor("purchase");
        const invInput = document.querySelector('[name="invoiceNo"]');
        
        // Helper to simulate keydown
        const sendKey = (target, key) => {
          const event = new KeyboardEvent("keydown", {
            key: key,
            code: key === "Backspace" ? "Backspace" : ("Digit" + key),
            bubbles: true,
            cancelable: true
          });
          target.dispatchEvent(event);
          if (!event.defaultPrevented) {
            if (key === "Backspace") {
              target.value = target.value.slice(0, -1);
            } else {
              target.value += key;
            }
            target.dispatchEvent(new Event("input", { bubbles: true }));
          }
          return !event.defaultPrevented;
        };

        invInput.value = "";
        res.typingBeforeCalc = {
          typed1: sendKey(invInput, "1"),
          typed2: sendKey(invInput, "2"),
          val: invInput.value,
          backspace: sendKey(invInput, "Backspace"),
          valAfterBack: invInput.value
        };

        // Now open calculator
        openInvoiceCalculator();
        res.calcOpen = Boolean(document.getElementById("invoiceCalculatorPopover"));

        // Try typing integer while calculator is open
        res.typingWhileCalcOpen = {
          typed3: sendKey(invInput, "3"),
          val: invInput.value,
          backspace: sendKey(invInput, "Backspace"),
          valAfterBack: invInput.value
        };

        // Now close calculator by calling openInvoiceCalculator() again (the toolbar toggle)
        openInvoiceCalculator();
        res.calcStillInDOM = Boolean(document.getElementById("invoiceCalculatorPopover"));

        // Try typing integer and backspace after closing via toolbar toggle
        res.typingAfterCalcToggleClosed = {
          typed4: sendKey(invInput, "4"),
          val: invInput.value,
          backspace: sendKey(invInput, "Backspace"),
          valAfterBack: invInput.value
        };

        // Open calculator again and test calculator's own keyboard operations when focus is on calculator
        openInvoiceCalculator();
        const calcPopover = document.getElementById("invoiceCalculatorPopover");
        calcPopover.focus();
        document.activeElement?.blur?.(); // blur any form inputs

        const sendCalcKey = (key) => {
          const event = new KeyboardEvent("keydown", {
            key: key,
            code: key === "Backspace" ? "Backspace" : ("Digit" + key),
            bubbles: true,
            cancelable: true
          });
          document.dispatchEvent(event);
        };

        sendCalcKey("7");
        sendCalcKey("+");
        sendCalcKey("3");
        sendCalcKey("=");

        const displayEl = calcPopover.querySelector("[data-calc-display]");
        res.calcMathResult = displayEl?.textContent;

        sendCalcKey("Escape");
        res.calcClosedOnEscape = !document.getElementById("invoiceCalculatorPopover");

        return res;
      })()
    `);

    console.log("REPRODUCTION TEST RESULT:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("Test error:", err);
  } finally {
    window.destroy();
    app.quit();
  }
}

app.whenReady().then(run);
