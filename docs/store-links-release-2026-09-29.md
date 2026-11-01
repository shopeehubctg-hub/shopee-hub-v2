# Store links and Ads Top Up List — release note

**Status (29 Sep 2026): Published to Production.** [PR #8](https://github.com/shopeehubctg-hub/shopee-hub-v2/pull/8) was merged as `47e37fd`; Vercel reported a successful Production deployment. The [dashboard](https://shopee-hub-v2-260731.vercel.app/) served its login page.

Super Admin Add/Edit Store manages store and project group links, optional project Drive links, the default store Drive link, and Ads Top Up List ownership in Supabase. Dashboard and Live Calendar read the managed directory instead of the old Link Directory Sheet. FullAd and AdBalance remain separate advertising sources.

**Verified:** build and 53 tests pass; Vercel Preview succeeded. The schema-only Supabase migration was applied. Post-migration counts are 44 stores and 43 profiles. Known SUPU and Mizino link records were corrected, with 44 project rows confirmed. SkinDae SG is absent from the old Sheet, so its links and owner remain unfilled rather than guessed. The user reported that the old Sheet sync triggers are disabled.

**Production smoke checks:** unauthenticated Admin Store and Dashboard API requests returned 401. The user explicitly approved publishing without actual rendered Add/Edit Store review or a live authenticated save test; both remain unverified. SkinDae SG's links and owner still need real values entered by Super Admin.
