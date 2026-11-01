# Live Calendar Production preflight

Candidate branch: `codex/live-calendar-production`, based on `origin/main` `acd7526`. No Production schema or data change had occurred when this report was written. This is a read-only preflight, not migration execution evidence.

## Read-only database checks

Project: Shopee Hub (`zwnmonnbmqncwoytdigd`). Queries used `information_schema`, `pg_constraint`, and counts; they made no database writes.

| Check | Observed |
| --- | --- |
| `j-packaging` tenant | Present (1) |
| Stores | 43, all in `j-packaging` |
| SkinDae | MY store `shopee-skindae-my-by-ctg4u` exists; SG canonical `shopee-skindae-sg` and slug alias `shopee-skindae-sg-by-ctg4u` absent |
| Alias/canonical selected-store grants | 0 / 0 |
| Calendar tables | Both absent |
| Calendar tenant/user permission rows | 0 / 0 |
| `stores` constraints | Primary key on `id`, FK on `tenant_id`; no composite tenant/id key yet |
| `user_store_access` | Unique (`user_id`, `store_id`) exists |
| `tenant_module_permissions` | Unique (`tenant_id`, `module_id`) exists; check allows current 9 modules |
| `user_module_permissions` | Unique (`user_id`, `module_id`) exists; check also allows `individual_ads` |
| Supabase roles and UUID support | `service_role` and `gen_random_uuid()` present |

Migration `20260928020801_live_calendar.sql` is additive to this observed state: it inserts the canonical SG row and disabled tenant permission, extends both module checks while preserving their existing expressions, adds the composite store key and new tables/indexes/trigger, and grants only `service_role` table access. It no longer deletes legacy alias grants. The transaction must finish before application deployment. The only existing data mutation is an insert into `stores` plus disabled permission rows; alias grant copying is currently a no-op because the source has zero rows.

## Access and behavior checks

- Calendar API derives tenant from the authenticated active membership, checks active tenant, requires explicit tenant permission for non-admin roles, and checks custom user permission.
- Customers always require explicit `user_store_access` rows, including legacy accounts with all-store mode; reads omit cancelled sessions and internal notes. Writes and Directory registration require Super Admin. Registration is restricted to `j-packaging` and a live Directory name.
- Session writes require a canonical store belonging to that tenant and its MY/SG time zone. The database composite FK reinforces the same tenant/store relationship. Updates select by tenant and session ID.
- Dynamic migration CHECK extension preserves the existing `individual_ads` user permission. Old alias store rows and grants are retained, so older modules keep their references.
- UI design review passed on synthetic data. API tests: 15 pass; TypeScript and targeted ESLint pass; Next.js webpack production build passes using a cached verified Noto Sans font fixture. A real database execution test and authenticated Production smoke test are still required after migration/deployment.

## Release order and rollback

1. Recheck Production main and database state immediately before release. Take the platform database backup/snapshot available for this project.
2. Apply the incremental Calendar migration. Verify new table constraints, RLS/grants, audit trigger, SG store, disabled tenant permission, and preserved `individual_ads` check.
3. Deploy this candidate, then test the authenticated Super Admin Calendar, explicit selected-store customer reads, cancellation, and no cross-tenant access. Calendar stays disabled for clients until a Super Admin opts the tenant and users in.
4. If application behavior fails, redeploy prior Production commit `acd7526` and leave the additive schema in place. Keep the Calendar tenant permission disabled. Preserve live-session/audit data if any writes occurred; do not drop tables as an automatic rollback. If the migration itself fails, its transaction should roll back; inspect database state before any retry.

A direct Production release has no isolated database rehearsal. Any mismatch in schema, grants, or authenticated smoke checks is a stop condition, not a reason to bypass the checks.
