# Cloud Integration & Synchronization Architecture Specification
## ZynBill Multi-Tenant Cloud Ecosystem & Hybrid Offline Desktop Sync

Please see the comprehensive architecture specification in the artifacts directory or review the sections below:
- Workflow: Customer Registration → Email OTP Verification → Admin Approval → Subscription Plan Assignment → Validity Assignment → Account Activation → Windows Application Login → PIN Configuration → Application Access
- Architecture: Windows Application → Local SQLite Database → Background Sync Service → Cloud Backend → Cloud Database
- Local SQLite database remains 100% primary source of truth.
- Offline usage supported; internet required only for initial activation and background cloud synchronization.
