# Store links and Ads Top Up List — release note

**Status (29 Sep 2026): Production app merge and deployment NOT YET done.** [PR #8](https://github.com/shopeehubctg-hub/shopee-hub-v2/pull/8) is the release candidate; application code at `9a2e3d6` was tested.

Super Admin Add/Edit Store manages store and project group links, optional project Drive links, the default store Drive link, and Ads Top Up List ownership in Supabase. Dashboard and Live Calendar read the managed directory instead of the old Link Directory Sheet. FullAd and AdBalance remain separate advertising sources.

**Verified:** build and 53 tests pass; Vercel Preview succeeded. The schema-only Supabase migration was applied. Post-migration counts are 44 stores and 43 profiles. Known SUPU and Mizino link records were corrected, with 44 project rows confirmed. SkinDae SG is absent from the old Sheet, so its links and owner remain unfilled rather than guessed. The user reported that the old Sheet sync triggers are disabled.

**Still required:** resolve the actual Add/Edit Store visual and live-write QC gate, merge PR #8, deploy the application to Production, and check customer views and permissions. No actual UI or live write has been verified for this candidate.
