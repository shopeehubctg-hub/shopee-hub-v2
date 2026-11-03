# Store service status

Feature branch: `codex/store-service-status`, based on main `1b0d347`.

Permission Settings → Stores provides a separate Super Admin-only service-status control: Active, Inactive, Service ended. The confirmation identifies the store and the server-calculated number of affected customer/manager accounts. Cancel does not send a mutation. Status updates use a request ID and optimistic version in one database transaction. No business store has been changed by development tests.

This is an access lifecycle, not deletion. Stores, packages, invoices, source imports and historical records remain. Super Admins retain management/history access. Ordinary users lose only this store; other store grants and primary sessions are retained. Changing a store back to Active never automatically renews its old grants. Explicit selected-store approval must establish the current lifecycle version.

## Access boundary

The Database Structure owner controls the canonical SQL policies:

- `permission_effective_stores` checks active tenant/member, tenant-owned canonical stores, current service status and grant lifecycle version.
- `permission_effective_leaderboard_stores` separately preserves an explicitly granted all-store leaderboard while enforcing the same lifecycle restrictions; it does not widen other module access.

Every server request reads the fresh policy, without authorization caching. Dashboard selectors/Advertising, Package lists and mutations, Design Checker, inventory/Calculator exports, Live Calendar, Overview store sales/aggregate sales, delegated Store management and leaderboards use this boundary. Super Admin-only Account/history/import sources remain available. Calendar retains its existing extra requirement for explicit customer store grants.

If a Dashboard refresh or module request rejects the selected store, the page clears its old shell/module data and reloads the still-authorized stores. It does not globally sign out the account. Already downloaded data cannot be recalled; there is no claim of a background push or remote erasure.

## Database and release

Migration and rollback verification belong to the Database Structure owner. Only the independent Staging project is authorized; no Production migration or release is included. All database tests must roll back their synthetic fixtures. The fixed Staging entry must retain the existing queued Xero, Registered Names and Package candidates when this feature is integrated; do not replace it with this main-based checkout.

The main-based feature overlaps `permission-settings.tsx`, `api/admin/users`, `permission-management`, Dashboard/page and Package routes. Integrate serially, retaining both reviewed changes, then repeat actual UI/UX and final functional QC before any Production authorization.

## Verification

- Database Structure owner: isolated Stage migration and service-role rollback suite PASS; real stores remain Active/version 0, no retained status events or fixtures; existing Account and Xero history preserved. No new database advisor WARN/ERROR findings.
- App: 59 focused tests passed together; the added canonical impact-preview test passed separately (60 distinct affected checks). Coverage includes confirmation/Cancel, denied actors, request/CAS delegation, fresh access scope, remaining-store UI recovery, Calendar, leaderboard permissions, delegated users and Package country/End regressions.
- TypeScript and build passed. New and changed server/component files passed targeted lint. The existing Permission Settings file still has its pre-existing effect-state lint errors; those unrelated effects were not changed.
- Unrelated baseline suites remain outdated: the older on-demand suite expects seven dynamic modules although current main has ten, and a legacy Production compatibility assertion expects columns current main already queries. These were not silently weakened; the new focused revocation interaction test passes.
- Actual combined fixed-Staging UI/UX and final function QC are still required after the Head of Developer integrates the candidate. No Production deployment is authorized by this work.
