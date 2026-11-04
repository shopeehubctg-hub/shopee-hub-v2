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

Configured Xero reads/OAuth require persisted revocable primary portal sessions and existing Account access checks. Production configuration now fails closed unless `SHOPEE_ACCOUNT_SECURITY_ENABLED=1`; a fresh login is required before live activation; legacy signed cookies are not upgraded by bypassing session checks. A disabled status GET remains accessible through existing active Super Admin authorization. Source read scope remains only Shopee Hub, Shopee Hub Internal, Tik Tok Hub and Lazada Hub; no Xero accounting write is introduced.

## Verification and remaining gates

- 148 focused Xero/Account/source/currency/authorization/actual component tests PASS.
- Real Account route + latest decorator test: missing legacy ledger and disabled Xero retains saved Platform/Billing/rate versions, all income unknown, zero reads of Xero tokens/snapshots: PASS.
- TypeScript and full vinext build PASS; focused Account/Xero lint PASS.
- Linked Names/Store setup/Account persistence regressions are recorded in the final handoff.
- Source-only synthetic tests do not constitute fresh Production OAuth, source validation, actual UI/UX or final function acceptance. Parent owns fixed Staging verification, exact Database Structure release review, PR/main merge queue, automatic Production deployment and smoke verification. This candidate has not been pushed or published.

## Reviewed Names activation follow-up

Parent applied only the exact reviewed Names artifact to Production and reported its authorized rollback-only suite PASS, with synthetic fixtures rolled back. Baseline verification is parent-owned. This worker executed no database operation. Xero migration/application, configuration and live source activation remain pending and disabled.

## Canonical mapping guard

Store-owned `store:<id>` billing projects must retain that Store identity. The API rejects a different target before the save RPC, matching the already deployed database constraint. Defensive monthly projection ignores an incompatible mapping version while retaining earlier verified as-of bindings and ledger facts; ordinary roster-unit mapping remains editable. Targeted API/model/crosswalk/no-ledger regressions PASS. No schema or stored-history rewrite is needed.

## Source-label readability follow-up

Matching rows preserve supplied company labels. Where absent, presentation uses already-returned invoice STORE NAME evidence and invoice references; a short stable Contact reference is the final fallback. No company is inferred and no match, amount, source record, schema or sync is changed. Distinct missing-name source rows and existing company labels are covered by rendered UI regression. Actual connected Staging visual retry remains parent-owned.


## Production preparation evidence — 4 November 2026

The user separately approved Production Xero inspection and independent read-only configuration for only WISDOM FACTORY SDN BHD's Shopee Hub, Shopee Hub Internal, Tik Tok Hub and Lazada Hub. Fresh Production credentials and final OAuth consent remain required; no environment values or connections have been copied from Staging.

Parent applied the exact reviewed Names artifact and four Xero artifacts in dependency order. An automatic mapping-migration rejection was resolved by supplying the independent owner review and explicit user approval evidence, then using the same migration tool/SQL; no alternate execution path was used. Four Xero rollback-only suites and the Names rollback-only suite passed. Installed source/private tables are RLS protected and service-only. All six Xero tables remain empty after tests; no source calls, real financial facts or credentials were seeded.

The trusted Google Sheet was reread through the connector on 4 November: all 58 rows matched the reviewed source snapshot. Independent Database Structure and QC approved the exact rollback and commit variants. The rollback rehearsal passed with original fingerprints unchanged; parent then committed 56 month-effective registered-name versions and 41 initial canonical store mappings. Both explicitly deferred rows and six unknown-store units remain pending. Effective Invoice Month is November 2026. The existing 12 October versions, 53 store records, seven Rate Cards and grants are retained; no fee or FX changes were made. The resulting version count is 109 over 59 stored unit keys; the canonical read model prevents competing presentation rows. A single replay-safe batch receipt retains all 58 original source rows. This source-based configuration import is separate from the code PR and is not Stage/Xero replication.

The current matching identity fix shows existing source Store Name labels and invoice references when older snapshots have no company name, or a stable short Contact reference if no readable evidence exists. It does not guess legal companies, auto-save proposals or change amounts. Actual Staging re-review is pending at documentation time.
