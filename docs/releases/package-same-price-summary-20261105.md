# Same-price package summary — 5 November 2026

- Feature branch: `codex/package-same-price-summary-20261105`, based on `origin/main` `fed634cc32b3743c120c820122a491ff985c16b0`.
- Scope: Packages & Pricing presentation only. When early-month, Campaign and late-month Original/Selling prices all match within one market, show one shared price and one Normal period. Keep distinct prices separate. Grid and three-period List use the same summary.
- Cause: the three-period rendering branch returned before the existing same-price grouping. It now checks all saved Normal and Campaign prices, including both Normal halves, before selecting the detailed rendering.
- No database, saved pricing, dates, Calculator evidence, inventory, History, permissions, API or schema changes. No customer data copied into Staging.
- Automated evidence: 9 summary checks cover long-term, multiple months, distinct prices, distinct Original prices, multiple recurring events, missing Campaign prices, independent MY/SG grouping, legacy cards, Grid/List and unchanged inputs. The 10 existing three-period pricing tests and TypeScript checks also pass.
- Existing unrelated test limitation: `package-country-filter-interaction.test.mjs` fails on its old Fulfillment checkbox selector at line 28; the same failure was reproduced on the unchanged release baseline. No unrelated test or functionality was changed to hide this failure.
- Fixed Staging: https://shopee-hub-v2-260731-git-cod-e05b8d-shopeehubctg-5199s-projects.vercel.app/?section=packages . Preserve current permissions/Xero candidate.
- Actual UI/UX and final Function QC: pending user review. Automated component checks are not visual acceptance. No browser takeover performed.
- Production PR, merge and release: not executed for this fix; awaiting Staging review and user approval. Current Production commit remains `fed634cc32b3743c120c820122a491ff985c16b0`.
