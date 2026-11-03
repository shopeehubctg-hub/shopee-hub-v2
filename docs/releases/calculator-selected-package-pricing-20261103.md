# Calculator selected creation and existing package repricing

Branch: `codex/release-calculator-selected-pricing-20261103`, based on main `f090b9e02e05b904a3c2b1623a5ea2589c0adc8f`. Original feature: `codex/calculator-selected-package-pricing`. Package integration queue follows the completed Batch Upload release PR #50. Fixed Staging retains unrelated Account/Xero/Store changes.

## Changes

Calculator packages start unchecked. Create Selected Packages transfers only selected package groups; Normal/Campaign remain paired. Single-package creation and Excel batch upload stay available. Selected active/scheduled MY packages can open Recalculate Prices from Packages; Calculator also supports explicit existing-package matching. Each package retains independent previous Meta Price, quantity, category and goals while using current store fees and vouchers.

Review shows the target SKU, existing/new prices and affected saved periods. Update Normal, Campaign, or both. The server reads the saved package and immutable Calculator export, checks permissions and expected version, locks the package, then appends one atomic version. Original prices, names, inventory, platform SKUs, dates, monthly/long-term settings and SG/TH/PH prices are retained. Missing periods or prices above Original Price reject. Each scenario keeps its own calculation provenance through subsequent ordinary edits.

Exact retry returns the saved version; conflicting payloads and stale versions reject. A post-commit History interruption retains saved:true and can retry the same Change ID. Confirmed successes are not repeated. Completion returns to Packages and highlights updated records.

## Database Structure Review — PASS

The dedicated owner reviewed live Staging and Production metadata and the final transaction/publisher design. Existing package/version/price/audit and immutable Calculator export tables are reused. No migration, grant, index, deletion or Production data rewrite is needed. Environment isolation remains enforced. Production publisher uses the canonical History retry with expectedVersion.

For ordinary-user QC only, the dedicated isolated QA account was temporarily set to customer with Calculator enabled, no permission delegation and unchanged selected-store grants. Owner review required exact identity/version guards and atomic permission-version increments. Its original manager role and Calculator-disabled state were restored at version 4; the additional disabled permission row and synthetic QA packages remain. No Production account, session or credential was copied to Staging.

## Automated checks — PASS

56 tests: 28 targeted Calculator handoff/repricing/batch workspace/save checks; 9 batch interaction regressions; 19 History, deployment-isolation and authentication checks. TypeScript noEmit, Next webpack build and diff whitespace check pass. Mocked transaction boundaries are identified as tests, not live database evidence. Obsolete batch selectors were updated to use the actual product-picker flow.

## Fixed Staging — UI/UX PASS; Function QC PASS

Entry: https://shopee-hub-v2-260731-git-cod-e05b8d-shopeehubctg-5199s-projects.vercel.app/

Candidate: `cff9aee9a40d87be6b1fbe7bbb811f1f83458745`, Vercel `dpl_5mdSsCp1LqwTWtptzVZJxez88fuw`, READY and fixed alias verified. The release owns only the listed Calculator/Package files; unrelated Staging work is not included in main.

Real authenticated ordinary-customer checks in test-control-my:
- Select two of three Calculator groups: confirmation has four scenario rows for only two packages; handoff keeps both scenarios per group.
- Two selected existing packages restore independent Meta Price/quantities (289/1 and 358/2), automatically match exact IDs and save v1 to v2. Unselected scheduled fixture remains v1.
- One fixture has multiple months; one has recurring long-term Campaign. Dates, originals, components, platform SKUs and all other market prices compare equal before/after.
- History retains both old/new versions with two Calculator scenarios each. Refreshed signed-in API read still returns v2/v2/v1. Completion returns to Packages with two highlights.
- Concurrent identical replay returns v2 twice without another version. Changed payload/stale expected version return409; foreign-store access/update return403. Without Calculator permission the repricing endpoint returns403 and the UI hides Calculator. All Stores read stays inside authorized synthetic stores.
- Earlier live Super Admin checks establish partial update/ordinary edit preservation, changed-price reason validation, replay and cross-store rejection. Unit/interaction checks cover post-commit response loss, partial failure and retry, missing settings, popup failure, single creation, batch save/draft/recovery and transaction rollback.

UI review inspected the real fixed Staging controls, permission/empty/confirmation/completion states and Noto Sans metrics. Desktop1470px and authenticated390px responsive viewport have no document overflow; compact selection controls are12px/42px on the narrow viewport, with distinct black next actions. Existing rendered Staging DOM review images support visual inspection; they are not native OS screen captures. Native screen capture was unavailable on this host. This limitation is recorded rather than represented as a successful native screenshot.

## Combined Staging selector compatibility

During release preparation another queued Store/Project candidate advanced Staging to `0c274991d6c411bc11a1eacf9d3d57148b12bffa` (deployment `dpl_8orh3AnHcw4kJLBjnjGsjUJHRqt3`, READY). It merges and retains the tested Calculator candidate. No repricing route, Calculator or PackageControl source changed; the shared header now resolves Project to canonical Store ID. Additional real Staging checks cover authorized Project selection, two-package Recalculate and Review, store-switch clearing and no-overflow layout. Temporary isolated QA permission configuration was reused under exact version guards and restored at version4. This compatibility check does not approve or include the separate Store/Project feature in the Production PR.

## Release status and limits

User explicitly approved Production and asked to include the previously omitted Calculator feature. At preparation time the feature PR/main merge/automatic Production deployment and Production smoke check remain pending; record actual IDs after completion.

MY repricing only; other market prices remain manual. Legacy packages without Calculator inputs require completion. External Production Sheet/email delivery is not exercised by changing real customer prices during smoke tests. If delivery fails after commit, saved prices remain and the same version can retry confirmation. No test-fixture cleanup is authorized.
