# Permission Settings delegation — database review

## Ownership and scope

`customer_users.can_manage_permissions` is an independent administrative capability, defaulting to false. Super Admin access remains built in; Manager/customer roles, `role_default`, tenant module defaults and the ordinary module selector never imply this capability. Only a current active Super Admin may grant or revoke it. No existing module CHECK or module ID list is replaced.

The capability covers ordinary-user permission management plus Add/Edit Store within the actor's authorized tenant/store scope. Tenant defaults remain Super Admin-only. Rate Card and BNM endpoints may offer the read-only data needed for Store setup; catalog mutation and other Account administrative operations remain Super Admin-only.

Canonical ownership is reused:

- `customer_users`: active identity, role, capability and optimistic `permissions_version`.
- `user_module_permissions`: the ordinary module choices; existing `individual_ads` rows are preserved.
- `user_store_access.enabled`: revoke/re-enable selected-store access without removing the row. Existing rows default true to preserve current access.
- `user_access_audit_log`: one append-only permission lifecycle, including exact request replay. It is distinct from commercial Account setup/fee audit and does not duplicate Account ownership.
- `stores` and existing Store/Account/directory version structures: remain the sole Store and billing setup identities.

## SQL enforcement

`save_user_access(tenant,actor,target,payload)` accepts a complete, strictly validated allowlist with expected version and request ID. Tenant/actor are server-derived. The service-role-only, security-invoker RPC checks current active tenant/member and takes a tenant writer advisory lock, actor/target row locks and relevant grant-row locks. Module/default reads remain read-only; no UPDATE privilege on tenant identity/default tables is introduced just to support a read lock.

A delegated actor can edit only another ordinary customer without delegated authority. The target's complete current store and effective-module sets must fit inside the actor's scope; an overlap is insufficient. Delegated writes force selected-store/custom-module modes, cannot change the role or grant the administrative capability, and cannot request stores/modules outside current actor access. Display name and active state are permitted within those bounds. Super Admin, Manager, self and other delegated targets are protected. A target with broader current access is omitted or rejected instead of silently revoking permissions the actor cannot manage.

Ordinary modules are restricted by the actor's own explicit/default effective modules intersected with tenant gates. Live Calendar still requires explicitly selected authorized stores. All permission changes, ordinary-module UPSERTs, selected-store enable/disable updates, version increment and audit insertion commit atomically. Unknown payload keys, stale versions and conflicting request replay fail closed. Fresh authorization is checked before replay, so an old request cannot succeed after delegation is revoked.

The two Store RPCs use a dedicated Store-management assertion rather than widening `account_assert_admin`. A delegated Store writer locks its actor row `FOR UPDATE` from the outset, checks canonical tenant-owned enabled store access on Edit and retains this lock through the transaction. A selected-store creator receives access to only the newly created store, in the same transaction; this advances its permission version and appends a derived-request audit entry. Parent request replay happens first, so a retry creates neither another store grant nor another version. No customer receives a new store automatically. Existing Account setup, directory and company writes retain their atomic transaction.

## Migration chain

1. `20261028045403_delegated_permission_settings.sql`: three additive columns, independent permission audit and users RPC/helpers.
2. `20261028050030_delegated_store_management.sql`: Store-only assertion and replacements of the existing two v2 Store RPCs; existing signatures retained.
3. `20261028050319_permission_audit_append_only_grants.sql`: removes inherited Supabase service-role ALL privileges from the new audit table, granting only SELECT/INSERT.
4. `20261028050548_permission_readonly_scope_checks.sql`: removes read-only tenant/default row locks that would otherwise require UPDATE grants, retaining actor/target/grant concurrency controls.

Apply the full reviewed chain before serving the new code. These migrations contain no DELETE, DROP TABLE, DROP CONSTRAINT or TRUNCATE statements and do not enable delegation for any existing non-Super Admin account. Synthetic fixtures must only be used inside transactions ending with ROLLBACK. Unrelated cleanup and every agent-performed Delete still need separate explicit approval.

## Every enabled-grant read consumer

- `db/schema.ts`: maps `user_store_access.enabled`, membership capability, permission version and the independent `userAccessAuditLog` table/FKs/indexes.
- `app/permission-management.ts`: fresh delegation context, effective store scope and canonical IDs.
- `app/api/admin/users/route.ts`: scoped user/store lists and full-payload save through the RPC.
- `app/api/dashboard/route.ts`: both REST and Drizzle Store Selector/summary scopes.
- `app/module-access.ts`: shared store authorization used by Package, Design and other operations; module reads also respect tenant gates.
- `app/api/packages/route.ts`: direct selected-store Package list load.
- `app/api/live-calendar/route.ts`: authorized Calendar stores.
- SQL `permission_effective_stores`: user-edit bounds and audit snapshots.
- SQL `account_assert_store_manager`: Store write target bounds.

Checking only the Permission Settings page is insufficient: a disabled grant must disappear from Dashboard, Package reads/actions and Calendar too. Existing grants retained as `enabled=false` are historical rows, not effective access.

## Verification evidence

- Read-only inspection confirmed Production and isolated Staging have different CHECK/index names. The chosen membership capability avoids replacing either existing module CHECK; existing unique user/module and user/store indexes already support UPSERT without duplicate indexes.
- Root executed `tests/sql/delegated-permission-settings-rollback.sql` against isolated Staging after the initial and two corrective migrations: PASS. It exercises actual service-role calls, explicit SA grant/revoke, default deny, complete scoped saves, disabled-store filtering, legacy module preservation, exact/conflicting replay, CAS, protected targets, module/store/tenant escalation rejection and fresh authorization after revoke. Audit UPDATE/DELETE/TRUNCATE privileges are asserted absent. All fixtures rolled back.
- Root applied the Store migration to isolated Staging and executed `tests/sql/delegated-store-management.rollback.sql` with actual `service_role` after fixture setup: PASS. It covers atomic creator access/version/audit, exact replay, scoped Edit, disabled-store/foreign-tenant/revoked-capability denial and later directory validation failure rolling back partial Store/access state. All fixtures rolled back.
- Runtime/UI verification and Production authorization remain separate delivery steps. This review agent has not applied migrations or changed live business rows.
