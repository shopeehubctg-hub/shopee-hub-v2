# Calculator selection and existing package repricing — Staging candidate

Feature branch: `codex/calculator-selected-package-pricing`, from main `1b0d347fb407ab443391c9cbfe6090987d9e2ba6`.

Calculator and Package integration queue: no competing active feature found at intake. Fixed Staging has unrelated Account/Xero work at `7d8b1926a6971048160c013e725f5e720a3f9879`; preserve it during integration. Production PR, merge and release are not authorized by this task and have not been performed.

## Behavior

Staging Calculator starts with packages unchecked. Select All and per-package selection drive Create Selected Packages and Update Existing Package Prices. Normal and Campaign scenarios share a stable group ID; identical names remain separate packages. Single creation and existing Excel upload remain available.

In Packages & Pricing, selected active/scheduled MY packages open Recalculate Prices with each target and its prior Calculator settings. Missing inputs require completion. Current store category rates, vouchers and Co-Fund apply; per-package Meta price, quantity, goals, SPayLater, Pre-Order and manual settings remain independently editable. Review shows old/new prices, target SKU and affected saved periods. Normal/Campaign can be selected separately.

The Stage-only server route reads the original package and immutable Calculator export itself, checks package+calculator/store/tenant access, locks the package and appends one complete version. It changes only selected MY selling prices and recurring MY campaign amounts. Other markets/currencies, Original Price, periods/months/Long-term, components, names and platform SKUs remain saved. No dates are requested or invented. Missing periods and prices above Original Price reject. Per-scenario source references preserve unselected calculation provenance, including subsequent ordinary edits.

Retry identity is stored with each version. Exact replay returns the receipt before stale-version checks, including after a newer version. Different payload/actor rejects. History confirmation after commit is separate: an interrupted confirmation returns saved:true and the exact version so the same update can be retried. The frontend skips confirmed successes and retries unfinished rows with their original request/export IDs. Completed results return to the store's normal Package view and highlight updated packages.

## Database Structure Review

Dedicated owner inspected live metadata in isolated Stage `ubjfuveoqbvouryldqfu` and Production (read-only). Initial and final code review PASS. Reuses packages, versions, child prices/platform SKUs, audit and immutable calculator_export_snapshots; no table, migration, index, grant, delete or cleanup. Server DATABASE_URL writes follow existing access; no public REST grants. Private detailed review: `/tmp/reprice-db-review-20261103.md`.

## Automated evidence

24 targeted checks PASS across calculator-package-handoff, package-reprice-ui, package-reprice-api, package-repricing and package-history tests. Includes unchecked defaults/select-two-of-three, paired scenarios, blocked-popup/single handoff, independent prior settings, target IDs, lost-response retry without repeating successes, transactional child failure rollback, original/date/currency/component equality, recurring prices, per-scenario evidence through ordinary edit, same-request replay after a newer version, changed-payload replay, forbidden/Production/ended/stale/pending rejection. API transaction tests use mocked boundaries, not a claim of live database writes.

TypeScript noEmit PASS. Next build --webpack PASS. Local Turbopack cannot follow the shared node_modules symlink outside the worktree; this is a local build environment limitation, not a deployment PASS. Use the successful webpack build locally and verify the Vercel build separately.

The pre-existing package-batch-interaction suite has 7 failures at its obsolete `.component-row input` selector (its other 2 checks pass). No full upload QC PASS is claimed from that suite; actual Stage regression is required.

## Release gates

Fixed Staging: https://shopee-hub-v2-260731-git-cod-e05b8d-shopeehubctg-5199s-projects.vercel.app/

Integration/deployment binding, real Stage desktop/mobile UI/UX, live saved reload, ordinary-user scope and final Function QC: PENDING. Do not equate automated/unit review with these gates. Synthetic fixtures may be retained, never deleted without approval. Production PR/commit/deployment remain NOT EXECUTED.
