# Inventory catalog and batch release, 30 October 2026

User approved release of the accepted Staging Package/Calculator batch workflow. Only the 31 explicitly supplied Berlanco Product Name/SKU mappings were seeded into Production. Other projects' 143 historical candidates across 25 projects were exported for manual selection, not imported. Staging's 32 catalog records were not copied. Existing package/version/history rows were not rewritten.

## Database changes

The user explicitly approved replacing `inventory_sku_tenant_idx` in both environments. Identity is now tenant + store + lower(trim(SKU)); cross-project shared codes are allowed. Store identity is required and protected by a tenant/store foreign key. Existing catalog row IDs are preserved.

- Staging scope migration: `20261030054839`.
- Production scope migration: `20261030054905`.
- Production Calculator exports / append-only catalog audit: `20261030054906`.
- Production catalog verified: Berlanco31, other projects0. Staging32 preserved.
- Rollback-only Staging check: shared SKU in two stores accepted; duplicate case/space variant in one store rejected. No test records remain.
- RLS enabled; PUBLIC/anon/authenticated have no grants on the catalog and audit/snapshot tables. Server APIs derive active tenant, module and store access. Existing-product edits require Super Admin; new-product capture is transactional with package creation.
- Advisors reviewed: new-feature notices are intentional server-only RLS-without-policies and unused new indexes. No public grants were introduced.

## Preservation and retries

Existing component SKU/name snapshots are retained during unrelated edits. Only explicitly new/changed mappings enter the catalog. Legacy duplicate component arrays may remain unchanged, while newly added duplicates are blocked. Display enrichment replaces placeholder names only; editors use the separate saved component snapshot and History stays immutable.

Production publishing continues through the real Google Sheet webhook. Only isolated Staging may acknowledge a local receipt. Both early and locked duplicate-request paths report pending/unconfirmed Sheet work accurately rather than claiming sync completion.

## Validation

- 48 focused checks: API auth/store isolation, four-market package lifecycle, transactional capture/rollback, exact/changed/concurrent replay, trusted Calculator references, immutable History, six Excel market combinations, two input tabs, twenty items, selected-only dates, formula rejection and batch retries.
- Real Chrome local UI fixtures: product/name search, readonly mapping, new products, duplicate notice, mobile dropdown; generated workbook upload, price reason, selected-only dates, Final Preview and creation return.
- TypeScript and production build pass.
- Database owner final release review PASS.
- Existing fixed Staging was accepted by the user. This release preserves its workflow and adds reviewed Production/store-scoping guards.

No Production test packages, schedules, credentials or unrelated feature configuration were created. Hosted authenticated customer downloads must still be checked through the user's normal signed-in session; local UI fixtures are not presented as hosted session tests.
