# Thailand and Philippines package pricing — Staging

## Scope

- Shared market registry: MY/MYR/RM, SG/SGD/S$, TH/THB/฿ and PH/PHP/₱.
- Four markets across package creation, independent Normal/Campaign prices, shared pricing, monthly/long-term dates, recurring events, draft/create, edit and immutable history.
- New forms default to the selected store's country. Calculator transfers explicitly retain their MY pricing identity; this does not invent Thai or Philippine commission/tax formulas.
- Grid uses the correct market symbol. List derives its currency columns from filtered records and keeps details colSpan in sync.
- API validation, stored cents, read/history recovery, publication/Sheet payloads, retry recovery and End use the four-market contract. Status and End dates follow the owning store's local day; Bangkok differs from MY/SG/PH around midnight.
- Add Store offers TH/PH. They use the existing store-only persistence path without guessed Account rates/FX. MY/SG Account setup remains its existing preview.
- Added TH and PH read-only samples; sample mode remains confined to Super Admin on the fixed Staging hostname.

## Verification

- Full vinext build PASS; TypeScript PASS; targeted backend/model/test ESLint PASS.
- 54 focused market/Package/Store tests PASS, including actual React DOM create/edit flows and bundled real API handlers with database/Sheet adapters.
- 26 linked MY/SG Account setup, Store and existing Live Calendar regressions PASS.
- TH/PH route tests cover cents, draft without Sheet writes, publication/Sheet payload, immutable edits/history, End idempotency, mixed four-market date validation, invalid markets, role/module/tenant denial and local-day boundaries.
- Store tests cover TH/PH creation and rename, duplicates/invalid markets, plus Staging TH/PH forms submitting no unconfigured Account fields.
- Read-only schema inspection in Production and the existing isolated Staging project confirmed package market/currency/store platform are text and have no MY/SG allowlist constraint. No database migration or business-data writes were performed.
- Actual Staging visual review and final post-visual QC are pending. Developer checks are not UI/UX acceptance.

## Linked limitation

Live Calendar's deployed time_zone CHECK permits only Asia/Kuala_Lumpur and Asia/Singapore. Its TH/PH activation needs a separate change; calendar runtime/schema were left outside this package-pricing delivery. Package pricing and package lifecycle use their own four-market time zones.

## Delivery

Fixed review entry: https://shopee-hub-v2-260731-git-cod-e05b8d-shopeehubctg-5199s-projects.vercel.app/?section=packages

Same host with `&packageSamples=1` opens the read-only examples. Production has not been published for this change.
