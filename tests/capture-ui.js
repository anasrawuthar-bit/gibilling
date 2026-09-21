const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const isolatedUserData = process.env.GI_UI_USER_DATA || fs.mkdtempSync(path.join(os.tmpdir(), "gi-billing-ui-"));
const capturePath = process.env.GI_UI_CAPTURE || path.join(os.tmpdir(), "gi-billing-ui-preview.png");
app.setPath("userData", isolatedUserData);

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: Number(process.env.GI_UI_WIDTH || 1366),
    height: Number(process.env.GI_UI_HEIGHT || 768),
    show: false,
    backgroundColor: "#eef3f8",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await window.loadFile(path.join(__dirname, "..", "index.html"));
  await window.webContents.executeJavaScript(`(async () => {
    const btn = document.querySelector('.open-company-button');
    const company = btn?.dataset.company || 'testt';
    if (typeof openCompany === 'function') {
      await openCompany(company);
    } else {
      btn?.click();
    }
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 600));
  const targetView = process.env.GI_UI_VIEW || "sale";
  if (targetView === "home") {
    await window.webContents.executeJavaScript('showView("home")');
  } else {
    await window.webContents.executeJavaScript(`openTransactionEditor("${targetView}", { skipDirtyCheck: true })`);
    if (process.env.GI_UI_OPEN_DETAILS === "1") {
      await window.webContents.executeJavaScript('document.querySelector(".editor-more-details").open = true');
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 800));
  if (process.env.GI_UI_BOTTOM === '1') {
    const scrollInfo = await window.webContents.executeJavaScript(`(() => {
      const scrollable = [];
      document.querySelectorAll('*').forEach(el => {
        if (el.scrollHeight > el.clientHeight + 10 && el.clientHeight > 100) {
          scrollable.push({ tag: el.tagName, class: el.className, id: el.id, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight });
          el.scrollTop = el.scrollHeight;
        }
      });
      window.scrollTo(0, document.body.scrollHeight);
      return scrollable;
    })()`);
    console.log("Scrollable elements:", JSON.stringify(scrollInfo, null, 2));
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const image = await window.webContents.capturePage();
  fs.writeFileSync(capturePath, image.toPNG());
  console.log(capturePath);
  app.quit();
});
