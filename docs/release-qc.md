# Release QC gate

Run from a clean checkout of the exact commit proposed for Production. Record that commit SHA and the Staging deployment SHA before testing. This gate checks code and the Supabase source independently; the SSO-protected Staging page still needs the manual checks below. Do not call the release complete if any required section is unverified.

## 1. Automated code gate

Use Node.js 22.13 or newer and install dependencies from the lockfile. Run:

```sh
npm run qc:release:static
```

This builds the app, type-checks it, and runs the release-relevant tests: Next's parsed proxy matcher for login CSS, JS, fonts and images; the initial dashboard loading screen; Packages store scope; FullAd aggregation, date filters and empty periods; and the Advertising module/store scope helper. It also tests the live checker's pagination and exact-cent arithmetic. The separate `design-ai-routing.test.mjs` suite currently contains four expectations for an older Design Checker implementation and fails on this candidate; it is outside this gate and must be reviewed by that module owner. A pass here does **not** prove deployed CSS, API authorization, or other modules' rendered empty states.

## 2. Live FullAd source gate

Obtain the expected latest FullAd date, month-to-date spend and sales, and store coverage from the approved source report. Set these values and the Supabase credentials securely in the environment; never put the secret in a command, report, Sheet cell, or repository file. Then run:

```sh
npm run qc:release:live
```

Required variables: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `QC_TENANT_ID`, `QC_EXPECTED_LATEST_DATE` (`YYYY-MM-DD`), `QC_EXPECTED_MTD_SPEND`, `QC_EXPECTED_MTD_SALES` (decimal RM values), `QC_EXPECTED_COVERED_STORES`, and `QC_EXPECTED_ACCESSIBLE_STORES`. For Shopee Hub superadmin coverage on 2026-09-24, the last five values were `2026-09-24`, `64610.31`, `1241701.65`, `42`, and `43`; refresh them for every later release. The script uses read-only REST requests, paginates past 1,000 rows, checks the latest date and exact cents, and prints the other source totals for comparison. It does not claim to verify a particular signed-in user's store assignments or the rendered page.

## 3. Staging SSO and page checks

Open the exact Staging deployment URL in a browser signed in through Vercel SSO. Record the deployment SHA or build identifier. If SSO blocks access or the SHA cannot be confirmed, mark this section **PENDING**, not PASS.

1. Open `/login` while signed out of the portal. Confirm the logo, Noto Sans styling, CSS and JS load without asset redirects or console errors. Confirm the auth API remains reachable and a protected dashboard request requires a session. Do not include credentials or session cookies in the report.
2. Use a superadmin and a restricted test account. Confirm disabled modules are absent, a user with no assigned stores sees no FullAd rows, an assigned single store shows only that store, and an unassigned `storeId` returns 403. Confirm All Stores aggregates only the signed-in user's accessible stores. Use browser Network/API responses as evidence; a visible menu alone is insufficient.
3. In Advertising, confirm the default is **Month to date** through the latest FullAd date. For a superadmin, compare all 12 totals and coverage with the live source gate. Check Date (including an empty day), Month, Custom range (including an empty range), and a store with no FullAd rows. Empty periods must show `—` for period metrics, without older snapshot figures. Confirm the two removed text strings are absent: `Data snapshot · 43 stores from Link Directory` and `Select one store to load its Shopee Ads API data`.
4. Check empty/loading states for Packages & Pricing without a selected store and with no packages, Orders & Inventory, Store Health, and Client Action Center using a suitable test account or fixture. Record each observed state. Do not claim these are automated by the code gate.

## PASS/FAIL report

```text
Candidate commit:
Staging URL and deployment SHA:
Node version:
Static gate: PASS / FAIL (command, test count, build/type-check result)
Live FullAd source: PASS / FAIL (expected and observed latest date, spend, sales, coverage)
Login assets and protected routes: PASS / FAIL / PENDING (browser evidence)
Module and store authorization: PASS / FAIL / PENDING (accounts and API evidence)
Advertising periods and 12 metrics: PASS / FAIL / PENDING (source and page evidence)
Major module empty states: PASS / FAIL / PENDING (page evidence)
Overall: PASS only if every required line passes; otherwise FAIL or PENDING
Open findings and owner:
Production published: no / yes (only by the release owner after approval)
```
