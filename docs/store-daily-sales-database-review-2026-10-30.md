# Store Daily Sales — Database Structure review

Review scope: independent Staging (`ubjfuveoqbvouryldqfu`) only. Production (`zwnmonnbmqncwoytdigd`) remains unchanged. This review performs no data, permission or schema writes.

## Ownership and access contract

- `stores.id` remains the selector identity. `bigseller_store_daily` owns imported per-store daily sales; do not copy these facts into the company totals, Account ledger or another sales table.
- Reuse `user_module_permissions.module_id = 'overview_store_sales'` as an explicit Overview subsection capability. Keep it outside the ten navigation modules and tenant default switches. It is independent of `overview_leaderboard` and `overview_leaderboard_all_stores`; neither grants Store Daily Sales.
- Active Super Admins retain built-in access. Every other account needs custom access, an effective `overview` permission and an enabled `overview_store_sales` row. Missing flags deny. Tenant-disabled Overview must also deny the subsection.
- Reads require a single canonical store ID within the active member's tenant and current enabled store scope. Reject `all`; do not expose company totals, other store names or raw source metadata. Prefer selected, nonempty store scope for ordinary customer grants, matching the existing Live Calendar policy.
- Tenant and actor identity come from the verified session and fresh membership reads. Keep authorization uncached. Sales responses stay `private, no-store`.

## Read-only schema evidence

Stage inspection on 30 October 2026 confirmed:

- `user_module_permissions` has no module-ID CHECK, and already has unique `(user_id,module_id)`. No new permission table, constraint removal or index is needed.
- `bigseller_store_daily` currently has **zero rows**. It has RLS enabled; `service_role` has SELECT, while `anon` and `authenticated` do not. Do not loosen table grants or add public policies to make an empty page appear populated.
- Sales primary key: `(tenant_id, marketplace, report_date, bigseller_store_name)`. Existing `(store_id,report_date)` index supports the proposed bounded single-store reads. No additional index is justified for this change.
- `store_id` references `stores.id`, but the current FK does not itself prove matching tenant IDs. Both sales queries must filter `tenant_id` and the server-authorized `store_id`; retain canonical tenant/store verification before querying facts.
- Multiple imported aliases can share a store/date under the existing key. The current model rejects duplicate canonical days rather than silently adding duplicate facts. Keep this fail-closed behavior until importer semantics are explicitly changed.

## Minimal Stage SQL change

Generate an isolated Stage migration with the official CLI. Add a destination guard before replacing functions (known Stage marker plus the Stage-only permission audit schema; verify the exact project in the caller too). Do not put an automatically applicable Production permission migration in this release.

1. Extend `permission_effective_modules`' allowlist with `overview_store_sales` and its explicit dependency rules above. Apply the tenant gate to custom ordinary modules and Overview subsection dependencies consistently with the TypeScript helper.
2. Extend `save_user_access`' full-state allowlist to all 13 supported IDs and array-length limit 13. Validate the subsection dependency and ordinary customer store scope. Use the existing tenant lock, actor/target locks, expected version, request replay, UPSERT and append-only `user_access_audit_log`; no direct flag mutation endpoint or duplicate audit lifecycle.
3. Preserve `SECURITY INVOKER`, qualified objects and empty search path. Explicitly revoke function execution from public/client roles and grant only `service_role`.
4. Save and revoke the flag through the same complete audited permission payload. Replaying an old request must still check the actor's current authority. No rows are deleted.

The current documentation script and live Stage functions initially contained only the two Leaderboard capabilities, so the Store Daily Sales UI flag alone cannot persist until this extension is applied. This is separate from populating sales facts.

## Application changes required

- `app/module-permissions.ts`: keep the subsection outside `PORTAL_MODULES`; use one effective-access function for module and subsection dependencies, including tenant gates.
- `app/permission-management.ts`, `app/module-access.ts`, both Dashboard read paths and the permission editor must agree with SQL. Do not allow a custom user to bypass a tenant-disabled Overview.
- `app/api/overview/store-sales/route.ts`: fetch actual tenant module rows rather than passing `[]`; authorize before either daily-sales query. Filter by tenant, canonical store, valid bounded month and Shopee marketplace; limit to 32 rows to detect duplicate days. Continue exact decimal-to-cents validation, currency validation and separate cancellation metrics.
- `app/page.tsx` and `app/overview-store-sales.tsx`: display or lock the selected-store subsection from the explicit effective capability. No request should be made for locked access or All Stores. Store changes must cancel or ignore stale responses.

## Stage visibility without a Production copy

The correct current result is “No store sales data”: an empty Stage source does not justify a Production fallback or fabricated real-store amounts. No sales fixture mutation is authorized by this review.

For visual review before data-write approval, an opt-in, clearly labelled presentation-only sample may be limited to the fixed Stage hostname and Super Admin. Keep sample data outside the real sales response and company totals. Functional permission tests can use mocks and rollback-only SQL fixtures. If persistent Stage fixtures are later approved, insert only explicit synthetic rows attached to an existing synthetic Stage store (or a separately approved test store), preserve all existing facts, label the source and do not create real customer accounts or copy Production permissions.

## Required verification before PASS

- Ordinary role defaults, missing flag, missing Overview, disabled Overview, disabled member/tenant and revoked flag all deny before any fact query.
- Explicit custom permission plus an enabled assigned-store grant succeeds; another store, another tenant, disabled grant and `storeId=all` fail. Leaderboard all-store permission never widens this API.
- Permission save/reload retains the flag; revocation, stale version, exact replay, changed-payload replay and delegated actor scope behave like the existing permission lifecycle.
- Correct real-empty, labelled sample, gaps, duplicate days, mixed currency, decimal precision/overflow and stale UI responses remain distinct.
- Verify Stage-only application/function changes under the actual `service_role` with rollback fixtures; no Production DDL, grants or writes. Then complete real UI/UX review and final function QC.

Review outcome: **canonical ownership and minimal reuse design approved; release PASS depends on the tenant-gate alignment, audited function extension and the verification above.**
