# Leaderboard subsection permission — Staging preparation

Canonical grants reuse user_module_permissions. No new permission table, index, store assignment or real-user grant is introduced.

- overview_leaderboard: custom mode + Overview + explicit enabled grant.
- overview_leaderboard_all_stores: additionally requires the basic Leaderboard grant.
- Role defaults never enable either capability, including stale historical custom grants.
- Super Admin retains all access.
- The module navigation/default catalog remains unchanged. These are Overview subsection capabilities only.
- Assigned scope intersects canonical tenant stores with existing user store access; all-participants scope is separately selected. Neither permits company sales APIs.
- Every Leaderboard API request rechecks active user/tenant and current grants. Assigned responses exclude hidden names and recompute visible ranks, totals, pending names and completeness. Response scope distinguishes assigned/all.
- Store selector labels use current display_name ?? name; source values remain unchanged.

Prepared Stage migration replaces permission_effective_modules and save_user_access while preserving advisory locking, optimistic version, replay checks, protected targets, delegated subset enforcement and atomic audit. Rollback harness covers grant/reload/revoke/default/dependencies/tenant/delegation/replay/stale checks.

The initial automatic approval rejection was resolved by explicit user approval: “批准，仅Staging权限函数及回滚测试”. Stage migration overview_leaderboard_section_permissions applied successfully. Rollback functional tests passed before and after migration: grant/reload/default/dependencies/revoke/tenant/delegation/replay/stale/Super Admin. Fixture users remaining: 0; new enabled real-user grants: 0. Existing user_module_permissions fingerprint unchanged before/after: fb255816d2791633b2011ed941c1a57e. Production remains unchanged. Browser visual and save/reload acceptance is still separate.

Local test evidence: permission-management API and new section model tests passed (9); new Leaderboard endpoint authorization tests passed (3). Full TypeScript has unrelated existing package-batch-excel/exceljs errors. UI interaction harness has a React runtime issue and is not visual acceptance.
