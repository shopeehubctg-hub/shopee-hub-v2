# Fixed Staging candidate — 2 November 2026

## Store master and service status — 3 November 2026

Integration starts from main `1b0d347` and preserves Staging `5efafda`, including Xero, Registered Names and Package work below. Store status feature `39bd252` was integrated as `60c2b2a`; the only conflict combined Billing identity and service-status Store fields. `e77e0a3` retains existing saved currency for later mapping/name/fee edits, preventing imported SG units from failing future saves.

Independent Staging data only: 58 Sheet clients imported as November-effective name versions (44 Billing known), with all six source columns retained in the existing request receipt. Fourteen exact unique Shop identities received explicit mapping versions; all October history remains. SkinDae SG display label now follows the Sheet. No new store, invented fee/invoice, deletion, real service-status change or Production write occurred.

Store lifecycle schema and actual rollback tests PASS; all real stores remain Active/version 0. Combined Node 24 build PASS. Focused status/access, Calendar, Account names and currency tests PASS. The pre-existing delegated Rate Card GET expectation (200 versus actual 403) remains separately documented and is not represented as passed. Actual UI/UX and final function QC are pending for this combined deployment.

Production data import remains gated: existing Store-based billing setup and legacy roster clients need an explicit canonical-unit crosswalk first; never copy the Staging manifest or overwrite currency/financial history. ILADY SG has contradictory existing MY metadata, and KATA SG has no supplied Shop Name. These remain pending rather than being guessed.

Store Status actual UI/UX PASS on `8734869`, followed by independent final function QC PASS (mock API plus actual rollback-only Stage identities; no real store stopped and no ordinary-user browser-login claim). Account crosswalk `5f3fbb5` separately received Database Structure code GO, independent 55/55 checks, TypeScript/lint and combined Node24 build PASS. It reuses only six audited November-effective canonical SG unit configurations, preserves source Client provenance, and leaves all ledger-backed rows/history/FX and raw Xero bindings intact. Actual Account visual/readback review and final function QC remain pending for the next combined deployment.

Retains Xero/Account from integration base 6213e0c7c4d772e354ebc848a1c0d9e385a4d5f2 and Package order fix PR #47. User authorized combined Staging; no Xero files enter the Package main PR.

Start Date feature: codex/package-start-date-lock-20261102 at d0b5652176ecafcaf9ca236f79cfbf115842dc3f. Future custom Campaign start remains editable; started market/day-type origins are preserved. Automated 57/57 PASS; webpack/TypeScript build PASS; Database Structure/final guard PASS. Actual UI/UX and function QC in progress, required before main merge.

Fixed Staging: https://shopee-hub-v2-260731-git-cod-e05b8d-shopeehubctg-5199s-projects.vercel.app/
DB only ubjfuveoqbvouryldqfu. No Production auth/data replication.

Account Store Name matching: codex/account-invoice-store-matching at 123f7cdd55e67552155e47a5a740faabf7b92870. Includes queued Registered Name (Platform/Billing) prerequisite28e008c8. Fresh explicit STORE NAME evidence drives per-invoice matching; unknown/conflicting/multi-store invoices remain pending. Stage names and evidence migrations applied, actual rollback checks PASS. Automated186 related checks and TypeScript PASS. Actual fresh source review, UI/UX and final function QC pending. No Production release authorized.


## Three pricing modes — 4 November 2026
User approved combined review with current permission work. Feature codex/calculator-three-period-pricing at 331c009d832340b9f46bd0d637f9cd4504585d76 is integrated on Stage base 1526c4ed5f178eb4b8652f3eb08dc1db20e0d4bc. Canonical Normal availability + versioned early/late price rule, immutable Calculator period evidence, single/batch/Excel/reprice/History all retain explicit mode. No DDL/backfill/business data copying/deletion. Stage DB only ubjfuveoqbvouryldqfu.
49 feature/regression checks, TypeScript and webpack build PASS before integration. Permission UI/API and Xero runtime versions retained from Stage during conflict resolution; no Stage feature replaced by main's older presentation. Combined 40 checks PASS (feature + store-scope + permission UI); combined Next webpack / TypeScript build PASS. Real UI/UX and Function QC PENDING; Chrome page execution timed out and deployment connector has403; user confirmed Chrome is busy and deferred real browser checks. No Production PR/release authorized for this candidate.

## Three pricing modes live verification follow-up
Feature code d53f941; review notes 93b9013. Fixed Staging code deployment 8e7f21a (dpl_4yNngHnrSqqpaFYXfj9mWjJv2YM5) READY, exact alias verified by authenticated CLI. User manually logged into a separate Staging-only Chrome profile as Super Admin. Authenticated health confirms independent ubjfuveoqbvouryldqfu. Desktop1440/mobile390 Calculator UI review PASS after scoped Price Goal fit fix. Actual mode switching, selected two-package handoff, Excel download, single and batch synthetic creation, persisted History, late-only repricing and locked started dates verified. Duplicate SKU/retry409 and anonymous401 verified. Full Function QC remains PENDING ordinary-customer module/store permissions and relogin. No ordinary-user browser pass is claimed. All prior permission/Xero changes retained; no Production PR, main merge, release or cleanup. See docs/releases/three-period-pricing-20261104.md for limits and test evidence. This paragraph supersedes the resolved Chrome/connector blockers above.

## Fixed three-price Calculator — 5 November 2026

Queued feature `codex/calculator-fixed-three-prices-20261105` at `aa174b7e6ee2e4f7f7f2c1a2f8f4e2236409797b` is combined with Stage base `59a09c260892a4e228bf4e9b912b39143cca01bc`. The merge retains all preceding Store permission/service-status, Account and Xero changes. Calculator now always returns three recommendations without a mode selector; new single/batch creation selects either uniform or early/Campaign/late application. Excel uses one Original + three Disc layout per market with the existing two entry tabs, Product Library and 20 items. Uniform application records its explicit source and retains all three original calculations. Legacy two-price package reads/edits/repricing remain supported without conversion.

Database Structure review: reuse existing canonical tables and immutable export payloads; no DDL, backfill, customer-row copying or deletion. Independent Staging only `ubjfuveoqbvouryldqfu`. Focused automated checks 27 PASS; TypeScript and webpack build PASS before integration. Combined check/deployment evidence is recorded in the handoff; a Git update alone is not a verified fixed-alias deployment.

Actual UI/UX and Function QC: PENDING USER by explicit request. The prior candidate's browser PASS is not carried forward to this changed version. No real-browser QC, ordinary-customer login claim, Production PR/main merge or Production deployment is performed. Release notes: `docs/releases/calculator-fixed-three-prices-20261105.md`. Vercel connector access currently fails 404; prior local login returns invalid-token 403. Fixed alias verification remains blocked pending authorized Vercel session recovery.

## 5 November — approved release supplement
Feature branch codex/release-fixed-three-platform-voucher-20261105. Preserves all existing Staging permissions/Xero work; only adds the accepted By Product Name batch default and scoped Supabase-backed Platform Voucher lookup. Stage database ubjfuveoqbvouryldqfu: nullable late_month_average migration applied; 35 independently mapped source Sheet rows imported and read back with zero mismatches. Main base 0e4a22a941e643ef09e5fff4dbff6abb5822aa86. User accepted the three-price workflow/UI and explicitly approved Production on 5 November. No agent browser QC repeated. 30 focused tests, TypeScript and webpack build PASS on release source. Production delivery only through GitHub PR/main automatic Vercel release.


## 5 November — same-price summary display fix

- Package integration queue: `codex/package-same-price-summary-20261105`, feature commit `8c6e767ac6af421c9ba773c942a1ff2a5f7d8ddc`, based on Production `fed634cc32b3743c120c820122a491ff985c16b0`.
- Integrated onto Staging `97061a530a711cc850fc4c49e1d002517a311b53`; retain the current permissions/Xero candidate and Platform Voucher supplement.
- Same early-month, Campaign and late-month prices collapse to one price/Original/Period per market; differing prices remain detailed. Display-only: no schema or saved customer records changed.
- 9 component checks, 10 pricing checks, TypeScript and feature build PASS. Existing country-filter test has the same stale-selector failure on the unchanged Production baseline; recorded in release notes.
- Actual UI/UX and Function QC await user review at the fixed Staging entry. Production PR, merge and deployment are not executed for this fix.
- Release notes: `docs/releases/package-same-price-summary-20261105.md`.
