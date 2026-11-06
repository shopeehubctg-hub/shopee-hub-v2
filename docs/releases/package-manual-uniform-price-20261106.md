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

Staging code: `40f8f25004dd41e5fb2a28c678ab1ee049e2b21e` on the integration branch; other queued Staging work is preserved.

UI/UX: PASS for this targeted fix. The user reviewed the actual fixed Staging manual form and confirmed the unwanted selector is absent in the screenshot supplied on 7 November 2026 at 00:08 MYT. No CSS or layout tokens changed.

Targeted Function QC: PASS. In the ordinary Staging test account and TEST Control MY store, required-field validation was exercised, corrected, and followed by a successful manual draft save. After refresh and store reselection, the draft retained Original Price RM999, Disc Price RM88, and November 2026 dates. History retained the Normal/Campaign schedules and recorded the test account without inventing Calculator provenance. The two component interaction tests cover the manual payload and the retained required choice on genuine Calculator handoffs; the ten existing regression tests cover linked three-period/Excel/repricing behavior. This is targeted validation of the changed condition, not a claim that unrelated Dashboard modules were re-audited.

Database Structure Review: not applicable; no database-dependent implementation or schema change. The synthetic Staging draft is retained. No Production records, authentication settings or scheduled tasks are changed.

Production authorization: received from the user, followed by Staging visual confirmation. Release route: this feature's GitHub PR into `main`, then Vercel automatic Production deployment and a read-only smoke check. At this note's commit, the PR merge and Production deployment remain pending; final deployment evidence will be reported with the PR and Production commit.

Known risk: manual and Calculator entry paths share the form. The explicit Calculator provenance guard and its regression test preserve the existing Calculator source-choice requirement. No 2FA enrollment is needed for this release.
