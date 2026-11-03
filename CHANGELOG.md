# Changelog

All notable changes to **GI Billing Software** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) (`MAJOR.MINOR.PATCH`).

---

## [Version Management Policy]

- **MAJOR version (`X.0.0`)**: Incompatible changes, breaking database schema migrations, or fundamentally restructured accounting architecture.
- **MINOR version (`1.X.0`)**: Substantial new business features, regulatory reports, UI workflows, or non-breaking database schema enhancements.
- **PATCH version (`1.1.X`)**: Backward-compatible bug fixes, UI styling refinements, input validation fixes, and performance optimizations.

### Database Versioning & Safe Migrations
Database schema versioning is managed independently via SQLite `schema_migrations` tracking:
- Target Schema Version: **Version 9**
- Automatic pre-migration database snapshot creation before every schema update.
- Backward-compatible column additions and migration sanity integrity audits.

---

## [1.1.0] - 2026-11-03

### Added
- **GST & Compliance Overhaul**:
  - Comprehensive GSTR-1, GSTR-3B, and HSN Summary reporting engine.
  - Inward and outward GST Tax liability breakdown (CGST / SGST / IGST).
  - GSTIN verification rules with state-code validation and public format checks.
- **Double-Entry Journal & Ledger**:
  - Full double-entry Journal Voucher creation with balanced debit/credit line checks.
  - Chart of Accounts integration across bank accounts, party ledgers, and expense ledgers.
- **Thermal POS & Barcode Label Generator**:
  - Fast retail POS billing interface with instant thermal receipt generation (80mm and 58mm).
  - Barcode label designer and Code128 generator for single and bulk item printing.
- **Multi-Address Management**:
  - Support for multiple shipping and billing addresses per party.
  - Real-time address synchronization on invoice selection.
- **Enhanced Units & Category Hierarchy**:
  - Dynamic master management for measurement units with decimal quantities toggle.
  - Multi-level nested category and subcategory hierarchy.
- **System Backups & Snapshots**:
  - Integrated local snapshot backup engine with recovery and preview verification.
  - Automatic backup trigger on application exit.
- **About & Version Management View**:
  - Dedicated "About & Version" panel in Settings displaying active build details, platform runtime, and SemVer policy.

### Changed
- **Placeholder Cleanup**:
  - Replaced all demo/example placeholders (e.g. `e.g. Acme Enterprises`, `29AAAAA0000A1Z5`, `Building, Street, Area`, etc.) across all forms with clean, canonical field labels.
- **Navigation & Layout Reorganization**:
  - Relocated `Sync & Backup` from root sidebar into the `Utilities` submenu.
  - Removed redundant `Data Safety & Backup` KPI card from Dashboard view.
  - Improved `#companyModal` (Create Business Profile) header styling, icon badge, subtitle, and close button alignment.
  - Auto-collapsing sidebar logic on wide report and settings pages for maximum workspace focus.
- **Database Engine**:
  - Upgraded database migration suite to Schema Version 9 (`gst_compliance_and_journal_tables`).

### Fixed
- Payment-in customer selection combobox toggle and dropdown alignment.
- Duplicate invoice number collision handling with descriptive warnings.
- Fixed party transaction filtering and stock valuation ledger integrity.

---

## [1.0.0] - 2026-09-21

### Added
- Initial enterprise desktop release of GI Billing Software.
- Core Sales Invoices, Purchase Bills, Quotations, and Estimate generation.
- Party Ledger (Customers and Suppliers) management.
- Inventory tracking with low stock alerts and opening stock valuation.
- Multi-company workspace support with individual SQLite database isolation.
- Offline desktop support via Electron and local-first architecture.
