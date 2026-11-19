# Create Packages from Calculator

## Dashboard workflow

- Select one or more packages in Price Calculator to open the editable package table. Packages & Pricing also has a single Create Packages action. Both paths support one or more rows and multi-row paste.
- Calculator fills in the early-month, campaign and late-month MY selling prices. Add selling markets under Markets in the package editor. Each additional market has its own price fields.
- Round to nearest RM rounds the three MY selling prices across the batch. RM406.03 becomes RM406 and RM406.50 becomes RM407. An original price below a selling price shows an inline validation message. Price edits and rounding carry through to preview and save, and the linked Calculator recommendations remain available in history.
- Inventory entry defaults to By Product. Search the store’s Product Library by name or SKU, or use Add New Product when there is no match. The new name and SKU fill the current item. Each package starts with 20 item slots and supports up to 100.
- Set the dates once for the selected packages. Completing the dates for the last selected packages opens Final Preview. Users can revisit the dates and explicitly confirm creation.
- Calculator drafts retain their store, account and market selection across refresh in the same tab when session storage is available. Retry uses the existing package save journal.

## Release verification

The user accepted the fixed Staging deployment at `c6ce23b` on 19 November 2026 and approved release through a GitHub PR. The verified feature code is `27a7483`. Staging used the independent Supabase project `ubjfuveoqbvouryldqfu`. The package component and Calculator interfaces use the existing database structure. This release requires no migration.

The fixed Staging check exercised Calculator to Create Packages, confirmed the initial MY prices, and added SG with blank price fields. The 95 affected automated checks passed. Release checks included a Next.js production build, a Calculator browser run through refresh, retry and mocked submission, one-row and multi-row direct entry, and desktop and mobile inventory lookup.

An expanded raw Node run passed 152 of 155 checks. The same three failures reproduced on the pre-release main commit `93ba69d`. Two history tests use an obsolete pricing-toggle selector. The Sheet sync suite needs server-aware TypeScript module resolution and both of its tests passed when bundled with the server condition.
