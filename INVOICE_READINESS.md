# Sale and purchase readiness audit

Status: not yet cleared for production billing.

## Confirmed fixes

- Invoice edits preserve existing payment rows, IDs, methods, dates and notes.
- Existing payments cannot be silently changed through invoice editing.
- Cancelled invoices cannot be edited back into active postings.
- Sale/purchase document types cannot be switched through editing.
- Explicit zero tax no longer falls back to the catalog tax rate.
- Line quantities, prices, discounts and tax rates receive numeric validation.
- Additional payments reject non-finite amounts and amounts above the balance.

## Automated coverage

The invoice-readiness regression exercises sale and purchase creation, zero-tax
overrides, payment preservation through edits and database reopen, and invalid
line/payment rejection. Existing sale tests exercise stock availability, edit
rollback, cancellation and restart. These are database tests, not UI acceptance.

## Remaining release gates

- Unnamed fully paid B2C sales are supported; credit sales still require a party.
- Tax-inclusive pricing, rounding and displayed-versus-persisted totals: complete
  UI-to-database verification is still required. Normalization currently uses
  tax-exclusive arithmetic.
- Purchase reduction, cancellation and deletion now reject negative resulting stock.
- Deletion of invoices with recorded payments is blocked. A refund/reversal
  workflow remains to be implemented.
- Manual status changes are restricted to cancellation; payment status is derived.
- Saved previews now use invoice customer snapshots and Save & Print selects the
  saved invoice number and totals. Reopened invoices retain their rounding choice.
- Automated Electron checks cover rounding restoration, walk-in reopening,
  preview metadata and PDF generation. Physical print layout and multi-page
  invoices still require visual acceptance testing.
- Automated backup restoration checks compare business totals, counts, payment
  history and SQLite integrity using an isolated restore directory.
- Attachments and complete interactive sale and purchase workflows still require
  acceptance testing.

Cloud sync remains disabled. Passing automated tests does not establish statutory
tax compliance or completion of the release gates above.
