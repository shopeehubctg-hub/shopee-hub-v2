# Project and country grouping — Database Structure review

Target: independent Staging `ubjfuveoqbvouryldqfu` only. Production was neither queried for this feature implementation nor modified. The user confirmed one Project entry with country switching. This review covers the database/API boundary; actual UI/UX and final function QC remain the parent's release gates.

## Ownership and scope

- `store_projects` is a distinct logical navigation group, not another Store, billing client, customer or fee catalog. Its stable UUID and tenant-scoped label group existing `stores.project_id` relationships. Composite `(tenant_id,project_id)` FK prevents cross-tenant linkage. Several Stores in the same country are allowed; there is no incorrect Project/country unique constraint.
- Store IDs, names/import aliases, platform/country, all existing facts, packages, Account units and permission owners remain unchanged. `link_directory_projects` remains store-child links and is not reused as a business group.
- Current country enablement is `requested_markets`; a country without an entered canonical storefront stays pending. Historical Store relationships are never removed. Previous group values and member sets use existing append-only `account_audit_log`; replay receipts reuse `account_store_requests`. No duplicate audit/request table was introduced.
- Only confirmed initial association: SkinDae MY `shopee-skindae-my-by-ctg4u` and SG `shopee-skindae-sg`. No heuristic suffix stripping, company-name matching or other automatic grouping. The separate reviewed SkinDae rollback script awaits the parent before any business grouping commit.
- SkinDae is the only real SG storefront currently present in the approved Stage baseline. Other Production SG relations must use a fresh, separately reviewed release manifest and confirmed Sheet Client identity evidence later; iLady's country ambiguity remains unresolved. No fake SG Store or additional Production copy is used to simulate them. Multi-country software tests use synthetic transaction-local fixtures only.

## Writes, access and history

`save_store_project(tenant,actor,project_id,spec,expected_version,request_id)` validates an active tenant and Super Admin before exact replay. The server owns tenant, actor, new Store IDs, source defaults and child request IDs. Spec shape is bounded and rejects unknown keys. Existing Store IDs must belong to this tenant/country and cannot already belong to another Project. Existing members cannot silently disappear.

Lock order: tenant user-access advisory lock → active actor → request → current Project → sorted Rate Card locks → Store registry → sorted Store rows. Version CAS rejects stale edits. Parent Project, any explicitly entered new storefronts, each complete country Account setup, directory links, configuration audit and request receipts commit together. A later country failure rolls the whole transaction back.

New storefront creation calls the existing canonical `account_create_store_with_setup_v2` with independent required setup. No source/Account is copied from another country. New country Stores start with access revision 1, with no ordinary user grant, so legacy all-store mode cannot implicitly acquire another country. Existing Store grouping changes no grants or revisions.

Disabling a country requires every active child Store first to pass the existing lifecycle impact preview and user confirmation. The Project RPC itself never performs an unconfirmed lifecycle action; it rejects an active-country disable. Current requested-country configuration may then change, while every membership and previous configuration remains in history. Re-enabling a Project country does not activate a Store or restore user permissions. Pure pending-country cancellation changes configuration only.

Each country's existing billing unit keeps its Rate Card version, effective Invoice Month, sales/threshold/fee currency and FX. SG fixed 3.2/Bonlife service-month BNM and TH/PH service-month BNM are not inferred from grouping. No ledger income/invoice/receipt is created. Missing FX evidence remains pending.

## Read contract and module boundaries

Admin GET returns configured/pending/inactive/ended countries and all child Store status revisions. Public GET derives the active actor's canonical fresh Store scope in SQL. It emits only authorized enabled-country children, never hidden-country/pending configuration, and includes `excludedStoreIds` drawn solely from that same authorized scope so a disabled country cannot reappear through a legacy selector fallback. Unrelated ungrouped Stores remain explicit singleton entries; read requests never write.

The server routes are Stage-only and service-role RPCs have invoker security, an empty search path, and no anonymous/authenticated execution. The new table has RLS; service role has SELECT/INSERT/UPDATE and no DELETE/TRUNCATE. No ordinary role or module default changes.

Sales/Ads/Health use the selected country's exact authorized fact Store. Packages may already contain several price markets under a MY owner: grouping must not move/merge that owner or expand grants. Package/Calculator operation Store context stays explicit and separately authorized; internal country price tabs continue to work. The parent owns this UI integration and its regression review.

## Migration, indexes and actual evidence

- Source migration: `20261103130646_store_project_country_groups.sql`. Applied only to independent Stage via MCP `apply_migration`, whose remote history timestamp is `20261103131723`, name `store_project_country_groups`. Do not reapply the source file just because these timestamp formats differ.
- New indexes cover tenant/name uniqueness and `(tenant_id,project_id,id)` reads/FK. The existing `(tenant_id,id)` Store FK target is reused. No equivalent index or duplicate country identity table was added.
- Real service-role `tests/sql/store-project-groups.rollback.sql` PASS: selected-user country isolation; admin/delegate/foreign tenant denial; same-country multiple Stores; direct malformed/new-country currency rejection; stale CAS; changed/exact replay; no member removal/reassignment; lifecycle-required country stop; reactivation with no implicit grants; independent TH/PH setup; late child failure leaves no partial Project/Store/Account/audit/receipt; no fabricated ledger; least-privilege ACL.
- Readback after rollback: 51 real Stores, 103 Account versions, 0 Projects, 0 grouped Stores, 0 synthetic tenant fixtures. Store identity/status hash `9abbabedb89550334622ba140713c7bb`, Account version-ID hash `8240e86b76c6db3aa358b53dfe604d88`, and user Store grant hash `50170bab825a1fd060888fd069df4d2d` match the pre-migration snapshot.
- New table RLS true; service DELETE false; anonymous read RPC false. Advisors show only expected service-only RLS-with-no-client-policy INFO for the new table; no new related WARN/ERROR. Existing public `rls_auto_enable` definer and disabled leaked-password protection warnings remain unchanged.
- 23 focused Project API/access/Store Account tests, TypeScript, targeted lint and diff whitespace checks PASS before handoff. No UI/UX or Production release claim is made here.
