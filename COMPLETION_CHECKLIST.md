# GI Billing completion checklist

Last audited: 2026-08-11

Status key: `[x]` complete, `[~]` partly implemented or needs verification, `[ ]` not implemented.

## Audit summary

- The desktop app is Electron with a single renderer (`index.html`, `app.js`, `styles.css`) and an IPC bridge (`preload.js`, `main.js`).
- The persistent desktop database is a `sql.js` SQLite file named `gi-billing.sqlite` under Electron's `userData` directory.
- The core schema already includes companies, parties, items, units, item categories, bank accounts, transactions, invoices, invoice items, estimates, credit notes, payments, stock movements, ledger entries, and app settings.
- `tax_entries` does not exist. GST values are stored on invoice headers and lines, while ledger posting currently puts the full tax-inclusive invoice amount into Sales/Purchases instead of separating taxable value and GST accounts.
- The renderer still contains a full-state `localStorage` fallback when the SQLite IPC bridge is absent. Draft invoices and held POS orders also use `localStorage`; those are temporary UI state, not accounting records. Remove the full-state fallback before declaring SQLite the only data layer.
- Invoice creation, payment, cancellation, and deletion previously ran as several independent writes. Sale/purchase invoice mutations are now wrapped atomically, but the same transaction boundary must be applied to estimates, credit notes, expenses, and master-data writes.
- Reports are primarily calculated from renderer state. They need reconciliation tests against ledger, stock, and tax postings before they can be treated as accounting reports.

## Phase 1 - Stabilize core app

- [x] Electron single-instance lock exists.
- [~] Window restores/focuses on first launch and from tray; verify on packaged Windows build.
- [~] Startup maximizes the window; decide whether true Electron fullscreen is required instead of maximized mode.
- [x] Close-to-tray background behavior and explicit Quit action exist.
- [x] Fixed customer/phone lookup crash caused by an undefined positioning variable.
- [ ] Run a page-by-page layout audit for duplicate headers, blank top space, and nested scroll containers.
- [ ] Consolidate pages on one header/content/scroll layout system.
- [ ] Remove authoritative full-state `localStorage` fallback; keep only disposable drafts/held orders if desired.
- [ ] Add packaged-app smoke test: first focus, typing, minimize/restore, second instance, tray restore, quit.

## Phase 2 - Master data

### Parties

- [~] Add and edit exist; confirm delete behavior and linked-record protection.
- [x] Customer/supplier/both roles, GST status, GSTIN, PAN, state, phone, addresses, opening balance, credit settings, and terms exist.
- [x] Name/phone lookup exists in billing.
- [~] Party overview and statement views exist; reconcile balances with ledger entries.
- [ ] Store `party_id` on invoices/transactions/ledger-facing records instead of relying on mutable party names.

### Items

- [~] Add and edit exist; confirm delete behavior and linked-record protection.
- [x] Item type, SKU, category, unit, HSN/SAC, GST rate, sale price, purchase price, opening stock, and low-stock fields exist.
- [x] Stock movements and current-stock calculation exist.
- [x] Billing now resolves existing item IDs without silently creating or changing item masters.
- [x] Sale save now blocks quantities above available product stock; service items are exempt.
- [ ] Store category/unit IDs instead of free-text names on items and invoice lines.

### Settings

- [~] Business identity, GST/PAN/state, bank details, invoice prefix/start number, terms, and custom fields exist.
- [ ] Verify every setting persists per company; `app_settings` is currently keyed globally and needs a company scope review.
- [ ] Add invoice-number uniqueness constraint per company/type and a race-safe sequence table.

## Phase 3 - Billing workflow

### Sale invoice - current priority

- [x] Fullscreen editor view exists.
- [x] Existing customer selection is required for paid, credit, B2B, and B2C invoices; inline add-customer remains available.
- [x] Existing item selection is required; inline add-item remains available.
- [x] Paid/credit, B2B/B2C, GST split, preview, save, print preview, edit, payment, cancel, and delete actions exist.
- [x] Sale create/edit/payment/cancel/delete database operations are atomic.
- [x] Cancelling an unpaid invoice removes its stock and ledger posting; invoices with recorded payments must be reversed/refunded first.
- [ ] Add explicit Draft status and prevent draft stock/accounting posting.
- [ ] Add durable PDF export and share integration/placeholder.
- [ ] Replace name linkage with `party_id` everywhere.
- [ ] Add cancellation/reversal journal records instead of only removing active postings.
- [ ] Add immutable audit history for edits, status changes, payments, and deletes.
- [ ] Split sale ledger posting into taxable sales plus Output CGST/SGST/IGST/Cess.
- [ ] Add and populate `tax_entries` for GSTR reporting.

### Purchase bill

- [~] Uses the shared invoice editor and posting flow; supplier bill reference is available as a custom field.
- [x] Stock-in movement and payment status exist.
- [ ] Add a first-class supplier invoice number column with uniqueness rules.
- [ ] Complete purchase-specific input GST and Accounts Payable posting tests.
- [ ] Apply the sale acceptance suite to purchase bills.

### Estimate / quotation

- [x] Separate estimate tables and fullscreen editor exist; estimates do not create invoice stock/ledger entries.
- [~] Conversion metadata/status exists; verify one-click conversion and duplicate-conversion protection.

### Sales return / credit note

- [~] Original invoice linkage, credit-note lines, stock-in movement, and statuses exist.
- [ ] Post receivable and GST reversals into the ledger and `tax_entries`.
- [ ] Enforce returned quantity does not exceed original sold quantity minus prior returns.

### Expenses

- [~] Expense category, GST metadata, payment method, and ledger calculation exist.
- [ ] Add durable receipt attachment storage (current attachment handling is not a verified file archive).
- [ ] Add `tax_entries` posting and atomic write boundary.

## Phase 4 - Accounting engine

- [x] `transactions`, `payments`, `stock_movements`, `ledger_entries`, `parties`, `items`, `units`, categories, and settings structures exist.
- [~] `invoice_items` currently serves the requested transaction-line role; decide whether to rename/generalize to `transaction_items`.
- [ ] Create `tax_entries` with source type/id, party, GSTIN, HSN/SAC/slab, taxable value, CGST/SGST/IGST/Cess, date, and reversal link.
- [ ] Separate net sales/purchases from GST control accounts in double-entry posting.
- [ ] Add party control-account/subledger linkage by ID.
- [ ] Add opening-balance journal postings for parties, stock, cash, and banks.
- [ ] Add database constraints for nonnegative amounts, valid quantities, unique invoice numbers, and balanced journals.
- [ ] Add accounting invariants: each posted transaction balances, invoice totals equal lines, payment totals equal received, and stock equals movement history.
- [ ] Apply atomic transactions to every multi-table mutation.

## Phase 5 - GST and reports

- [~] Sale/purchase registers, output/input GST summaries, GST slab/HSN summaries, daybook, party balance, aging, P&L, stock, movements, and bank reports have UI implementations.
- [ ] Drive GST reports from immutable `tax_entries`, not only invoice state.
- [ ] Add GSTR-1 B2B, B2C, credit-note, and document summaries with validation/export.
- [ ] Add GSTR-2/input-tax purchase and expense summaries with ITC eligibility.
- [ ] Reconcile sales, purchase, party ledger, stock, P&L, cash/bank, tax summary, and daybook to the posting engine.
- [ ] Add CSV export and period/company filters consistently.

## Phase 6 - Polish and release

- [~] Printable invoice preview, toasts, confirmations, empty states, shortcuts, and SQLite backup exist.
- [ ] Add verified PDF export, CSV export, and SQLite restore.
- [ ] Add backup integrity check and restore preview before replacement.
- [ ] Add demo-login boundary; document future email OTP integration without coupling it to local accounting data.
- [ ] Package, sign, and run Windows install/upgrade/uninstall tests with database preservation.

## Immediate execution order

1. Finish Sale Invoice accounting: `tax_entries`, GST-separated journal posting, party IDs, draft/reversal/audit behavior, and automated invariants.
2. Apply the same tested posting contract to Purchase Bills, including supplier invoice number and input GST.
3. Rebuild Reports on reconciled ledger, stock, and tax sources.
4. Complete the cross-page layout/scroll audit and packaged Electron stability checks before release.

## Sale Invoice acceptance tests

- [x] Cannot save without selecting an existing customer.
- [x] Cannot save a customer with the wrong party role.
- [ ] Can add a missing customer inline, return to the same invoice, and select it.
- [x] Cannot save an unknown or stale item ID.
- [x] Cannot sell a product below available stock; service items are exempt in backend validation.
- [ ] B2B requires valid GSTIN and correct place-of-supply split.
- [ ] Invoice total equals line taxable values plus tax and discounts/rounding.
- [ ] Ledger debits equal credits and GST is posted separately.
- [ ] Paid, partial, and credit balances agree with payment history.
- [~] Edit replaces line, stock, and current ledger effects atomically without duplicate postings; tax-entry posting is not implemented yet.
- [ ] Cancel reverses stock, receivable, sales, and GST while preserving audit history.
- [ ] Delete requires confirmation and leaves no orphan rows.
- [~] SQLite reopen is covered for invoice status and stock; extend after payment and tax-entry posting are complete.
