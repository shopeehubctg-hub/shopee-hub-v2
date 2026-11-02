# Package Start Date — Database Structure review

Date: 2 November 2026. Reviewed baseline: `7c03f2c8d562c60b861c32d9d95bf014c432d151`.

**Result: existing ownership/schema are suitable for this application change; no migration is required.** Approval is conditional on authoritative transactional validation and the release checks below. This is a schema/design review, not a runtime QC or release PASS.

## Evidence and environment differences

Inspected PostgreSQL catalog metadata in isolated Staging `ubjfuveoqbvouryldqfu` and Production `zwnmonnbmqncwoytdigd` through bounded read-only Supabase SQL calls. Inspected columns, constraints, indexes, grants/effective privileges, RLS/policies, user triggers, package-named public functions, and migration metadata. No business rows, credentials, database writes, migrations, or deletions were accessed/performed.

- Existing owners remain `packages` → `package_versions` → `package_prices`; all effective-date columns are PostgreSQL `date`. Append the new version, price rows, platform SKUs and audit through the existing transaction. Do not rewrite earlier date history or add a parallel lifecycle table.
- Both environments have the unique `(package_id, version)` index, price `(version_id, market, price_type, effective_from, effective_to)` index, price package-ID index, tenant package index and active store/SKU unique index. Existing indexes support this package-local lookup; no additional index is indicated by this change.
- Production has price nonnegative/date-period checks and version date-period/positive-number/JSON-array checks. Staging lacks those checks; FK and status/sync constraint names also differ. Do not claim schema parity. Keep application validation complete on both environments; unrelated schema reconciliation is outside this task.
- RLS is enabled, not forced, on all four inspected tables (`packages`, `package_versions`, `package_prices`, `stores`), with no policies. Effective SELECT/INSERT/UPDATE are denied to `anon` and `authenticated` on all four. They are also denied to `service_role` on the three package tables; `service_role` has these privileges on `stores`. Owner/server access is the relevant boundary; this review did not inspect credentials or establish the deployed connection role.
- No noninternal triggers exist on these four tables and no public package-named RPCs were found. Consequently there is no database trigger enforcing historical date immutability or this start-date rule. The rule must be enforced by the server write path; privileged external SQL remains outside that guarantee.
- Package-named migration lookup returned none in the inspected metadata, despite the actual tables existing. Recent Staging migration metadata reaches `20261101153522`; inspected Production metadata reaches `20261030054916`. Migration names alone cannot prove table state; the findings above use actual catalogs.

## Required implementation boundary

1. Authenticate and derive active membership/module/store access server-side. Read the package with its immutable ID plus tenant and nondeleted scope; verify its store equals the requested authorized store. The package→store FK uses store ID alone, not `(tenant_id, store_id)`, and price/package-version FKs do not prove their package IDs agree. Keep all lookups/writes bound to the authorized canonical package and version; do not trust names or payload ownership.
2. In the version-creation transaction, lock the scoped package row before reloading the authoritative latest version and prices. Compare the expected version again after locking, validate the original persisted start dates against the owning store's current date, and reject changed locked starts before any insert. Earlier POST reads outside the transaction are insufficient. Follow the existing End action's package-row locking convention and keep catalog/package lock order consistent.
3. Define “already started” from persisted periods and store-local today, including starts equal to today and periods already expired. Do not let a changed payload date, status label, different price market or removed/re-added pricing card bypass the lock. Future starts remain editable. Continue validating End Date ordering.
4. Use the owning `stores.platform` with `marketFromPlatform`, then `marketToday` / `MARKET_CONFIG`: MY `Asia/Kuala_Lumpur`, SG `Asia/Singapore`, TH `Asia/Bangkok`, PH `Asia/Manila`. The inspected store schema has no independent country/timezone column. Do not select timezone from package price order. Normal Day prices define lifecycle, with the existing campaign-only fallback for legacy packages; `package_versions.effective_from` currently summarizes a selected primary period and is insufficient by itself for every price start.
5. Keep existing immutable snapshots, recurring settings, history sync/retry and manual End semantics. UI disabled fields explain the rule; only the API check protects a stale editor or crafted request. A unique next-version index prevents duplicate version numbers, but does not replace lock/recheck logic or coordinate an End action by itself.

## Remaining verification

Verify future/today/past and expired dates, End-only saves, recurring/legacy/multiple-market shapes, removal/re-addition bypasses, malformed payloads, tenant/store denial, stale expected versions, and concurrent Edit versus End. Assert blocked operations create no version/price/audit changes and failed later inserts roll back. Use mocks or rollback-only/synthetic authorized Staging fixtures; no cleanup deletion is authorized. Perform real fixed-Staging UI/UX and final function QC, then re-review the final write-path diff before release.

No runtime data integrity audit, query plans, deployed API/UI tests, advisors, credentials, full migration parity audit or deployment was performed by this read-only review. Exact implementation/release commit, automated results, UI/UX PASS and function QC PASS remain for the parent release record.

## Final write-path review — 2 November 2026

Reviewed the proposed `app/package-start-date-policy.ts`, `app/api/packages/route.ts` diff, helper tests and additional API tests. **PASS for the clarified database guard design; no blocking finding.** The implemented boundary preserves the earliest persisted start for each normalized market/day type once that origin is today or earlier. Later monthly periods remain configurable; unpublished draft/review packages remain editable. Removing a locked group or adding an earlier start rejects. This explicitly refines the earlier broad wording about persisted periods: the rule protects the group origin, not every historical event start.

The API locks the tenant-scoped, nondeleted package, rechecks its store and latest version/expected version, reloads prices within the transaction, and throws before new version/inventory writes. The guard uses persisted package status and owning-store-local today. Existing End operations lock the same canonical package row. Helper/API tests represent End-only changes, started/future origins, removed groups, currency normalization, stale and simulated concurrent newer versions, and TH/PH midnight differences.

This final pass inspected source/tests without executing tests or touching either database. A mock concurrency test does not demonstrate live simultaneous PostgreSQL locking; runtime Staging function QC and the parent-run automated check results remain separate release evidence.
