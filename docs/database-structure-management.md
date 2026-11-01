# Database Structure owner

The dedicated Database Structure agent reviews database-backed feature changes before implementation and again before release. The Head of Developer coordinates module work, approvals and deployment. A schema review does not replace UI/UX review or final functional QC.

## Canonical ownership map

| Data | Canonical owner | Relationships and rules |
| --- | --- | --- |
| Tenant and Store Selector identity | `tenants`, `stores` | Reuse immutable store IDs and tenant/store foreign keys. Display-name edits never create a second store. Imported aliases remain compatibility data. |
| User access | `customer_users`, `user_store_access`, module permission tables | Derive tenant and active role on the server. Creating a store must not silently grant a selected customer access. |
| Store links and advertising top-up owner | `link_directory_stores`, `link_directory_projects` | One store profile plus project-link children. Existing names reflect legacy origins, not an ongoing requirement to use a Sheet. Do not add a second links directory. |
| Reusable fee templates | `account_rate_card_versions` | Immutable, month-effective template versions. Soft archive removes future choices; historical assignments retain the exact referenced version. |
| Store/company mapping, commercial setup and card assignment | `account_billing_unit_versions` | Reuse one version history for company/mapping/rule/setup changes. Store source currency and fee/ledger currency are distinct. Assignment records retain the exact card name/rule and FX policy approved at that time. |
| Account request replay protection | `account_store_requests` | Shared transactional request ledger for catalog, assignment and Store setup RPCs. Same request ID and payload returns the prior result; changed payload conflicts. |
| Account changes | `account_audit_log` | Append-only action history. Audit snapshots are deliberate history, not competing editable sources. |
| Income and invoices | Existing `account_*` ledger design | Separate from configuration. Do not create invoices, receipts or expected fees from a Rate Card assignment. Production need not activate unused ledger tables to save Store setup. |
| Packages | `packages`, `package_versions`, prices, platform SKUs and package audit | Country filtering is presentation only. Preserve the complete package and immutable versions. |
| Advertising | Daily performance and ad balance tables | Reference the canonical store ID. Source imports may update facts; they must not redefine Store Selector identity or links. |
| Live Calendar | `live_sessions` and audit | Reference stores. Country/time-zone support needs a separate schema review; current deployed time-zone checks still require attention before TH/PH activation. |

## Required review for every database-backed feature

1. **Current evidence:** inspect both target schemas, actual constraints/indexes/grants and migration history. Record differences; migration history alone does not prove the schema exists. Use only authorized read-only inspection until the Head of Developer authorizes writes.
2. **Reuse:** identify the existing owner for each entity. State why any new table represents a distinct entity or lifecycle. Avoid parallel Store Selector, customer, rate-assignment or links tables.
3. **Keys and tenant isolation:** use stable IDs and tenant-scoped foreign keys/uniqueness. Never use mutable display names as relational keys. Review Add/Edit Store, permission filtering, Account, Package, Advertising and Calendar effects together.
4. **Financial meaning:** preserve exact decimal strings/numeric amounts. Separate input sales currency from billing and recorded ledger currency. Store effective Invoice Month, card version, whole-month tier/cap semantics and FX policy. A missing monthly BNM quote stays pending; onboarding must not freeze a spot/monthly number forever.
5. **Access:** use security-invoker RPCs where possible, an empty search path with qualified table names, RLS and explicit least-privilege grants. Revoke default public/anon/authenticated execution for server-only RPCs. Each mutating entry point checks the active Super Admin and tenant. Never expose service credentials or authorize from user-editable metadata.
6. **Transactions and retries:** write linked records in one RPC transaction. Test rollback after a later failure, exact request replay, changed-payload replay, stale expected versions and duplicate names. Lock shared resources in a consistent order; sort bulk targets before locking them.
7. **History:** append versions and audit entries. Soft-archive reusable catalog entries. Do not rewrite previous months, posted invoices, receipts or locked financial evidence when changing current configuration.
8. **Access performance:** index FK/query prefixes used in store, tenant and month reads. Check existing indexes first to avoid equivalent duplicates. Bound and paginate API reads; inspect actual query plans if data volume requires it.
9. **Release:** validate on the existing isolated Staging database with synthetic test fixtures; query the saved rows and exercise server API reload. Run security/performance advisors. Preserve business data and use additive rollback/feature-gating rather than dropping tables to undo a UI release.
10. **Evidence:** record migration filename, target project, exact code commit, test results, UI/UX PASS, final function QC and authorized deployment. Static SQL review alone is not a verified database delivery.

## Delete approval

Before any agent performs a Delete, including soft archive, records/tables/files or cleanup, explain its exact objects and effects and obtain explicit user approval. The 28 October 2026 rule applies to every sub agent. Use rollback-only database tests and preserve existing data. Store project-link synchronization uses UPSERT; removing an existing child link is blocked until approval.

## Cleanup policy

No tables or business rows are deleted because they appear unused or redundant. A cleanup proposal must identify all application/import/permission consumers, actual usage, retained history and a reversible migration. Obtain separate authorization for destructive consolidation. Legacy `store_name`/source aliases and existing ledger tables remain until that evidence exists.
