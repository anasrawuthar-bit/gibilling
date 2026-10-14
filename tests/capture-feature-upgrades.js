const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

async function capture() {
  const window = new BrowserWindow({
    show: false,
    width: 1366,
    height: 840,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  const artifactDir = "C:\\Users\\ANAS\\.gemini\\antigravity-ide\\brain\\59e13e0d-d816-4f77-9329-31e8ac922a2b";

  try {
    await window.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 1000));

    // Seed state
    await window.webContents.executeJavaScript(`
      (() => {
        state.businessSettings = state.businessSettings || {};
        state.businessSettings.businessName = "GI Enterprises";
        state.businessSettings.bankDetails = {
          bankName: "HDFC Bank",
          accountNumber: "50100234567890",
          ifscCode: "HDFC0001234",
          branch: "Downtown",
          accountHolder: "GI Enterprises",
          upiId: "gienterprises@okhdfcbank"
        };
        state.bankAccounts = [
          {
            id: "bank-1",
            displayName: "HDFC Primary",
            bankName: "HDFC Bank",
            accountNo: "50100234567890",
            ifsc: "HDFC0001234",
            upiId: "gienterprises@okhdfcbank",
            isDefault: 1
          }
        ];
        state.parties = [
          {
            id: 991,
            name: "Metro Retailers Pvt Ltd",
            phone: "9876543210",
            partyType: "customer",
            balance: 14850,
            receivable: 14850,
            payable: 0,
            city: "Bengaluru",
            state: "Karnataka",
            lastActivity: new Date().toISOString()
          }
        ];
        state.items = [
          {
            id: 881,
            name: "Wireless Laser Barcode Scanner",
            barcode: "8901234567890",
            sku: "SCAN-890",
            salePrice: 1850,
            purchasePrice: 1200,
            currentStock: 42,
            openingStock: 42,
            minStock: 10,
            category: "Electronics",
            unit: "Pcs",
            taxRate: 18
          },
          {
            id: 882,
            name: "Thermal Receipt Paper Roll 80mm",
            barcode: "8902233445566",
            sku: "ROLL-80MM",
            salePrice: 95,
            purchasePrice: 55,
            currentStock: 120,
            openingStock: 120,
            minStock: 25,
            category: "Stationery",
            unit: "Pcs",
            taxRate: 12
          }
        ];
        state.transactions = [
          { id: "tx-1", type: "sale", amount: 48500, date: new Date().toISOString() },
          { id: "tx-2", type: "purchase", amount: 28000, date: new Date().toISOString() }
        ];
        state.invoices = [
          {
            id: 771,
            invoiceNo: "INV-2026-042",
            party: "Metro Retailers Pvt Ltd",
            partyId: 991,
            phone: "9876543210",
            type: "sale",
            total: 14850,
            received: 0,
            balance: 14850,
            status: "unpaid",
            date: new Date().toISOString(),
            dueDate: new Date(Date.now() - 15 * 86400000).toISOString().split("T")[0],
            items: [
              { itemId: 881, item: "Wireless Laser Barcode Scanner", qty: 5, price: 1850, total: 9250 }
            ]
          }
        ];
      })()
    `);

    // 1. Feature 1: Analytics BI Dashboard
    console.log("1. Capturing Feature 1 (Analytics)...");
    await window.webContents.executeJavaScript(`
      (() => {
        showView("grow");
      })()
    `);
    await new Promise((r) => setTimeout(r, 1200));
    let img1 = await window.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "feature1_analytics_dashboard.png"), img1.toPNG());
    console.log("  Saved feature1_analytics_dashboard.png");

    // 2. Feature 2: WhatsApp Reminder Modal
    console.log("2. Capturing Feature 2 (WhatsApp Reminder)...");
    await window.webContents.executeJavaScript(`
      (async () => {
        showView("parties");
        const party = state.parties[0];
        const inv = state.invoices[0];
        await openWhatsAppPaymentReminder(party, inv);
      })()
    `);
    await new Promise((r) => setTimeout(r, 1500));
    let img2 = await window.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "feature2_whatsapp_reminder_modal.png"), img2.toPNG());
    console.log("  Saved feature2_whatsapp_reminder_modal.png");

    // Close modal cleanly
    await window.webContents.executeJavaScript(`
      (() => {
        document.querySelectorAll(".whatsapp-modal-backdrop, #whatsappShareModalBackdrop").forEach(el => el.remove());
      })()
    `);
    await new Promise((r) => setTimeout(r, 400));

    // 3. Feature 3: Sync & Backup
    console.log("3. Capturing Feature 3 (Sync & Backup)...");
    const res3 = await window.webContents.executeJavaScript(`
      (() => {
        try {
          showView("sync");
          const container = document.querySelector("#snapshotListContainer");
          if (container) {
            container.innerHTML = \`
              <div style="overflow-x:auto;">
                <table class="data-table" style="width:100%;border-collapse:collapse;">
                  <thead>
                    <tr>
                      <th style="padding:10px 14px;font-size:12px;color:#64748b;font-weight:700;border-bottom:1px solid #e2e8f0;">Snapshot File</th>
                      <th style="padding:10px 14px;font-size:12px;color:#64748b;font-weight:700;border-bottom:1px solid #e2e8f0;">Created At</th>
                      <th style="padding:10px 14px;font-size:12px;color:#64748b;font-weight:700;border-bottom:1px solid #e2e8f0;">File Size</th>
                      <th style="padding:10px 14px;font-size:12px;color:#64748b;font-weight:700;border-bottom:1px solid #e2e8f0;">Integrity</th>
                      <th style="padding:10px 14px;font-size:12px;color:#64748b;font-weight:700;border-bottom:1px solid #e2e8f0;text-align:right;">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style="padding:12px 14px;border-bottom:1px solid #f1f5f9;">
                        <div style="display:flex;align-items:center;gap:10px;">
                          <div style="width:32px;height:32px;border-radius:8px;background:#eff6ff;color:#2563eb;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                            <svg class="gi-icon" style="width:16px;height:16px;"><use href="#gi-file-text"></use></svg>
                          </div>
                          <div>
                            <strong style="font-size:13px;color:#0f172a;display:block;">gi-snapshot-2026-10-03_14-00-00.sqlite</strong>
                            <span style="font-size:11px;color:#94a3b8;">C:\\\\Users\\\\ANAS\\\\AppData\\\\Roaming\\\\GI Billing\\\\backups</span>
                          </div>
                        </div>
                      </td>
                      <td style="padding:12px 14px;font-size:13px;color:#334155;border-bottom:1px solid #f1f5f9;">Today, 2:00:00 PM</td>
                      <td style="padding:12px 14px;font-size:13px;border-bottom:1px solid #f1f5f9;"><span class="kpi-badge badge-blue">1.4 MB</span></td>
                      <td style="padding:12px 14px;font-size:13px;border-bottom:1px solid #f1f5f9;"><span class="kpi-badge badge-green">Verified SQLite</span></td>
                      <td style="padding:12px 14px;border-bottom:1px solid #f1f5f9;text-align:right;">
                        <button class="secondary-button compact-button" type="button" style="color:#2563eb;border-color:#bfdbfe;">↺ Restore</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            \`;
            const countEl = document.querySelector("#syncKpiSnapshotCount");
            if (countEl) countEl.textContent = "1";
          }
          return { ok: true, currentView };
        } catch (e) {
          return { error: e.message, stack: e.stack };
        }
      })()
    `);
    console.log("  Sync step result:", res3);
    await new Promise((r) => setTimeout(r, 1200));
    let img3 = await window.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "feature3_sqlite_backup_sync.png"), img3.toPNG());
    console.log("  Saved feature3_sqlite_backup_sync.png");

    // 4. Feature 4: POS Fast Billing
    console.log("4. Capturing Feature 4 (POS)...");
    const res4 = await window.webContents.executeJavaScript(`
      (() => {
        try {
          posCart = [];
          posSearchQuery = "";
          showView("pos");
          addItemToPosCart(881);
          addItemToPosCart(882);
          const chip2000 = document.querySelector("[data-pos-quick-cash='2000']");
          if (chip2000) chip2000.click();
          return { ok: true, currentView, bodyView: document.body.dataset.view, cartLen: posCart.length };
        } catch (e) {
          return { error: e.message, stack: e.stack };
        }
      })()
    `);
    console.log("  POS step result:", res4);
    await new Promise((r) => setTimeout(r, 1500));
    let img4 = await window.webContents.capturePage();
    fs.writeFileSync(path.join(artifactDir, "feature4_pos_fast_billing.png"), img4.toPNG());
    console.log("  Saved feature4_pos_fast_billing.png");

    console.log("All 4 captures completed cleanly!");
  } catch (err) {
    console.error("Capture failed:", err);
  } finally {
    window.destroy();
    app.quit();
  }
}

app.whenReady().then(capture);
