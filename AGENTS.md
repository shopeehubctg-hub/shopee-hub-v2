# BD Dashboard project rules

## Typography
- Noto Sans is the exclusive UI typeface. Keep root next/font and --font-noto-sans.

## Dashboard design consistency
- All modules must use the Dashboard's shared typography, colour tokens, heading scale, buttons, forms and spacing. Scope module styling; do not introduce a separate visual brand for Account.
- Account follows the Xero reference's information hierarchy: concise financial overview, compact billing list, then record details. Keep infrequent fee-plan configuration in secondary settings and use the same monthly-rate state in the list and editor.
- Account billing policy confirmed by the user: Invoice Month is based on the preceding month's Service Period. Show this once above billing records, and hide individual Service Period fields. Statement month remains the fee-base report reference; a reference month does not prove a report has been imported. Do not backfill stored dates as part of UI-only work.
- Rate Card updates must record the effective Invoice Month, preserve earlier month assignments and locked history, and use the same assignment logic for individual and bulk edits. Bulk selection must have a clear scope and never silently update hidden rows or partially apply an invalid batch.

## Staging
- The user-facing Staging entry stays https://shopee-hub-v2-260731-git-cod-e05b8d-shopeehubctg-5199s-projects.vercel.app/ . Keep section query parameters as needed.
- Update the existing codex/account-income-module preview branch for this entry. Never send a new per-deployment URL as the review entry.
- Staging, actual UI/UX PASS, then final function QC PASS, then user-authorized Production. Code tests alone are not UI acceptance.
