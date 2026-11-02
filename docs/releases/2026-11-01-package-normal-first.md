# Package List: Normal Day before Campaign Day

Feature branch: `codex/package-normal-first-20261101`, based on `d511d8b` (`origin/main`).

List View now displays Normal Day before Campaign Day consistently in every market's price cell and in Effective Dates. Dates within each price type run chronologically; markets retain MY, SG, TH, PH order. This sorts a copy at render time and does not change saved prices, dates, history, lifecycle, permissions, exports or API responses.

## Evidence and release gates

- Regression reproduced on the unchanged code with Campaign-first, interleaved four-market schedules.
- The regression passes after the fix; original source schedule order is retained.
- Existing List/Grid filters, selection, history failure/retry/store-switch isolation and read-only sample checks pass.
- Database Structure Review: not applicable; presentation only, no database/schema/data change.
- Staging: fixed entry only, integrated with the existing Xero candidate under the user's explicit combined-review authorization on 1 November 2026.
- UI/UX and function QC: actual fixed Staging verification is still required after deployment; automated checks alone are not acceptance.
- Production: pending explicit UI/UX PASS, function QC PASS, user authorization and a GitHub PR merge to main. No Production deployment is authorized by this document.

Known limitation: this fixes ordering, not other List View presentation or date-edit rules. Those are separate changes in the Package integration queue.
