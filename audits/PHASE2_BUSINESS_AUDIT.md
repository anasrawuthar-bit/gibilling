# Phase 2 business application audit

Date: 2026-09-19. Status: IN PROGRESS; not production sign-off.

## Regression gate

Before application changes, `npm test` passed all 13 configured suites, including
25 Phase 1 accounting cases and the 18-step runtime integrity audit. The audit
used a newly seeded temporary database, not the user's live company database.
SQLite integrity and foreign-key checks passed, orphan checks passed, restart
preserved the records, and ledger debits and credits were both 17744.00.
The same suite passed after the database changes in this phase.

`tests/phase2-workflows.test.js` additionally verifies payment allocation input
validation, mixed-party rejection, full payment amount preservation across
allocation and advance rows, invalid stock adjustments, non-posting operational
documents, single conversion, rollback of repeat conversion, and restart.

`tests/business-ui-audit.js` records rendered controls and registered listeners in
an isolated Electron session. See `phase2-action-inventory.json` and
`phase2-action-matrix.md`. A render pass or a registered callback is NOT evidence
of correct business behavior, error handling, or persistence. Such columns remain
UNVERIFIED until a corresponding action test exists. This is not yet an exhaustive
click-through certification of every possible conditional control.

## Current foundation

| Feature | Status | Current evidence / limits |
|---|---|---|
| Payment-In | PARTIALLY IMPLEMENTED | `recordPaymentIn`, payments and ledger posting; new validation and UI handlers. Allocation rows are split without a durable receipt-header identity. |
| Payment-Out | PARTIALLY IMPLEMENTED | `recordPaymentOut`; missing create-button handler fixed. Same receipt-header limitation. |
| Credit notes | IMPLEMENTED | `createCreditNote`, journal unification, stock/tax entries; Phase 1 tests. Entire UI lifecycle remains unverified. |
| Debit notes | IMPLEMENTED | `createDebitNote`, linked journal/stock/tax entries; Phase 1 and debit-note tests. |
| Expense GST | IMPLEMENTED | `postExpenseTaxEntries`, financial mutation transaction, Phase 1 reconciliation. |
| GST reporting | PARTIALLY IMPLEMENTED | Tax records and rendered GSTR screens exist. Date filters, every return/export scenario, and filing suitability are not certified. |
| P&L | PARTIALLY IMPLEMENTED | Renderer crashed on undefined `roundMoney`; fixed. Revenue/cost inputs now exclude separately recorded GST. Full period costing not complete. |
| COGS | PARTIALLY IMPLEMENTED | Weighted-average foundation exists; dated inventory boundaries and all return/adjustment valuation paths need reconciliation. |
| Cancelled invoices | IMPLEMENTED | Core exclusion and reversal tested; not a claim about every independent UI report. |
| Foreign-key enforcement | IMPLEMENTED | Connection PRAGMA plus runtime FK checks, schema 6. |
| Transaction atomicity | PARTIALLY IMPLEMENTED | Financial mutation wrappers exist and regressions pass. Every nonfinancial mutation/failure path not certified. Item updates now wrapped. |
| localStorage | PARTIALLY IMPLEMENTED | Desktop authoritative state comes from SQLite. Transaction drafts and POS holds still use localStorage. Browser-preview fallback differs from desktop. |

## Workflow trace inventory

All IPC names below use the explicit methods in `preload.js`, registered in
`main.js`. `database.js` supplies the business logic and persistence; no separate
application service exists for most local workflows. UI state refresh generally
uses the returned `getState()` snapshot. N/A means a workflow should not post
that kind of financial record, not that the workflow is missing.

| Workflow | UI / validation | IPC / business function / database | Accounting / inventory / tax | Feedback and remaining status |
|---|---|---|---|---|
| Company management | Company modal, required profile | createCompany/updateCompanyProfile/deleteCompany; companies/company_settings | Company scope; deletion sensitive | Refresh exists; permissions missing; PARTIALLY IMPLEMENTED |
| Customers / parties | Entry form, name/contact validation | createParty/updateParty; parties | Opening balances affect reports; master edits | PARTIALLY IMPLEMENTED; all historical/custom-field paths need tests |
| Suppliers | Same form, supplier role | Same party functions | Supplier direction enforced in payments | PARTIALLY IMPLEMENTED |
| Products / items | Item form, prices/unit/category | createItem/updateItem; items | Opening stock; master price defaults | Existing opening-stock changes now rejected in favor of adjustments; PARTIALLY IMPLEMENTED |
| Units | Item master create/edit | createUnit/updateUnit; units | N/A; item unit references | Persisted and sync outbox tests; IMPLEMENTED for current surface |
| Categories | Master create/edit | createItemCategory/updateItemCategory | N/A | Persisted; IMPLEMENTED for current surface |
| Sales | Invoice editor, party/item/payment validation | createTransaction/updateInvoice; transactions/invoices/invoice_items | Ledger, stock out, output tax | Save/reopen tests; full click-through UNVERIFIED |
| Purchases | Purchase editor, supplier/item validation | Same invoice functions with purchase type | Ledger, stock in, input tax | Tests pass; full click-through UNVERIFIED |
| Estimates | Document editor | createEstimate/updateEstimate; estimates/estimate_items | No accounting/stock/tax posting until conversion | Filtering by document type fixed; PARTIALLY IMPLEMENTED |
| Proforma | Previously undefined page function | Existing estimates with document_type=proforma | Non-posting | Route repaired; PARTIALLY IMPLEMENTED |
| Sales orders | Previously misleading invoice page | estimates with document_type=sale_order | Non-posting | Own list/editor connected; PARTIALLY IMPLEMENTED |
| Delivery challans | Previously misleading invoice page | estimates with document_type=delivery_challan | Currently non-posting; dispatch ownership needs specification | Own list/editor connected; PARTIALLY IMPLEMENTED |
| Purchase orders | Previously placeholder page | estimates with document_type=purchase_order | Non-posting; converts to purchase | Own list/editor connected; PARTIALLY IMPLEMENTED |
| Sales returns | Return editor and list | Credit-note CRUD; credit_notes/credit_note_items | Unified transactions, ledger, stock in, tax reversal | Existing tests; PARTIALLY IMPLEMENTED UI acceptance |
| Purchase returns | Debit-note editor/list | Debit-note CRUD; debit_notes/debit_note_items | Unified transactions, ledger, stock out, tax reversal | Existing tests; PARTIALLY IMPLEMENTED UI acceptance |
| Payment-In | Modal; new create/empty-state handlers | recordPaymentIn; payments/transactions | Allocations, receivable, cash/bank ledger | Amount/party checks strengthened; PARTIALLY IMPLEMENTED |
| Payment-Out | Modal; previously missing handler | recordPaymentOut | Allocations, payable, cash/bank ledger | Same checks; PARTIALLY IMPLEMENTED |
| Expenses | Expense form, value/tax validation | createTransaction/updateTransaction with expense metadata | Ledger and tax_entries | Tests exist; all payment transitions UNVERIFIED |
| POS | Search/category/cart, completion | createTransaction | Invoice, ledger, stock, tax | Hold uses localStorage; scanner/failure/receipt acceptance UNVERIFIED |
| Cash & bank | Account form, defaults, list | Bank-account CRUD; bank_accounts/settings | Ledger method strings; no complete bank reconciliation | Empty-state handler fixed; PARTIALLY IMPLEMENTED |
| Inventory | Items, item ledger, stock adjustment modal | recordStockAdjustment; stock_movements/audit_log | Signed movement; no full inventory journal integration | Direction/finite values/negative stock guards added; PARTIALLY IMPLEMENTED |
| Reports | Report selector/table/search/export/print | Primarily renderer calculations from SQLite snapshot | Some totals independently assembled in renderer | P&L crash fixed; period/report reconciliation remains PARTIALLY IMPLEMENTED |
| GST | GSTR-1/2 and liability screens | getTaxEntries plus snapshot data | tax_entries and return/expense records | PARTIALLY IMPLEMENTED, not filing sign-off |
| Backup & restore | Native file dialog + restore confirmation | backupTo/restoreBackup | All SQLite entities, pre-restore backup, migration validation | Recovery suite passes; UI cancellation/failure UNVERIFIED |
| Import / export | CSV preview/import; report/item export | Per-row createItem/createParty | Imports can affect opening balances/stock | Partial-row errors; malformed CSV/formula handling needs work |
| Settings | Business profile and custom fields | updateBusinessSettings; company_settings | Changes used by invoice defaults | Fake tabs hidden; restart behavior of every field UNVERIFIED |
| Printing | Preview modal and native print | window.print / Electron | Read-only presentation | Physical printer, thermal widths, long invoices UNVERIFIED |
| PDF | Dedicated export button | giApp.exportPdf -> app:export-pdf -> printToPDF | No posting | Existing native export; inline styles corrected and hidden window restricted; full export-dialog test UNVERIFIED |

## Document lifecycle

| Document | Entity / numbering | Create / view / edit / duplicate | Print / PDF | Cancel / delete / status | Search / filters / relationships / conversion |
|---|---|---|---|---|---|
| Sale invoice | invoices + sequences | Present | Present, hardware UNVERIFIED | Present, payment/history safeguards require broad review | Present; party/item links; audit coverage partial |
| Purchase bill | invoices + sequences | Present | Present | Present | Present; audit coverage partial |
| Estimate | estimates + sequences | Present | Present | Present | Type-scoped list; conversion now atomic with invoice save |
| Proforma | estimates, proforma | Connected this phase | Shared preview/PDF | Shared lifecycle | Own type list; direct invoice conversion |
| Sale order | estimates, sale_order | Connected this phase | Shared preview/PDF | Shared lifecycle | Direct invoice conversion; multi-stage chain not implemented |
| Delivery challan | estimates, delivery_challan | Connected this phase | Shared preview/PDF | Shared lifecycle | No physical dispatch/fulfilment allocation yet |
| Purchase order | estimates, purchase_order | Connected this phase | Shared preview/PDF | Shared lifecycle | Direct purchase conversion |
| Credit note | credit_notes + sequences | Present | Shared preview | Present | Original invoice reference; full return quantity caps UNVERIFIED |
| Debit note | debit_notes + sequences | Present | Shared preview | Present | Original purchase reference; full return quantity caps UNVERIFIED |

Opening a conversion no longer updates the source status. Saving the resulting
invoice validates company/party/direction and source availability, posts once,
updates the source link/status and audit record in the same transaction. A second
conversion is rejected. Quotation -> order -> challan -> invoice chains, partial
conversions, and conversion-aware deletion remain open design/implementation work.

## Payment and inventory gaps

The new tests cover partial allocation plus advance in both directions, invalid
and duplicate allocations, and a mixed-party request without an explicitly
selected party. Full cash amount is preserved by the sum of payment rows; however,
a durable receipt header with original amount and child allocations is still
needed for receipt identity, reallocation, cancellation and audit completeness.
Repeated payment submission also needs a persisted request idempotency key.

Stock adjustment already existed: reason, direction, quantity, cost, date, notes,
movement and audit log. Invalid directions and non-finite/negative values now
fail, reductions obey available stock, and existing item opening stock cannot be
silently edited. Initial item creation remains a master opening balance, not an
adjustment journal. Adjustment ledger value, stock take sessions, dated valuation,
and purchase/sales-return cost ownership need further work.

## Computer-shop extension design

| Capability | Safe direction; no automatic implementation in this phase |
|---|---|
| Serial / IMEI | Separate item_instances table with company/item FK and unique normalized identifier per company; receive/sell/return links to lines and movements |
| Warranty | Dates and policy captured per sold instance/line; do not mutate generic product master for customer warranty |
| Supplier / cost | Purchase-line and instance provenance; retain original purchase cost separately from current catalog price |
| Condition | Instance-level new/used/refurbished enum; optional separate SKU when pricing or stock pools differ |
| Accessories | Ordinary items or explicit bundle-component relationships with stock posting rules |
| Service items | Existing item_type=service; no quantity stock adjustment; service warranty is a separate optional policy |

## Report center review

| Report | Current status and unresolved requirements |
|---|---|
| Sales / purchase registers | IMPLEMENTED list/source; date controls in invoice workspace; report-center period/search/export semantics not fully reconciled |
| Sales / purchase returns | Return lists implemented; dedicated period report and complete export UNVERIFIED |
| Party ledger | Renderer table exists; stable party-ID matching and advances require full reconciliation |
| Receivables / payables | Invoice aging exists; advance/net-position reconciliation distinct from invoice aging |
| Cash / bank book | Ledger report exists; bank-account identity/reconciliation partial |
| Expense report | Expense list/tax entries exist; date/export/payment treatment not fully certified |
| Stock summary / item ledger | Existing snapshot/movement reports; valuation and range boundaries partial |
| Trial balance | Renders ledger account balances; runtime debit-credit equality proven; date filtering incomplete |
| P&L / COGS | Crash fixed and GST excluded from revenue/cost inputs; periodic costing remains incomplete |
| Balance sheet | MISSING as a complete report with assets/liabilities/equity mapping and retained earnings |
| GST reports | Foundation tested; comprehensive slab/return/expense/cancelled/date reconciliation incomplete |

Inert report date buttons were removed and all-date scope is now explicit.
Period filters must be implemented against authoritative source dates, including
opening/closing inventory and ledger balances. Merely hiding controls does not
complete the requested report requirements. Trial-balance equality alone does
not prove Assets = Liabilities + Equity with correct classifications.

## Settings, printing and POS

Non-persistent settings checkboxes (including advertised passcode, serial/batch,
thermal and message options) are hidden. Invoice settings opens real company
settings instead of a fake prefix-save drawer. Business profile and custom-field
controls remain. Preview-only share/e-Invoice actions were removed; no cloud sync
was enabled. Accountant Access was relabeled/routed to actual reports, not login.

Native PDF export exists separately from Print -> Save as PDF. It now embeds
loaded CSS, validates input size, and disables scripting/network resources in its
hidden renderer. A4 output, preview and test PDF generation exist. 58mm/80mm,
physical printer selection/unavailability, page breaks, logo/UPI correctness,
large documents and dialog cancellation still need end-to-end tests.

POS has search/category/cart/quantity/discount/tax/customer/payment/change and
hold/resume code. Held carts are browser-local drafts. Hardware barcode input,
simultaneous completion, crash recovery and saved-number-before-print require
dedicated acceptance cases; no claim of completion is made from page rendering.

## Minimum Windows security design

Current desktop is a local single-operator application with a context-isolated
preload API. There is no complete user-role/permission system. Use Windows account
and filesystem permissions as the current boundary; local database/backups are
not encrypted. A fake passcode checkbox is no longer exposed.

Before adding staff access: persist users/roles, hash credentials with a supported
password KDF, authorize sensitive operations in main/backend (not only the UI),
audit actor/reason for delete/cancel/restore/export, and design recovery. Scope
cashier permissions separately from owner/accountant. Keep credentials out of
renderer state and logs. No complex multi-user/cloud architecture was introduced.
Sender validation for every IPC and a full sensitive-log review remain UNVERIFIED.

## Failure coverage and remaining work

| Scenario | Evidence / status |
|---|---|
| Invalid party/product/payment | Backend regression coverage, including new allocation validation |
| Insufficient stock | Sale/purchase safeguards and new adjustment rejection tests |
| Corrupt/invalid backup and restore | Existing recovery suite; pre-restore safety backup and restart covered |
| Invalid CSV/PDF input | UI paths exist; robust parsing and native-dialog failure coverage incomplete |
| Disk full / write failure | Atomic-write/recovery foundation; every application action under disk exhaustion UNVERIFIED |
| Database locked / concurrent process | sql.js in-memory database plus filesystem persistence; classic SQLite lock test is not sufficient; multi-process writes need investigation |
| Printer unavailable | UNVERIFIED against physical printer and cancellation/error callbacks |
| Invalid tax configuration | Numeric/master checks exist; comprehensive configuration matrix incomplete |

Next release gates: durable payment receipt identity/idempotency; period-correct
reporting and balance sheet; adjustment/return valuation reconciliation; conversion
retention and partial fulfilment; production-grade CSV/PDF imports; every remaining
conditional action and loading/error state; thermal/long-document print acceptance;
POS failure tests; authorization design and IPC verification. This audit and its
fixes do not complete all 16 requested phases.
