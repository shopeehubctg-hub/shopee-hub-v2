# Latest Account release candidate — 4 November 2026

Base `e60dc4c` (Menu/Pin PR53). Branch `codex/account-production-release-20261104`. Source Account runtime `583b734` plus the isolated Registered Names Store setup slice. `app/page.tsx`, sidebar, Project create/edit, lifecycle schema/access and menu styles are unchanged from main.

## Delivery scope

Latest Account layout, current Malaysia Invoice Month, compact billing records, secondary accounting settings, separate Registered Name (Platform/Billing), canonical billing-unit six-entry crosswalk, source currency preservation, invoice detail display, Contact/Projects and explicit invoice Store Name mapping code. Add/Edit Store receives only the two registered-name fields through existing atomic Store setup. Existing fee/FX/Rate Card versions and ledger facts are retained.

All Xero code ships inactive when configuration is absent or `XERO_ENABLED` is not `1`. The disabled path retains existing Account names/rates and unknown income; it does not require Xero tables or manufacture income. Actual Production source consent, OAuth inspection/configuration, live sync and financial matching are separate pending actions. No Stage app credential, token, auth/session, source snapshot, saved Xero mapping or Sheet business-row import is part of this code candidate. The old draft PR45 is stale and must not be treated as this release.

## Schema boundary

The standalone Names artifact `20261102025441` adds one nullable configuration field, its carry-forward trigger/capability, and atomic versioned save support. It does not depend on Xero. Database Structure final review and explicit application authority are required before schema activation.

Four Xero migration artifacts are included as future reviewed implementation, not an instruction to activate them for this UI release. Full dependency order is base snapshots → source mapping → invoice overrides → Names → Store Name evidence. Never blanket-push all Stage migrations. The five artifacts below are byte-identical to reviewed source; no lifecycle/Project/old ledger/security-schema migrations are included. Production has no legacy income ledger; rollback-only tests conditionally check optional existing ledger tables without creating them. No database mutation test or DDL has been executed by this worker.

- `20261101104216_xero_readonly_source_snapshots.sql`: `787d4051608496bfec96b90b3b36f223b4f885d231c5cec913970e53419410bd`; identical to reviewed Stage artifact: True.
- `20261101150445_xero_billing_source_mappings.sql`: `44f1d52c39b91ffe0ca05f9ced4fde5af62fa096e3bddfed5993b00b04e5813a`; identical to reviewed Stage artifact: True.
- `20261101153038_xero_billing_invoice_overrides.sql`: `a3241bcb5021dfc6ecf855071cc89551f72da161fb65b51bb09aa5b52afb8cdb`; identical to reviewed Stage artifact: True.
- `20261102025441_account_registered_names.sql`: `50c0b0a2382c8185d58e24ca5a8ed43d4c8d713edcf722d26548d203a95dd1fc`; identical to reviewed Stage artifact: True.
- `20261102033822_xero_invoice_store_name_evidence.sql`: `4283700f63d1f720ef1c96440724654823c0df177b5e7f70a63acfa53bbf9557`; identical to reviewed Stage artifact: True.

## Environment and connection prerequisites

A dedicated Production app, exact Production callback, explicit organisation allowlist and independent random token encryption key are required for future live activation. `XERO_APP_ID` is now required for Production and the known Stage app / Stage sandbox flag is rejected. This metadata check does not replace fresh OAuth consent. No credential values are committed or copied. Runtime uses environment/tenant/organisation-bound encryption and separate `environment='production'` database rows.

Configured Xero reads/OAuth require persisted revocable primary portal sessions and existing Account access checks. Check Production `SHOPEE_ACCOUNT_SECURITY_ENABLED=1` and a fresh login before live activation; legacy signed cookies are not upgraded by bypassing session checks. A disabled status GET remains accessible through existing active Super Admin authorization. Source read scope remains only Shopee Hub, Shopee Hub Internal, Tik Tok Hub and Lazada Hub; no Xero accounting write is introduced.

## Verification and remaining gates

- 148 focused Xero/Account/source/currency/authorization/actual component tests PASS.
- Real Account route + latest decorator test: missing legacy ledger and disabled Xero retains saved Platform/Billing/rate versions, all income unknown, zero reads of Xero tokens/snapshots: PASS.
- TypeScript and full vinext build PASS; focused Account/Xero lint PASS.
- Linked Names/Store setup/Account persistence regressions are recorded in the final handoff.
- Source-only synthetic tests do not constitute fresh Production OAuth, source validation, actual UI/UX or final function acceptance. Parent owns fixed Staging verification, exact Database Structure release review, PR/main merge queue, automatic Production deployment and smoke verification. This candidate has not been pushed or published.
