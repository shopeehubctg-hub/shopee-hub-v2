# Three pricing modes · Staging candidate

Feature branch: codex/calculator-three-period-pricing. Initial base: origin/main 36afc260a7a50518a32818b9de3011a5b3faaadd; updated to 0e4a22a before delivery.
User authorized combining the candidate with existing fixed Staging work on 4 Nov 2026. Preserve the permissions updates during integration. Production is not authorized.

## Data contract

No DDL, backfill, cleanup or new table. `package_prices` retains canonical Normal availability and Campaign ranges. A validated `_pricingMode` distinguishes uniform, normal_campaign and split_normal. `_normalMonthlyRule` schema1 stores early/late decimal prices per market; its lifetime is exactly the canonical Normal availability, with no separate dates. Campaign events override the applicable Normal half. Saved prices are not changed by later voucher-reference changes.

Calculator export storage envelope remains schema_version1 (required by the existing immutable table constraint). Payload `pricingSchemaVersion:2`, explicit `pricingMode` and stable `pricingPeriod` identities distinguish content. Never rewrite historical exports. Legacy two-scenario payloads and previous spreadsheets remain readable. Pricing periods are not inferred from array order or translated names.

Historical Platform Voucher averages: source Final!A1:D36 in https://docs.google.com/spreadsheets/d/1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k/edit , read 4 Nov 2026. These are references, not future entitlement guarantees. A missing late-month reference requires manual input; do not invent one. Calculator computes MY only. Other markets are independent manual entries.

Uniform mode uses the highest of the period recommendations as one shared recommended selling price; the period comparisons show actual estimated Buyer Payment and Order Income at that shared price. Customer may change the saved price later, with a reason when it differs from a linked calculation.

## Gates

Database reuse design: PASS, reviewed by existing Database Structure owner; no migration required. Actual desktop/mobile Calculator UI review: PASS for the checked views. Final Function QC remains PENDING ordinary-customer permission and relogin checks; do not interpret the successful Super Admin paths below as final release acceptance. No Production PR, main merge or Production deployment is part of this candidate.

## Local verification (4 November)
- Feature branch rebased by fast-forward onto origin/main `0e4a22a`; only an unrelated release-policy document changed upstream.
- 49 automated checks PASS: Calculator selection/handoff; immutable period snapshots; Excel 20-item + MY/SG roundtrip; legacy two-scenario files; partial price updates/retry/rollback/permissions; package lifecycle; four-market single creation/edit; History.
- TypeScript PASS; Next webpack production build PASS. React review retains scoped Noto Sans styles and shared controls.
- Database Structure/persistence implementation owner PASS. No new table, migration, backfill, business-data write, credential transfer or deletion. Canonical Normal availability owns all rule lifetime; Normal halves share Original Price.
- Connection blockers resolved using an authenticated Vercel CLI and a separate Staging-only Chrome profile, manually logged in by the user. No existing browser session or Production account was copied.
- Production PR, main merge and Production deployment NOT EXECUTED.

## Actual fixed Staging verification

- Feature implementation `331c009`, scoped Price Goal layout fix `d53f941`; combined Staging code commit `8e7f21a` preserves the permissions/Xero candidate. Vercel deployment `dpl_4yNngHnrSqqpaFYXfj9mWjJv2YM5` is READY and binds the fixed Staging alias. Deployment metadata confirms ref `staging`; authenticated health confirms environment `staging`, project `ubjfuveoqbvouryldqfu`, database reachable.
- All three pricing modes switched in the actual Calculator. Uniform mode showed one common listing price with three independent payment/income comparisons; legacy two-price and split-Normal modes retained the expected scenarios. Only two selected Calculator packages opened the two-package creation queue, with all three prices carried over.
- Actual Calculator Excel download opened successfully with both entry tabs, 20 inventory slots, explicit split-mode metadata and early/Campaign/late prices. Only Package Name is frozen horizontally. The linked workbook uploaded, accepted dates and created a synthetic split-mode Staging package, returning to the package list.
- Actual single creation returned HTTP201. Reloaded package data and History retained all three prices, ongoing dates, inventory, shared Original Price and all three Calculator snapshots.
- Recalculate from the synthetic existing package loaded each period's saved settings. Updating only late Normal from RM314.13 to RM326.09 returned HTTP200/version2; early RM348.78, Campaign RM370.51, Original RM999, dates, SKU and inventory stayed unchanged. History retained version1 and its original calculation.
- Edit / Modify loaded the split prices correctly and locked both already-started Start Dates. Missing required dates displayed an error summary. A duplicate listing SKU returned HTTP409/BATCH_SKU_CONFLICT; retry also409. Anonymous package reads returned401.
- Actual 1440px desktop and 390px mobile screenshots inspected. Price Goal controls stay inside their cards and mobile document width equals viewport390. Scoped fix build and diff checks PASS. Screenshots and API proof are in the ignored `outputs/` handoff artifacts, not published customer data.

## Remaining gates and risks

- Full Function QC is not PASS: ordinary-customer module/store permission paths and relogin remain unverified in this manually logged Super Admin browser. No ordinary-customer permission was changed to manufacture a pass.
- Voucher percentages are historical reference averages, not guarantees of future offers. Unknown late-month values require manual input. Calculator remains MY-only; non-MY prices are manual.
- Synthetic test fixtures remain only in independent Staging; no deletion/cleanup was performed. Staging Sheet sync is its local receipt, not a Production Sheet write. Production is unchanged and requires separate explicit approval after all gates pass.
