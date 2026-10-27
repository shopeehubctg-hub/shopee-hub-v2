# BD Dashboard project rules

## Typography
- Noto Sans is the exclusive UI typeface. Keep root next/font and --font-noto-sans.

## Dashboard design consistency
- All modules must use the Dashboard's shared typography, colour tokens, heading scale, buttons, forms and spacing. Scope module styling; do not introduce a separate visual brand for Account.
- Account follows the Xero reference's information hierarchy: concise financial overview, compact billing list, then record details. Keep infrequent fee-plan configuration in secondary settings and use the same monthly-rate state in the list and editor.
- Statement month is the fee-base reporting month; service period is the actual service date range. Do not infer service dates from statement or invoice months, or imply a reference month proves a report has been imported.

## Staging
- The user-facing Staging entry stays https://shopee-hub-v2-260731-git-cod-e05b8d-shopeehubctg-5199s-projects.vercel.app/ . Keep section query parameters as needed.
- Update the existing codex/account-income-module preview branch for this entry. Never send a new per-deployment URL as the review entry.
- Staging, actual UI/UX PASS, then final function QC PASS, then user-authorized Production. Code tests alone are not UI acceptance.
