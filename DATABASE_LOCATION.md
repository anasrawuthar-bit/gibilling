# GI Billing Database Location

## Development database

When the project runs with `electron .`, Electron derives `userData` from its application name. With the current `package.json`, the expected Windows path is:

```text
%APPDATA%\gi-billing-software\gi-billing.sqlite
```

Run the read-only runtime diagnostic to print the exact path for the current machine:

```powershell
npm run diagnose:database
```

The diagnostic calculates the development path from the same application name and Windows app-data convention used by Electron. It does not start Electron or GI Billing, initialize SQLite, create directories, or create a database.

## Packaged Windows database

The application uses `app.getPath("userData")` in both development and packaged modes. A packaged build may use a different folder if packaging assigns a different product name or application name.

This repository currently has no Electron Builder/Forge configuration, `productName`, `appId`, installer, or packaged executable. Therefore, a packaged path cannot yet be verified from an artifact. A packaged diagnostic must be included and verified when packaging is introduced.

## Verify that the database exists

In Windows Explorer, enter this in the address bar:

```text
%APPDATA%\gi-billing-software
```

Or use PowerShell:

```powershell
Test-Path "$env:APPDATA\gi-billing-software\gi-billing.sqlite"
```

Do not run the main application merely to create an empty database for migration analysis.

## Safely copy an existing database

1. Exit GI Billing completely, including its tray icon.
2. Confirm no GI Billing process remains in Task Manager.
3. Copy `gi-billing.sqlite` to a separate audit folder.
4. Keep the original file unchanged.
5. Run audits against the copy when practical.

Do not copy an actively written database and do not edit the original with a SQLite tool.

## Read-only audit

Run the data-integrity audit with an explicit path:

```powershell
npm run audit:data-integrity -- "FULL_PATH_TO_DATABASE" --json
```

Run the Phase 1 readiness assessment with:

```powershell
npm run audit:migration-readiness -- "FULL_PATH_TO_DATABASE"
```

Both commands calculate SHA-256, size, and modification time before and after inspection and fail if the file changes.

## Overrides and backups

The production application currently supports no environment-variable, command-line, portable-mode, or configuration-file database-path override.

User-created backups default to the Documents folder only after an explicit save-dialog selection. Pre-migration backups, when a future migration is pending, are stored under:

```text
<userData>\migration-backups
```
