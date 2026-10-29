# Live Sales Leaderboard

Weekly/Monthly toggle; Monthly default. Weekly exact Mon-Sun MYT, default last week; monthly reads latest month_to_date snapshot by period_end descending then synced_at, bounded to selected month and current MYT date. Never sum cumulative snapshots. No schema changes. Production unchanged. Missing displays 0 by explicit user request, retains observed:false internally, source rows/totals unchanged. Ties share rank. Empty selected period may reuse same-tenant latest roster names only, all display0, no rank/winner/no freshness and statuspending; no crossperiod amounts.

Database Structure design review PASS. API activeSuperAdmin+tenant, bounded read, no source payload/file/URL output. IndependentStage schema from prior release,0records until copy expresslyauthorized. Tests13PASS andTypeScriptPASS. ActualUI/UXthenfunctionQC required; mobile/populatedactual checks cannot beclaimed from code tests.
