# Fixed Staging candidate

1 November 2026 — combined candidate authorized by the user in the Dashboard coordination chat.

- Existing integration base: `11c8236810287e46e39b9392d97e97787d69c54a` (Xero read-only integration and diagnostics retained in full).
- Package queue candidate: `codex/package-normal-first-20261101` at `5d564c64c2671280173596a749064598e39ad46d`, based on main `d511d8b`.
- Package change: render Normal Day before Campaign Day in List View prices and Effective Dates; no data writes or schema changes.
- Fixed entry: https://shopee-hub-v2-260731-git-cod-e05b8d-shopeehubctg-5199s-projects.vercel.app/
- Supabase: independent Staging `ubjfuveoqbvouryldqfu` only.
- Automated package checks passed; actual combined UI/UX and final QC are pending.
- Production PR / merge / release remain pending user approval.
- Next Package queue request: allow future-package start edits and lock started-package start dates; separate feature branch after the preceding Package change is merged into main. Do not develop overlapping Package changes on independent stale baselines.
