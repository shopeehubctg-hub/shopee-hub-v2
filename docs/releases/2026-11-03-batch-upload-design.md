# Batch Upload design consistency — 3 November 2026

## Scope and branch
- Feature/release branch: `codex/release-batch-upload-design-20261103`, from current `origin/main` `1b0d347fb407ab443391c9cbfe6090987d9e2ba6`.
- Changes only `app/package-batch.css` plus this release record. CSS is byte-identical to the accepted fixed Staging file at `ea44156eb632fd7f88395a8350cb47bd5a360536`.
- Fixed Staging: https://shopee-hub-v2-260731-git-cod-e05b8d-shopeehubctg-5199s-projects.vercel.app/?section=packages
- Batch/Package queue checked: no competing open PR. Account/Xero and Fake Seller PRs remain separate. Calculator selected creation/repricing is not part of this release; its broader release QC remains pending.

## Release notes
Batch Upload now uses compact, consistent Noto Sans headings, body text, labels, buttons and fields across Upload, Review, Edit Details, Set Dates, Final Preview and failure dialogs. Desktop controls are 38px and mobile controls 42px; next-step actions remain black. Dates and preview cards use desktop columns and mobile stacking. Table scrolling remains contained on narrow screens.

## Evidence and gates
- Automated: 10/10 package-batch-workspace/save tests PASS; TypeScript noEmit PASS; Next webpack build PASS; diff whitespace check PASS.
- Actual fixed Staging: authenticated Upload, Review, Edit Details, Set Dates and Final Preview were exercised with two unsaved MY/SG packages; no database Create action was executed during CSS verification. Desktop/mobile DOM/CSS inspection recorded no document overflow. Fresh live inspection reconfirmed title 22px, controls 38px and labels 12px with no page alert.
- UI/UX PASS for this CSS scope. User then tested the supplied workbook and confirmed no problem, explicitly requesting Production release on 3 November 2026.
- Scoped Function QC PASS: upload/parsing, editing, date selection and preview retain their accepted behavior. Existing permission/store and save/retry regression coverage included in the ten automated checks; no application behavior was changed.
- Database Structure Review: N/A for this display-only release. No schema, API, data, credentials, sample records or scheduling changes.
- PR merge and automatic Production deployment: record actual IDs in delivery report after verification. No direct local/feature/Staging Production deploy is authorized or used.

## Risk and remaining work
No functional changes. Narrow-screen tables intentionally scroll inside their container. Reconstructed screenshots are DOM/CSS renders, not native screenshots. Separate Calculator selected/repricing candidate remains in Staging with its own pending full release QC. No files, records or feature branches were deleted or cleaned up.
