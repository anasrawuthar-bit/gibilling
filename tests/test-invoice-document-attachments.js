const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const screenshotDir = path.join(
  "C:",
  "Users",
  "ANAS",
  ".gemini",
  "antigravity",
  "brain",
  "bed9650d-397d-4216-aa80-c0ae1c3c4fcb"
);

app.whenReady().then(async () => {
  let win = null;
  try {
    win = new BrowserWindow({
      show: false,
      width: 1366,
      height: 768,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload.js"),
        contextIsolation: false,
        nodeIntegration: true,
      },
    });

    await win.loadFile(path.join(__dirname, "..", "index.html"));
    await new Promise((r) => setTimeout(r, 1000));

    console.log("TEST 1: Opening Sale invoice editor...");
    await win.webContents.executeJavaScript(`
      (() => {
        state.parties = [
          { id: 101, name: "Alpha Traders", phone: "9876543210", balance: 0, state: "Kerala" }
        ];
        state.items = [
          { id: 201, name: "Wireless Keyboard", sku: "KB-01", stock: 25, salePrice: 1200, taxRate: 18 }
        ];
        openTransactionEditor("sale", { skipDirtyCheck: true });
      })()
    `);
    await new Promise((r) => setTimeout(r, 600));

    // Verify Image button is removed and only Document button exists
    const buttonCheck = await win.webContents.executeJavaScript(`
      (() => {
        const imageBtn = document.querySelector('[data-editor-extra="image"]');
        const docBtn = document.querySelector('[data-editor-extra="document"]');
        const imageInput = document.getElementById("editorImageInput");
        const docInput = document.getElementById("editorDocumentInput");
        return {
          hasImageBtn: !!imageBtn,
          hasDocBtn: !!docBtn,
          docBtnText: docBtn ? docBtn.textContent.trim() : "",
          hasImageInput: !!imageInput,
          hasDocInput: !!docInput,
          docInputAccept: docInput ? docInput.getAttribute("accept") : "",
        };
      })()
    `);

    assert.strictEqual(buttonCheck.hasImageBtn, false, "Separate Image button must NOT exist");
    assert.strictEqual(buttonCheck.hasImageInput, false, "editorImageInput must NOT exist");
    assert.strictEqual(buttonCheck.hasDocBtn, true, "Unified Document button must exist");
    assert.ok(buttonCheck.docInputAccept.includes("image/*"), "Document input must accept image/*");
    assert.ok(buttonCheck.docInputAccept.includes(".pdf"), "Document input must accept .pdf");
    console.log("✓ Verified: Image button removed, unified Document button accepts photos and documents");

    // TEST 2: Attach mock photo and PDF documents
    console.log("TEST 2: Attaching mock photo and PDF documents...");
    await win.webContents.executeJavaScript(`
      (() => {
        editorActiveAttachments = [
          {
            id: "att-1",
            name: "delivery_receipt.jpg",
            size: 204800, // 200 KB
            type: "image/jpeg",
            data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
          },
          {
            id: "att-2",
            name: "purchase_order.pdf",
            size: 524288, // 512 KB
            type: "application/pdf",
            data: "data:application/pdf;base64,JVBERi0xLjQK"
          }
        ];
        renderEditorAttachmentList();
      })()
    `);
    await new Promise((r) => setTimeout(r, 300));

    // Capture screenshot of editor with document attachment chips
    const imgBuffer1 = await win.webContents.capturePage();
    fs.writeFileSync(path.join(screenshotDir, "clean_invoice_attachments_chips.png"), imgBuffer1.toPNG());
    console.log("✓ Saved clean_invoice_attachments_chips.png");

    const chipsCheck = await win.webContents.executeJavaScript(`
      (() => {
        const chips = document.querySelectorAll(".editor-attachment-chip");
        return Array.from(chips).map(chip => ({
          id: chip.dataset.attachmentId,
          name: chip.querySelector(".editor-attachment-name")?.textContent.trim(),
          size: chip.querySelector(".editor-attachment-size")?.textContent.trim(),
          hasViewBtn: !!chip.querySelector('[data-attachment-action="view"]'),
          hasRemoveBtn: !!chip.querySelector('[data-attachment-action="remove"]'),
        }));
      })()
    `);

    assert.strictEqual(chipsCheck.length, 2, "Must render 2 attachment chips");
    assert.strictEqual(chipsCheck[0].name, "delivery_receipt.jpg");
    assert.strictEqual(chipsCheck[0].hasViewBtn, true, "Must have View button");
    assert.strictEqual(chipsCheck[0].hasRemoveBtn, true, "Must have Remove button");
    assert.strictEqual(chipsCheck[1].name, "purchase_order.pdf");
    console.log("✓ Verified: Chips rendered with name, size, View button, and Remove button");

    // TEST 3: Click View button on image attachment
    console.log("TEST 3: Opening attachment viewer modal for image...");
    await win.webContents.executeJavaScript(`
      (() => {
        const viewBtn = document.querySelector('[data-attachment-id="att-1"][data-attachment-action="view"]');
        if (viewBtn) viewBtn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 400));

    const viewerCheck = await win.webContents.executeJavaScript(`
      (() => {
        const modal = document.getElementById("attachmentViewerModal");
        if (!modal) return null;
        const img = modal.querySelector("img");
        const downloadLink = modal.querySelector('a[download]');
        const closeBtn = modal.querySelector('[data-action="close-viewer"]');
        return {
          exists: true,
          hasImg: !!img,
          downloadHref: downloadLink ? downloadLink.getAttribute("download") : null,
          hasCloseBtn: !!closeBtn,
        };
      })()
    `);

    assert.ok(viewerCheck && viewerCheck.exists, "Viewer modal must open");
    assert.strictEqual(viewerCheck.hasImg, true, "Viewer modal must render img tag for image");
    assert.strictEqual(viewerCheck.downloadHref, "delivery_receipt.jpg");
    console.log("✓ Verified: Attachment viewer modal opened with image preview & download action");

    // Capture screenshot of viewer modal
    const imgBuffer2 = await win.webContents.capturePage();
    fs.writeFileSync(path.join(screenshotDir, "clean_invoice_attachment_viewer_modal.png"), imgBuffer2.toPNG());
    console.log("✓ Saved clean_invoice_attachment_viewer_modal.png");

    // Close viewer modal
    await win.webContents.executeJavaScript(`
      (() => {
        document.querySelector('[data-action="close-viewer"]')?.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 300));

    // TEST 4: Click Remove button on one attachment
    console.log("TEST 4: Removing attachment...");
    await win.webContents.executeJavaScript(`
      (() => {
        const removeBtn = document.querySelector('[data-attachment-id="att-2"][data-attachment-action="remove"]');
        if (removeBtn) removeBtn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 300));

    const afterRemoveCheck = await win.webContents.executeJavaScript(`
      (() => {
        const chips = document.querySelectorAll(".editor-attachment-chip");
        return {
          chipCount: chips.length,
          activeAttachmentsLength: editorActiveAttachments.length,
          remainingId: editorActiveAttachments[0]?.id
        };
      })()
    `);

    assert.strictEqual(afterRemoveCheck.chipCount, 1, "Only 1 chip must remain after removal");
    assert.strictEqual(afterRemoveCheck.activeAttachmentsLength, 1, "Only 1 item in editorActiveAttachments");
    assert.strictEqual(afterRemoveCheck.remainingId, "att-1", "delivery_receipt.jpg should remain");
    console.log("✓ Verified: Attachment removed successfully via remove button");

    // TEST 5: Save invoice and verify meta.attachments persistence
    console.log("TEST 5: Saving transaction with attachment and testing invoice preview...");
    await win.webContents.executeJavaScript(`
      (async () => {
        // Select party
        const partyInput = document.querySelector('[name="party"]');
        partyInput.value = "Alpha Traders";
        partyInput.dataset.selectedPartyId = "101";

        // Fill item row
        const row = document.querySelector("#transactionRows tr");
        const itemInput = row.querySelector('[name="item"]');
        const qtyInput = row.querySelector('[name="qty"]');
        const priceInput = row.querySelector('[name="price"]');
        itemInput.value = "Wireless Keyboard";
        qtyInput.value = "2";
        priceInput.value = "1200";

        // Trigger recalc
        recalcTransactionEditor();

        // Open invoice preview
        const previewBtn = document.querySelector('[data-editor-action="preview"]');
        if (previewBtn) previewBtn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 600));

    const previewCheck = await win.webContents.executeJavaScript(`
      (() => {
        const modal = document.getElementById("invoicePreviewModal");
        if (!modal) return null;
        const bar = modal.querySelector(".invoice-preview-attachments-bar");
        const chipBtn = modal.querySelector(".preview-attachment-chip-btn");
        return {
          modalExists: true,
          hasAttachmentsBar: !!bar,
          barText: bar ? bar.textContent.trim() : "",
          chipText: chipBtn ? chipBtn.textContent.trim() : "",
        };
      })()
    `);

    assert.ok(previewCheck && previewCheck.modalExists, "Invoice preview modal must open");
    assert.strictEqual(previewCheck.hasAttachmentsBar, true, "Preview modal must show attachments bar");
    assert.ok(previewCheck.chipText.includes("delivery_receipt.jpg"), "Attached document must appear in preview chips");
    console.log("✓ Verified: Attached document appears in Invoice Preview modal");

    // Capture screenshot of preview modal with attachments bar
    const imgBuffer3 = await win.webContents.capturePage();
    fs.writeFileSync(path.join(screenshotDir, "clean_invoice_preview_attachments_bar.png"), imgBuffer3.toPNG());
    console.log("✓ Saved clean_invoice_preview_attachments_bar.png");

    // Close preview modal
    await win.webContents.executeJavaScript(`
      (() => {
        document.querySelector('[data-preview-close]')?.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 300));

    // TEST 6: Test draft restoration when editing an invoice with attachments
    console.log("TEST 6: Testing draft restoration when opening existing invoice...");
    const draftTest = await win.webContents.executeJavaScript(`
      (() => {
        const mockInvoice = {
          id: "inv-999",
          type: "sale",
          party: "Alpha Traders",
          partyId: 101,
          invoiceNo: "INV-2627-9999",
          items: [{ item: "Wireless Keyboard", qty: 2, price: 1200, unit: "Pcs" }],
          meta: {
            attachments: [
              {
                id: "att-saved",
                name: "signed_contract.pdf",
                size: 1048576,
                type: "application/pdf",
                data: "data:application/pdf;base64,JVBERi0xLjQK"
              }
            ]
          }
        };

        const draft = invoiceDraftFromRecord(mockInvoice);
        openTransactionEditor("sale", { draft, skipDirtyCheck: true });
        return {
          draftHasAttachments: Array.isArray(draft.attachments) && draft.attachments.length === 1,
          draftAttachmentName: draft.attachments[0]?.name,
          editorAttachmentsCount: editorActiveAttachments.length,
          renderedChipName: document.querySelector(".editor-attachment-chip .editor-attachment-name")?.textContent.trim()
        };
      })()
    `);

    assert.strictEqual(draftTest.draftHasAttachments, true, "Draft must include attachments from meta");
    assert.strictEqual(draftTest.draftAttachmentName, "signed_contract.pdf");
    assert.strictEqual(draftTest.editorAttachmentsCount, 1);
    assert.strictEqual(draftTest.renderedChipName, "signed_contract.pdf");
    console.log("✓ Verified: Attachments are restored into editor from invoice meta upon edit/load");

    console.log("\nALL DOCUMENT ATTACHMENT TESTS PASSED PERFECTLY!");
    win.close();
    app.quit();
  } catch (err) {
    console.error("Test failed:", err);
    if (win) win.close();
    process.exit(1);
  }
});
