# Add Store — TH/PH Bank Negara average

User confirmed this default applies only to new Thailand/Philippines stores. Existing Singapore policies are retained.

## Changes

- Add/Edit Store displays a compact Currency Exchange Rate section for TH/PH: Bank Negara monthly average, Invoice Month, exact `1 THB/PHP = MYR ...`, and Service Month.
- Invoice Month resolves the preceding Service Period month, including year boundaries. Unpublished/missing averages stay Pending; failed requests can be retried. Switching month or country immediately hides the old value and ignores late responses.
- Super Admin-only, active-tenant, read-only API `/api/admin/store-exchange-rate` derives currency and policy from market. Caller tenant/currency/rate values cannot override them.
- All BNM currencies share one bounded CSV cache/download. Existing SGD interfaces and return shapes remain compatible.
- Policy is automatic for TH/PH and survives reopening through the saved store market. The numeric onboarding value and selected reference month are not frozen into billing records. This is not Account persistence activation and does not introduce currency conversion to package selling prices.

## Evidence

Official catalogue: https://data.gov.my/data-catalogue/exchangerates

Official normalized monthly CSV: https://storage.data.gov.my/finsector/exr/monthly.csv

The `avg` series is the 1200 middle-rate trading-day monthly average. Columns THB/PHP already quote MYR per ONE foreign currency unit. Actual September 2026 source row verified: SGD 3.197, THB 0.1225, PHP 0.065. No further division by100 is applied.

## Verification

- 37 focused FX/API/React DOM/Store/Account regression tests PASS; full build and TypeScript PASS.
- Tests cover exact decimal units, service-month/year boundary, duplicate/missing/invalid data, unavailable month, no stale/spot/cross-currency fallback, shared cache, role/tenant denial, native month events, pending/error retry and out-of-order responses.
- Actual Add/Edit Store React DOM tests confirm TH/PH fields render while Store save continues to send no unconfigured Account or numeric FX payload.
- No database migration or business-data write performed. Actual Staging visual acceptance and final post-visual QC remain pending.

Fixed Staging: https://shopee-hub-v2-260731-git-cod-e05b8d-shopeehubctg-5199s-projects.vercel.app/?section=permissions
