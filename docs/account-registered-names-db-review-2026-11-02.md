# Registered names — Database Structure review, 2 November 2026

Database Structure: **PASS for the isolated Staging schema and tested RPC contract**. This is not UI/UX acceptance, final app QC, or Production authorization.

## Ownership and compatibility

`account_billing_unit_versions.legal_entity` remains Registered Name (Platform). Existing API `entity`/`legalEntity` aliases retain that meaning. The sole new field is nullable `billing_registered_name`, exposed as `billingEntity`. It is Registered Name (Billing), not a Store Selector identity or a Xero source fact. No extra company/client/store table is introduced.

Existing business names remain unchanged. Billing starts unknown and is never copied from Platform or inferred from Xero. Omission or null preserves an already applicable Billing name; a trimmed nonempty value changes it. Empty strings are rejected. There is no Clear/Delete action in this release.

Both names belong to the existing month-effective company/setup version lifecycle. Company edits append `change_action='company'` under the existing tenant/unit advisory lock, check the global latest version, and atomically insert the version, audit and request receipt. Names are independently resolved from month-effective company/setup actions; fee/mapping snapshots must not supersede scheduled name edits in the read model. Previous invoices, assessments, receipts and Xero source snapshots are not rewritten.

Stable Contact/Project/invoice mappings remain authoritative. Explicit Billing may drive new candidate suggestions instead of Platform; suggestions never persist from a GET. No automatic match or rename was performed as part of this migration.

## Contract

- `account_registered_names_available()` returns true, server service role only. Billing-bearing Store writes must require it rather than silently downgrade.
- `account_save_registered_names(p_tenant text,p_actor text,p_roster_key text,p_roster_project text,p_platform_name text,p_billing_name text,p_currency text,p_effective_month date,p_store_id text,p_expected_version bigint,p_request_id uuid)` returns `{version,legalEntity,billingEntity}` from the actual saved row.
- `p_billing_name=NULL` preserves the name applicable in the selected month. Normal edits retain the existing current/future Invoice Month boundary. An initial identity-only names row has no invented fee/card/FX. The server supplies authoritative audited-roster/canonical-store metadata; an existing store mapping cannot be changed through this names RPC.
- Store create/update retain their existing v2 signatures and setup `version:2`. Full setup and the company-only patch accept optional `billingEntity`. The company-only patch is `{version:2,legalEntity,billingEntity?,effectiveMonth}`. It retains existing rate/card/FX. Existing Store RPC results remain `{id,version}`; consumers must not claim null was saved merely because a null preserve request was sent.
- All append writers inherit a scoped BEFORE INSERT carry-forward trigger. If Billing is omitted, it resolves a nonnull company/setup Billing name for the same tenant/unit at or before the new version's effective month. Future names cannot leak into an earlier-month fee/mapping or Xero identity anchor.

## Security, history and access cost

All new/replaced functions are SECURITY INVOKER with empty search_path and explicit service-role EXECUTE only. Existing fresh active tenant/Super Admin assertions protect the names editor; delegated Store access still goes through the existing Store-specific assertion. Tenant/canonical-store validation and composite FKs remain in place. RLS remains enabled and version rows remain append-only for service_role (no UPDATE or DELETE).

New fields reuse the existing tenant/roster/effective-month/version lookup index, request uniqueness and audit lifecycle. No new table, FK, duplicate index, DELETE, DROP, TRUNCATE, archive or cleanup is required. A redundant store row lock was intentionally avoided in the names RPC to preserve the existing Store→unit lock order.

## Applied evidence

Only independent Staging `ubjfuveoqbvouryldqfu` was changed. Production `zwnmonnbmqncwoytdigd` was not accessed for writes or deployment.

Migration: `supabase/migrations/20261102025441_account_registered_names.sql` (created through Supabase CLI `migration new`; apply_migration succeeded).

Actual service-role rollback-only suites passed, each ending in ROLLBACK:

1. `tests/sql/account-registered-names.rollback.sql`: pair save/readback, exact replay, changed replay rejection, stale global CAS, no clearing, legacy company/fee/mapping carry, future/as-of isolation, Add Store full setup, legacy unknown Billing, Edit Store pair, historical identity anchor, tenant/role denial, historical-edit denial and late directory failure rollback. No financial facts created.
2. `tests/sql/delegated-store-management.rollback.sql`: existing delegated create/edit/access/replay/late-failure behavior retained.
3. `tests/sql/xero-billing-mappings.rollback.sql`: stable group mapping/identity anchors/replay/CAS/tenant isolation retained.
4. `tests/sql/xero-billing-invoice-overrides.rollback.sql`: invoice override history and global source CAS retained.

Before and after migration/new-suite rollback: 21 billing-unit versions, 54 Account audit rows, 4 request receipts, 22 Xero mapping versions, 51 stores, 0 ledger facts. Excluding the new nullable column, the complete existing unit-row fingerprint stayed `482541be2700d2ecee194da5eafdd0f1`. Billing populated count stayed 0; no synthetic names tenant remained.

ACL/readback confirmed all six touched/new functions are invoker, empty-search-path, service-only. Security/performance advisors reported no Registered Names finding. Existing unrelated findings remain: public `rls_auto_enable` SECURITY DEFINER execution, Auth leaked-password protection disabled, informational service-only RLS/no-policy and pre-existing unindexed-FK/unused-index items. None was changed or deleted in this task.

Reviewed current Supabase [database function guidance](https://supabase.com/docs/guides/database/functions) and [changelog](https://supabase.com/changelog); no relevant breaking change was identified for this additive Postgres design.

## Remaining delivery gates

App model/API and Add/Edit Store/Account UI must use the same names contract, explicitly preserve omitted Billing, resolve names by selected Invoice Month, and preserve existing stable mapping IDs. Actual fixed-Staging UI/UX review must pass before final function QC. Production remains a separate user authorization and release.
