# Weekly Live Leaderboard

Database Structure review: PASS. Reuses canonical live_leaderboard_snapshots; only independent Stage schema created. Production unchanged; no business records copied. Stage service_role SELECT only; RLS enabled, no public grants.

Overview uses authenticated tenant, active Super Admin and exact weekly Monday-Sunday MYT period. Default last completed week; current week reachable with next. No MTD fallback. Existing Production has two partial month_to_date snapshots and zero weekly snapshots as checked 29 October 2026. Await weekly import; never infer weekly sales from monthly totals.

Validate eight unique/disjoint shop usernames, safe nonnegative integer cents and observed total. Zero differs from missing. Partial rankings explicitly incomplete, tied values share rank. No original payloads, URLs, file names, contacts exposed. Unmapped source usernames remain readable instead of fabricated canonical store IDs. Future importer must provide weekly start Monday/end Sunday and exact same contract. Imports remain separately owned; this change is read-only.

Validation: 12 model/API/component/regression tests PASS; TypeScript PASS. Actual Stage visual review and final function QC pending deployment.
