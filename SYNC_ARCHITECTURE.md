# GI Billing Offline/Online Sync Architecture

## 1. Objective

GI Billing remains fully usable offline. All user workflows read from and write to the local SQLite database first. A background sync engine exchanges durable changes with a cloud API whenever connectivity and authentication are available.

The cloud must never become a direct dependency of invoice entry, printing, POS, inventory lookup, or local reporting.

## 2. Current Readiness

The current Electron application has a clear renderer-to-IPC-to-database boundary and versioned migrations. Those are useful foundations.

The following currently block safe synchronization:

- Most business IDs are local integers or timestamp-derived strings.
- Party relationships still depend on mutable names.
- Invoice numbering is count-based.
- Business settings are globally keyed rather than company-scoped.
- Several mutations are not represented as immutable business events.
- `sql.js` persists by exporting the complete database file.
- No authenticated user, device, tenant membership, or sync cursor exists.
- Deletes and cancellations are not consistently represented as durable reversals/tombstones.

Phase 1 data-integrity work must precede production synchronization.

## 3. Target Runtime

```text
Electron renderer
    -> validated preload IPC
    -> application services
    -> local SQLite repositories
    -> local transaction + sync outbox
    -> background sync worker
    -> authenticated HTTPS API
    -> cloud application services
    -> PostgreSQL
```

The UI never writes to the cloud directly. The cloud never replaces the local database during normal operation.

## 4. Identity and Ownership

Every synchronized record must contain:

| Field | Purpose |
| --- | --- |
| `id` | Globally unique UUID generated before local insertion |
| `company_id` | Tenant boundary |
| `created_at` | Original creation timestamp in UTC |
| `updated_at` | Last accepted mutation timestamp in UTC |
| `version` | Monotonically increasing record version |
| `origin_device_id` | Device that originally created the record |
| `deleted_at` | Nullable deletion tombstone |

Every installation receives a UUID `device_id`. A device registration belongs to an authenticated user and company membership in the cloud.

Existing integer IDs remain available during a compatibility period. New UUID columns are nullable until deterministic migration and validation have completed.

## 5. Entity Classification

### Synchronized master data

- Companies and company settings
- Parties
- Items
- Units and categories
- Bank/payment-method metadata

Masters may be edited, but updates require version checks. Conflicting edits must not silently overwrite tax identities, opening balances, or credit terms.

### Synchronized documents

- Invoices and invoice lines
- Estimates and estimate lines
- Credit notes and credit-note lines
- Payments
- Expenses

Draft documents may be revised. Posted financial documents become immutable. Corrections create explicit revisions, cancellation records, credit notes, refunds, or reversals.

### Append-only operational records

- Stock movements
- Payment events
- Accounting postings when introduced
- Tax postings when introduced
- Audit events

Append-only records are never merged through last-write-wins.

### Device-local data

- Unsaved form state
- Held POS carts until explicitly promoted to a shared draft
- Window/layout preferences
- Cached search indexes
- Sync diagnostic logs

## 6. Local Sync Tables

### `sync_devices`

```text
id TEXT PRIMARY KEY
display_name TEXT NOT NULL
installation_id TEXT NOT NULL UNIQUE
registered_at TEXT
last_sync_at TEXT
created_at TEXT NOT NULL
```

Authentication tokens must use operating-system secure storage, not this table.

### `sync_outbox`

```text
id TEXT PRIMARY KEY
company_id TEXT NOT NULL
device_id TEXT NOT NULL
entity_type TEXT NOT NULL
entity_id TEXT NOT NULL
operation TEXT NOT NULL
base_version INTEGER
payload_json TEXT NOT NULL
idempotency_key TEXT NOT NULL UNIQUE
status TEXT NOT NULL
attempt_count INTEGER NOT NULL DEFAULT 0
next_attempt_at TEXT
created_at TEXT NOT NULL
acknowledged_at TEXT
last_error_code TEXT
```

Allowed states: `pending`, `uploading`, `acknowledged`, `retry`, `conflict`, `rejected`.

The business mutation and its outbox insertion must commit in the same SQLite transaction.

### `sync_cursors`

```text
company_id TEXT PRIMARY KEY
pull_cursor TEXT
updated_at TEXT NOT NULL
```

### `sync_inbox`

```text
event_id TEXT PRIMARY KEY
company_id TEXT NOT NULL
entity_type TEXT NOT NULL
entity_id TEXT NOT NULL
server_version INTEGER NOT NULL
applied_at TEXT NOT NULL
```

The inbox prevents downloaded events from being applied twice.

### `sync_conflicts`

```text
id TEXT PRIMARY KEY
company_id TEXT NOT NULL
entity_type TEXT NOT NULL
entity_id TEXT NOT NULL
local_version INTEGER
server_version INTEGER
local_payload_json TEXT
server_payload_json TEXT
status TEXT NOT NULL
created_at TEXT NOT NULL
resolved_at TEXT
resolution TEXT
```

## 7. Cloud Contract

### Device registration

```http
POST /v1/devices/register
```

Associates a device with the authenticated user and an authorized company.

### Push

```http
POST /v1/sync/push
```

The request contains a bounded batch of outbox events. Each event includes an idempotency key, entity identity, operation, base version, and payload.

The response classifies each event as accepted, already applied, conflicted, rejected, or retryable. A network retry with the same idempotency key must never duplicate a financial operation.

### Pull

```http
GET /v1/sync/pull?company_id=...&cursor=...&limit=...
```

The response contains ordered changes and a new opaque cursor. Local application and cursor advancement occur in one transaction.

### Status

```http
GET /v1/sync/status?company_id=...
```

Returns server time, membership state, device state, and the latest available cursor without exposing business data.

## 8. Conflict Rules

| Entity/action | Rule |
| --- | --- |
| Party/item ordinary fields | Version check; manual resolution when both sides changed |
| GSTIN, tax type, opening balance | Never automatic last-write-wins |
| Draft document | Version check; conflict creates two inspectable revisions |
| Posted invoice | Immutable; reject edits and require revision/reversal workflow |
| Payment | Append-only and idempotent |
| Stock movement | Append-only and idempotent |
| Cancellation | Append-only status/reversal event |
| Delete | Tombstone with version check |
| Company settings | Version check; tax and numbering fields require explicit resolution |

Device clocks are diagnostic only. Server versions and cursors determine ordering; client timestamps do not resolve conflicts.

## 9. Invoice Numbering

UUID document identity and human invoice number are separate concepts.

For single-device offline operation, numbering can use a server-issued allocation block per company, document type, financial year, and prefix. Each block contains a start, end, and allocation ID. The device records consumption locally in the invoice transaction.

Alternative device-coded sequences may be used only if accepted by product and accounting requirements. The cloud enforces uniqueness for:

```text
(company_id, document_type, financial_year, prefix, sequence_number)
```

Cancellation never releases a number. A failed local transaction does not consume a number. A posted, synchronized number is never changed automatically.

## 10. Sync State Machine

```text
local mutation
  -> commit business rows and outbox event
  -> pending
  -> uploading
  -> acknowledged
```

Failure branches:

```text
temporary network/server failure -> retry with bounded backoff
version mismatch -> conflict
validation/permission failure -> rejected
expired authentication -> pending until re-authenticated
```

Crashes while `uploading` return the event to retry. Idempotency guarantees make this safe.

## 11. Security Boundary

- TLS is mandatory.
- Cloud authorization is company-scoped for every request and row.
- IPC inputs remain validated locally.
- Refresh/access tokens use Windows Credential Manager or equivalent secure storage.
- Sync payloads and logs must not contain secrets.
- Sensitive diagnostic values are masked.
- Backups remain independent of synchronization.
- Remote deletion cannot silently erase immutable financial history.

## 12. Rollout Plan

### Stage 0: Data integrity prerequisites

Complete party IDs, company-scoped settings, durable numbering, historical snapshots, and migration validation.

### Stage 1: Local-only sync foundation

Add UUID compatibility fields, device identity, outbox, inbox, cursor, and conflict tables. Introduce a disabled sync service and a fake adapter. No network dependency.

### Stage 2: Service boundary

Move one low-risk master-data mutation, such as creating a unit/category, through an application service that writes business data and outbox atomically.

### Stage 3: Master-data cloud pilot

Synchronize units, categories, parties, and items in a test environment. Do not synchronize financial documents yet.

### Stage 4: Draft documents

Synchronize draft quotations and draft invoices with explicit conflict handling.

### Stage 5: Posted financial events

Synchronize immutable invoices, payments, stock movements, cancellations, and future journal/tax entries after accounting invariants are complete.

### Stage 6: Production operations

Add monitoring, device management, key rotation, retention, disaster recovery, compatibility enforcement, and staged updates.

## 13. Required Tests

- Local save succeeds with no network.
- Business row and outbox event commit or roll back together.
- Retried push does not duplicate records.
- Repeated pull does not reapply events.
- Cursor advances only after local commit.
- Two-device master edits create a visible conflict.
- Posted invoice mutation is rejected.
- Payment and stock events remain append-only.
- Company A cannot push or pull Company B data.
- Crash during upload resumes safely.
- Authentication expiry does not lose pending events.
- Migration/reopen preserves all existing records and outbox state.
- Large pending queues do not block invoice entry.

## 14. First Implementable Slice

Implementation status: the local service is wired into Electron but disabled. No
cloud endpoint, authentication flow, or production transport is configured.
The current pull contract accepts unit/category upserts only; deletes and other
entity types reject the page without advancing its cursor. Sync cycles capture
the company at their start. Startup recovers interrupted uploads, missing push
acknowledgements become retries, and open conflicts prevent further uploads for
the affected entity. Conflict resolution UI and initial master-data bootstrap
remain prerequisites for a cloud pilot.

Before cloud development, complete Phase 1 data integrity against a verified real database. Then implement a versioned local-only migration containing `device_id`, nullable sync UUIDs, `sync_outbox`, `sync_inbox`, `sync_cursors`, and `sync_conflicts`.

The first mutation placed behind the outbox should be a low-risk master operation. Invoice, payment, stock, GST, and accounting synchronization remain disabled until idempotency and conflict tests pass.
