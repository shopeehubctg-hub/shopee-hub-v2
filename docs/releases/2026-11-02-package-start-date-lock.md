# Package Start Date protection — 2 November 2026

Future unpublished/scheduled package periods remain editable. Once a saved Normal or Campaign origin reaches the owning store's current date, Edit / Modify keeps its Start Date read-only and allows End Date changes. Monthly extensions retain the original start. Long-term Normal periods now offer Set End Date; Campaign retains its existing end control. Starts equal to today and historical expired origins are protected too. The earliest start is tracked separately for each saved market/day type; later campaign months remain configurable. Draft/review packages are unpublished and are exempt.

The server locks the canonical tenant/store package row, rereads latest version and persisted prices, and rejects changed or missing started origins before inventory/version/audit writes. Stale editors cannot overwrite a concurrent edit or End action. Rejected operations return the existing Pricing & Promotion error format. No database migration, backfill, deletion or historical rewrite.

Branch: `codex/package-start-date-lock-20261102`, based on main `7c03f2c8d562c60b861c32d9d95bf014c432d151`.
Database Structure: `docs/package-start-date-db-review-20261102.md`; design and final guard review PASS, no migration. Staging/Production constraint drift is recorded there and not changed here.

Automated coverage: started/today/future/expired/draft origins; four markets; owning-store midnight boundary; end-only saves; immutable prior rows; group-removal/earlier-date bypasses; concurrent latest-version recheck; Edit versus End; Grid/All Stores UI; save/history, recurring, List ordering, lifecycle and access regressions. Existing new-package interaction fixture updated to the current Create Single Package / inventory picker UI.

Fixed Staging: https://shopee-hub-v2-260731-git-cod-e05b8d-shopeehubctg-5199s-projects.vercel.app/
Preserve the Xero/Account integration already on staging. Only this feature's files enter its main PR. Actual UI/UX and final function QC must pass before the already authorized Production merge. Production deploys automatically from the merged main PR.

Risks/limits: privileged SQL writes outside this API are not guarded; this does not migrate old dates or reconcile database constraint drift. Live PostgreSQL concurrency is represented by transaction/serialization tests, not a load test. Any synthetic Staging fixtures are retained because cleanup deletion is not authorized. No live customer package is changed by release verification.
