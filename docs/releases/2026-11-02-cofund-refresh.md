# Co-Fund refresh — 2 November 2026

Status: fixed-Staging Co-Fund acceptance completed; user explicitly approved the 13-record Production import and PR/main delivery on 2 November 2026. Release preflight reconfirmed unchanged Sheet and 136-row Production baseline. PR and Production execution are being prepared; neither is claimed completed in this pre-release document. Earlier pending/interrupted entries below are chronological evidence, superseded by the final acceptance and authorization entries.

Branch: `codex/cofund-refresh-20261102`, from `origin/main` `3067edb8669a8e887e606c5d5c06e5a1d79f81ca`. Intake found no open PR or active remote Co-Fund branch. Scope is the existing Co-Fund voucher owner and data-import tooling; no Calculator, Package, Account/Xero or authentication implementation changes.

Source: user-authorized Google Sheet `1Q2pilQpjJlXDVn8swm44q0yWgTDWE7Dg3Kt-Xk3Cufc`, actual `Sheet1`, A1:E285, Asia/Kuala_Lumpur. Latest block is rows 245–285: 23 complete voucher rows and 18 store-only rows. Store-only rows do not authorize deleting/zeroing saved vouchers. Source fingerprint for the 23 normalized input records: `1516da937d7c01be530b9a5dfdcc721f29bd2790e3347301b2c8b1b9b277fba1`.

## Reviewed Production plan (not executed)

- All 23 complete rows resolve exactly to existing MY Shopee stores and their canonical tenant.
- 10 saved records already match; leave them untouched.
- Add 13 voucher records: 5 currently effective changes and 8 future vouchers starting 8 November 2026 at 00:00 Malaysia time. Future end is the source's exact 15 November 23:59, not an invented end-of-day instant.
- 13 source-row positions are occupied by preceding voucher identities. Preserve their IDs, business values and created_at. Move only their provenance tab into `Sheet1@db-before-20261102T062500Z-cofund` before inserting new source records under actual `Sheet1`. This is an INTERNAL DATABASE SNAPSHOT NAMESPACE, not a real Google Sheet tab. The existing updated_at trigger changes timestamps for those moves.
- Retain original full before images, original provenance, SQL and hashes in a private local manifest; no raw Production business/audit payloads are committed or copied to Staging.
- Expected count 136 → 149. No deletes, archives of business records, new tables, constraints/grants, migrations, store changes or history rewrites.
- Existing calculator still selects the maximum currently active voucher. Verified each of the 5 current additions wins correctly; preserved older values cannot override these corrections. Verified all 8 future values only win from their actual start. A fresh plan against the simulated result yields 0 inserts and 0 provenance moves.

## Database review and verification

Dedicated Database Structure owner reviewed live metadata and the exact private plan/tooling; final design review PASS. Production has business/source unique constraints that Staging lacks. Staging service_role cannot write vouchers; no grants were changed. Authorized connector SQL uses the isolated Staging database only for synthetic fixtures.

The planner rejects ambiguous stores, duplicates, unsupported amounts/quantities, malformed/reversed dates and changed existing business keys. SQL defaults to ROLLBACK; apply requires an explicit flag. It serializes writes with a table lock and compares the complete typed baseline before changing anything. Replaying an old apply SQL fails closed; regenerate a fresh plan instead. The SQL dollar delimiter is selected outside the entire escaped input so voucher text cannot terminate the body.

Automated evidence: 10 new import tests plus 5 existing Calculator arithmetic tests and the platform-voucher preset regression: **16 PASS**. The broad historical rendered-html suite has 3 existing source-regex failures; the same 3 fail on unchanged main code (13 pass/3 fail). They are not claimed as passing and were not modified in this data-only task.

Staging database `ubjfuveoqbvouryldqfu`: rollback preview retained 134 rows/0 fixtures; initial synthetic seed persisted 1 fixture; second rollback retained 135 rows/1 fixture; second apply persisted 138 total rows/4 synthetic fixtures. Verified IDs 136, 140, 141, 142 in `test-staging` / `test-control-my`: prior RM3 retained, current RM30, future RM60 and expired RM100. Replaying the exact apply SQL raised `Stale voucher count; regenerate plan`. Test fixtures are retained; cleanup deletion is not authorized.

## Remaining release gates

Fixed Staging: https://shopee-hub-v2-260731-git-cod-e05b8d-shopeehubctg-5199s-projects.vercel.app/?section=calculator

Current fixed Staging includes unrelated Account/Xero work on `staging`; do not overwrite its candidate or deploy a feature directly to Production. No runtime application change or Vercel deployment has been performed for this tooling/data preparation.

Pending actual UI/UX: log into the independent Staging test account; select TEST Control MY; confirm current CoFund shows RM30, survives authorized reload, and neither future RM60 nor expired RM100 takes effect. Verify another test store remains unaffected. Pending function QC: authorized selected-store API response, ordinary user/store isolation, refresh and error path on the deployed page. Do not report these as PASS from SQL/unit tests.

After those gates, obtain explicit user Production authorization, refresh main and the Sheet/baseline, create a reviewed GitHub PR, merge via main and allow automatic Vercel delivery. Only then execute the revalidated, separately authorized Production data import, retain after images/IDs and verify Production authorized API plus Calculator reload. A code deployment alone does not import voucher data. Report final PR, main commit, deployment and import counts; none exists for this task yet.

## Live verification follow-up — 15:21–15:44 MYT

User confirmed the independent Staging login. Actual fixed-host page reports environment `staging`; observed Noto Sans, no horizontal document overflow, and CoFund in the expected calculator field. Actual authorized API/page for Berlanco initially showed its saved RM22. Three extra synthetic fixtures were then inserted ONLY into that existing Staging store, under `synthetic-cofund-20261102-visible`: IDs 143 current RM30, 144 future RM60 and 145 expired RM100. Actual API returns all three; current page shows RM30, correctly ignoring future RM60 and expired RM100. White Skin Care's empty voucher list shows RM0; All Stores API returns no voucher list. The unrelated test tenant's `test-control-my` returns 403 to this session, verifying isolation. Original TEST Control MY fixtures are retained separately (4 + 3 = 7 total synthetic fixtures); no Production fixtures or data writes.

Final function QC remains **PENDING**. A one-shot Staging browser read failure was injected, but the Staging tab/window closed before the error/retry result could be collected. A subsequent retry recording was also interrupted by closure. Do not claim that error UI or retry passed. User was notified immediately after confirming the tab was absent; further browser operations stopped and a request to keep the page open was sent. Native screenshot capture is unavailable (`could not create image from display`); no screenshot acceptance is claimed. Actual responsive/mobile/relogin review is not complete. Overall UI/UX release PASS is also pending.

Additional dashboard/permission regression batch: 12 pass, 1 pre-existing source assertion fails; identical main baseline reproduces it. The failed assertion is `Production release retains Super Admin-only permissions without delegated schema`. No app/auth/test implementation was changed to suppress it. The 16 previously reported targeted import/calculator tests remain PASS.

Vercel connector cannot currently resolve the fixed hostname via either deployment or alias lookup (404). Git verifies `staging` at `5efafda8d2c569ac33601bc760af9273a2b0e6cb` and main remains `3067edb8669a8e887e606c5d5c06e5a1d79f81ca`, but connector deployment-to-commit binding is unverified. No redeployment, alias change, PR or Production import was attempted.

## Final acceptance — 15:49–15:57 MYT

User confirmed the page would remain open. Successfully completed a one-shot 503 read failure in the actual fixed-Staging browser context: heading `Dashboard unavailable`, alert `Unable to load your dashboard. Please try again.`, visible `Try again`, retry click and successful recovery. The observer persisted its evidence before recovery; the simulated failure affected one browser read only, no server/production failure or data mutation.

Actual Staging reload retained an authorized test session. After reselecting Berlanco, CoFund is RM30 and no error alerts remain. The actual selected-store API had returned the RM30 current, RM60 future and RM100 expired fixtures, confirming UI date eligibility. Previous actual empty-store, All Stores, foreign-tenant 403 and database rollback/stale-replay checks remain applicable.

**UI/UX PASS for the affected CoFund display**: actual Noto Sans/field hierarchy/desktop layout inspected, no document overflow; read-only actual-DOM/CSS rendering at 1440 and 390 widths confirms the CoFund value is readable and mobile layout stacks without document overflow. These PNGs are DOM renderings, not native display captures; native screen permission remains unavailable. No UI implementation changed. Existing narrow Price Goal dropdown truncation is outside this data-only change and is not claimed fixed.

**Function QC PASS for the bounded Co-Fund import/display scope**: current/future/expired selection, persisted reload, empty and All Stores states, actual cross-tenant rejection, visible failure/retry/recovery, exact replay and stale-plan rejection, atomic rollback, preserved original Stage rows, plus the 16 targeted import/Calculator regressions. Ordinary-user/module scope is covered by existing automated dashboard tests; no customer identity was copied or impersonated. No full unrelated Account/Package/auth suite is claimed passing; known unchanged baseline assertions above remain recorded.

Fresh read at 15:57 MYT confirms all 23 latest source rows are unchanged and the entire 136-row Production baseline is still unchanged. Approval request sent for the reviewed 13 additive records/13 provenance-only moves, retaining 10 exact matches and all business history. PR/main/Production import still await that authorization.

## Production authorization and release scope

User answered `批准，推去正式版` to the exact 13-record Production import / GitHub PR → main approval question. Main was fetched again and remains `3067edb8669a8e887e606c5d5c06e5a1d79f81ca`; no open PR overlaps were found. Latest source and complete Production baseline still match the approved plan. The 10 import tests plus voucher-preset regression were rerun: 11 PASS (the earlier 16 include five unchanged Calculator arithmetic checks).

This PR delivers reviewed offline import tooling, tests and the release record. It does not change application/UI/Auth behavior or automatically execute an import during build. Authorized Production SQL runs separately after main merge/deployment verification and must retain private before/after evidence. No Staging fixtures or unrelated Xero/Account code enter this PR.
