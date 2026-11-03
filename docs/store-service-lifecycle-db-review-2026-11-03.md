# Store service lifecycle — Database Structure review, 3 November 2026

Database schema/RPC gate: **PASS on isolated Staging**. App UI/UX and final function QC remain separate gates. Production was inspected read-only and was not changed.

## Canonical ownership

`stores` remains the sole store identity owner. `name`, `display_name` and `bigseller_name` keep their existing meanings. The lifecycle adds `service_status` (`active`, `inactive`, `ended`), `service_status_version` and `service_status_updated_at`. The Store Selector uses `display_name ?? name`; a Sheet Shop Name change must preserve ID, base name and import aliases.

`user_store_access.service_access_version` is the grant's explicit lifecycle revision, not a second access registry. Existing selected grants and all-mode behavior remain intact on untouched Store revision 0. Ordinary access requires an active Store and, after any lifecycle change, an enabled grant stamped with the current Store revision. Reactivation alone, an old grant, a new all-mode user or a mode-all profile save cannot restore access.

The append-only `store_service_events` table owns Store lifecycle events and exact request replay. It is a distinct lifecycle from commercial Account configuration and the existing `user_access_audit_log`. A status transition also records affected users' access before/after in that existing permission audit and advances their permission CAS versions. Modules, roles, other stores and financial/source history are retained.

## Authorization and transaction contract

- `set_store_service_status(p_tenant,p_actor,p_store_id,p_status,p_expected_version,p_request_id)` returns `{id,serviceStatus,serviceStatusVersion,revokedUsers}`. Only a fresh active same-tenant Super Admin can call it through the server.
- `preview_store_service_status(p_tenant,p_actor,p_store_id)` returns `{id,serviceStatus,serviceStatusVersion,affectedUsers}`. Counts include ordinary all/selected scope, explicitly granted all-store leaderboard scope and enabled assignments that could otherwise revive later.
- `permission_effective_stores(p_tenant,p_user_id)` is the canonical fresh scope for ordinary module read/write access. Tenant and user must both be active. Super Admin retains canonical inactive/ended stores for management and history.
- `permission_effective_leaderboard_stores` preserves the existing explicit `overview_leaderboard_all_stores` capability without widening unrelated modules. It applies the same lifecycle barrier; there is no browser-provided bypass flag.
- Existing `save_user_access` keeps its 13-module vocabulary and protected-target rules. Only a fresh explicit selected-store grant stamps the current revision; inactive/ended positive grants are rejected. An unrelated/all-mode save does not renew grants. Existing Store delegation uses the same fresh effective Store scope.
- The existing tenant `user-access-write` lock serializes permission and lifecycle mutations; actor/target rows precede Store/grant rows. The status write, grant disablement, affected-user CAS/audits and event receipt commit atomically. Same request/payload replays; changed intent or stale CAS fails.

All new functions are SECURITY INVOKER with empty search_path, explicit service-role EXECUTE and no anon/authenticated access. The event table has RLS and service SELECT/INSERT only, with no UPDATE/DELETE/TRUNCATE. Its tenant/store and actor FK indexes are covered; existing Store/grant indexes serve current-scope reads. No redundant Store table/index or cleanup was introduced.

## Actual Staging validation

Migration: `supabase/migrations/20261103023207_store_service_lifecycle.sql`, created through Supabase CLI and applied only to `ubjfuveoqbvouryldqfu`. A first attempt found a missing copied-function delimiter and was transactionally rolled back; inspection confirmed zero lifecycle columns/table/function before the corrected successful apply.

Real `SET LOCAL ROLE service_role` rollback suite `tests/sql/store-service-lifecycle.rollback.sql` passed. It covers all/selected/leaderboard-only/delegated access, Super Admin history, immediate fresh-scope denial, preview counts, other Store/grant/module preservation, exact/changed replay, CAS, cross-tenant/role denial, inactive grant rejection, users created while inactive, two reactivation cycles, stale-epoch rejection, explicit regrant, no fabricated module notices and append-only ACLs.

Linked real SQL regressions passed: `delegated-store-management.rollback.sql` and current `production-feature-readiness.rollback.sql`. The older October 28 `delegated-permission-settings-rollback.sql` stops on its obsolete expectation that tenant defaults suppress an explicit custom module. The user later required custom overrides, and this lifecycle migration does not change `permission_effective_modules`; this legacy suite is not reported as passing.

Readback: all 51 actual Stage stores remain `active` at revision 0; lifecycle events 0; synthetic lifecycle tenants 0. The user's already imported 103 Account versions and 35 Xero mapping versions remain intact. No real Store was paused or ended for testing. Advisors show no new warning/error. Expected new informational items are service-only RLS without client policies and an as-yet-unused event actor FK index on the empty event table. Existing unrelated advisor warnings were not modified.

## Integration obligations

Every REST/Drizzle API, selector, aggregate and write authorization must consume fresh canonical Store scope; hiding a menu alone is insufficient. No authorization cache may retain ended Store access. App ownership covers Dashboard, Packages, Overview, Advertising, Calendar, permissions and direct store-bearing writes. Keep existing explicit global leaderboard scope for other active stores. ORM metadata should represent the added Store/grant columns to avoid future schema drift.

Production status schema/app deployment is not authorized by this review. No Delete, soft archive, cleanup, key rewrite, source replication or fabricated Store is part of this change.

## ORM metadata parity

`db/schema.ts` now includes `stores.service_status`, `service_status_version`, `service_status_updated_at` and `user_store_access.service_access_version`. Version columns use exact JavaScript bigint metadata, while status API responses remain decimal strings. This is model metadata for the already applied Stage migration; no new remote DDL is required. `store_service_events` remains migration-owned append-only lifecycle/request history and is accessed only by reviewed SQL RPCs; no ORM query or duplicate editable event entity is introduced.
