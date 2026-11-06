# Manual whole-month package price

Feature: `codex/package-manual-uniform-price-20261106`, based on `45abc8d2c944b5194b2ea6f83139579843fa96c0`.

When creating a package manually, selecting Same Price All Month no longer displays or requires Whole-month Price From. The entered Disc Price applies to the saved Normal and Campaign schedules. Calculator handoffs with three recommendations still require their source choice and retain the original calculation snapshots.

Scope: `app/package-control.tsx`. No API, database structure, stored customer data, pricing formula or historical records change.

Validation completed before Staging integration:
- Two component interaction tests: manual save payload and Calculator required-source/provenance preservation.
- Ten existing three-period pricing/Excel/repricing regression tests.
- TypeScript and full Next.js webpack build PASS; `git diff --check` PASS.
- Local default Turbopack build cannot traverse the shared external node_modules symlink; webpack build succeeds. This local dependency layout is not part of the committed change.

Fixed Staging: https://shopee-hub-v2-260731-git-cod-e05b8d-shopeehubctg-5199s-projects.vercel.app/

Actual Staging UI/UX and Function QC: pending. Tests/build do not constitute these gates. Production PR, merge and deployment are not executed; this fix needs Staging acceptance and explicit Production approval.
