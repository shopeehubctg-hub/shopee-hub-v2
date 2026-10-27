# BD Dashboard project rules

## Typography
- Noto Sans is the exclusive UI typeface. Keep root next/font and --font-noto-sans.

## Dashboard design consistency
- All modules must use the Dashboard's shared typography, colour tokens, heading scale, buttons, forms and spacing. Scope module styling; do not introduce a separate visual brand for Account.
- Account follows the Xero reference's information hierarchy: concise financial overview, compact billing list, then record details. Keep infrequent fee-plan configuration in secondary settings and use the same monthly-rate state in the list and editor.
- Account billing policy confirmed by the user: Invoice Month is based on the preceding month's Service Period. Show this once above billing records, and hide individual Service Period fields. Statement month remains the fee-base report reference; a reference month does not prove a report has been imported. Do not backfill stored dates as part of UI-only work.
- User-confirmed MY billing PDF defaults begin with Invoice Month 2026-10. Internal NEW tiers use each billing project's own monthly Shopee Sales; never aggregate projects by Entity. Only the >=RM200,000 tier has the RM4,000 cap. Keep source assignments as UI preview defaults until database activation is authorized.
- SG billing preview uses SGD source sales converted to MYR before tier selection and bills fees in MYR. Internal FX is fixed MYR3.2 per SGD1. Bonlife uses BNM monthly average for the preceding Service Period, never the Invoice Month or a live spot rate. Other External FX remains pending until user confirmation. Preserve exchange-rate evidence in locked previews; never relabel existing ledger currency or manufacture MYR income.
- Rate Card updates must record the effective Invoice Month, preserve earlier month assignments and locked history, and use the same assignment logic for individual and bulk edits. Bulk selection must have a clear scope and never silently update hidden rows or partially apply an invalid batch.

## Staging
- The user-facing Staging entry stays https://shopee-hub-v2-260731-git-cod-e05b8d-shopeehubctg-5199s-projects.vercel.app/ . Keep section query parameters as needed.
- Update the existing codex/account-income-module preview branch for this entry. Never send a new per-deployment URL as the review entry.
- Staging, actual UI/UX PASS, then final function QC PASS, then user-authorized Production. Code tests alone are not UI acceptance.
