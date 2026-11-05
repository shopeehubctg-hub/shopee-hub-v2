# Three-price Calculator and live Platform Voucher release — 5 November 2026

Branch: `codex/release-fixed-three-platform-voucher-20261105`, based on latest `origin/main` `0e4a22a941e643ef09e5fff4dbff6abb5822aa86`. Calculator/Package integration queue inspected: unrelated draft Xero and Fake Seller PRs remain outside this release. Selectively carries the accepted three-period implementation, not the entire Staging branch.

## User-visible behavior
- Calculator always compares Normal Day 1st–15th, Campaign Day, and Normal Day 16th–End. Package creation later chooses a whole-month price or three-period prices.
- One Excel layout contains Original Price and all three Discount Prices, 20 inventory items, Product Library, and protected Calculator evidence. Existing package history remains intact.
- Batch Upload defaults to **By Product Name**, retaining By SKU.
- Dashboard and existing-package recalculation read the selected authorized store's three exact Platform Voucher averages from Supabase, rather than the older embedded presets. Missing data stays missing; a real 0% remains valid.

## Data and database review
Source: https://docs.google.com/spreadsheets/d/1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k/edit — Final!A2:D36. Source percentages converted once to percentage units; 35 source stores independently matched by canonical store and tenant in each environment. No MY voucher is copied into an SG/TH/PH project by name matching.

Database Structure owner review: `docs/reviews/platform-voucher-db-20261105.md`. Reuses store_voucher_presets with one nullable CHECK-bounded late_month_average column. No deleted data, altered privileges, historical package changes or customer credentials copied between environments. Before/after values, source rows, stable mappings, retrieval/import timestamp and SHA-256 are retained in `docs/data-imports/platform-voucher-20261105.json`. source_updated_at records this verified source retrieval; Sheet revision time was not established. Unmatched existing Berlanco preset is retained with unknown late-month value.

## Acceptance and evidence
- User's actual fixed Staging UI/UX and function acceptance: “OK 我刚刚确定了，全部没有问题了，我要你推去正式版” on 5 November. Production approval applies to this release; no renewed approval requested.
- 30 focused automated checks PASS: selected creation/handoff; three-period calculation, unified Excel in all six market combinations, 20 inventory slots, immutable original Calculator evidence, scoped live voucher reads, zero versus null, independent settings, partial failure, idempotent retry, price-update atomicity and rollback.
- TypeScript PASS; Next webpack production build PASS. Logs: /tmp/voucher-release-tests5.log, /tmp/voucher-release-tsc2.log, /tmp/voucher-release-build.log.
- Stage source import: 35 changed rows, 35 exact readback matches, 0 mismatches, 36 total including preserved Berlanco. Staging uses independent project ubjfuveoqbvouryldqfu.
- Agent browser QC was not repeated, as requested by the user. Automated checks are not represented as browser acceptance.

Fixed Staging: https://shopee-hub-v2-260731-git-cod-e05b8d-shopeehubctg-5199s-projects.vercel.app/
Production: https://shopee-hub-v2-260731.vercel.app/

Production release must use this feature's GitHub PR into main and Vercel's automatic deployment. Exact PR, merge SHA, Production deployment and live data readback are recorded in the delivery after execution, not assumed by this note.

## Limits
The source currently has no Berlanco row, so its missing late-month voucher requires input; no percentage is guessed. Calculator computes MY recommendations; other market manual prices remain independent. Existing saved package prices are not automatically replaced when voucher presets change. No schedules are created or resumed.
