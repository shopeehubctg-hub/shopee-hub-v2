# Store and Account persistence review — 28 October 2026

## Observed schema before activation

- Production (`zwnmonnbmqncwoytdigd`) has canonical Store/tenant/user/directory tables and no `account_*` tables/functions.
- Existing isolated Staging (`ubjfuveoqbvouryldqfu`) already has the earlier empty income ledger and `account_billing_unit_versions`, including company/setup actions. Its migration history only lists the separate Fake Seller migrations, so schema and migration history differ.
- The older Store setup SQL accepts MY/SG only and cannot retain shared Rate Card identity/client type/FX. Applying it unchanged would lose current setup semantics.

## Additive activation

Migration `20261028031253_account_store_setup_v2_persistence.sql` bootstraps or extends four structures only: billing unit versions, rate-card versions, request replay ledger and audit. It reuses `stores`, `link_directory_stores` and `link_directory_projects`. It does not require the seven additional income/statement/invoice tables in Production.

Rate Cards and assignments are distinct concepts: the catalog is reusable and versioned; assignments snapshot one exact month-effective catalog version for a store/project. Generated card identity/version columns provide a real foreign key from the JSON snapshot, without introducing another editable source. Historical fee-rule/name snapshots are intentional audit evidence. Seven valid existing user-confirmed templates are inserted only for tenant `j-packaging`; empty Fixed/Tier placeholders and automatic store assignments are excluded.

The v2 Store RPCs commit Store identity, directory links, first commercial setup and audit in one transaction. Updates preserve immutable store ID, import source and country. A company-only update preserves fee/card/FX settings, while a directory-only update needs no Account mutation. Catalog and billing rows remain append-only. Soft archive adds a tombstone version and prevents future selection without deleting prior assignments.

All RPCs are service-role only, security invoker and use `search_path=''`. Active Super Admin and tenant checks occur again in mutating SQL entry points. No client role receives direct configuration or ledger access. Request replay protection and optimistic versions apply to catalog, create/update, company/mapping and bulk assignments. Bulk member request IDs derive from the overall request and unit key; a later failure rolls back the complete batch.

Country, source sales currency and billing/ledger currency are explicit. New MY/SG/TH/PH setup bills MYR. SG Internal uses fixed 3.2; SG External selects fixed 3.2 or BNM. TH/PH use BNM for the preceding Service Month. Only the policy is stored; runtime monthly evidence is resolved separately. Whole-month tier rules retain per-tier caps and exact decimal strings.

## Verification and rollback

The Database Structure agent performed read-only schema inspection and prepared SQL. The Head of Developer applies and tests it on isolated Staging before Production. Required scenarios: four-country create/reload, links and company reload, stored exact card version, new/future versions, archive retention, exact retry/conflicting retry, stale optimistic version, invalid FX/cap, wrong tenant/non-admin, duplicate name and full rollback of failed Store/bulk operations. Confirm anon/authenticated cannot execute RPCs or read configuration tables and run Supabase advisors.

Rollback the application/feature capability first while preserving saved metadata and audit history. Revoke v2 execution if needed. Do not drop the new tables, overwrite existing rows, reapply the old MY/SG-only setup, or relabel recorded income as part of a rollback. No production database write was performed by this review agent.

Current Supabase database-function/privilege documentation and changelog were checked. The recent PostgreSQL minor-release notes concern ltree/custom operators, legacy pgcrypto and NaN GiST cases; this migration introduces none. The upcoming HTTP TLS cipher removal does not require changing the Node24 server's modern TLS configuration.

## Execution evidence

The Head of Developer applied the additive migration to isolated Staging and then Production after the user authorized activation. Both databases passed rollback-only Store/card/request/assignment scenario tests; all fixture rows were reverted. Production retains 45 original stores and 7 valid configuration templates, with no invented income or initial assignments. Public client roles cannot execute mutation RPCs; the four tables have RLS and server-only grants. Security advisors on isolated Staging report only the expected no-client-policy info for these server-only tables; older rls_auto_enable/Auth warnings are unrelated and were not changed.

The first Production migration was rejected by automatic approval because it included a Project Links DELETE grant. Before retrying, the grant and destructive rewrite were removed. Link synchronization now uses UPSERT and explicitly rejects removal of existing links; current records remain intact. The safer migration was approved and applied. No Delete/Archive was executed for this delivery. Catalog archive semantics were checked only in mocked/model tests.

Earlier unapplied Account migrations are historical designs, not prerequisites for this additive activation. Do not blindly apply them alongside this migration or create unused income tables. Any consolidation/removal of migration files or schema needs a separate proposal and the user’s deletion approval.
