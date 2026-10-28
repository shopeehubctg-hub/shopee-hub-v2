# TH/PH Add Store Rate Card setup

## Changes

- Fixed Staging Add Store shows the shared Account setup for MY, SG, TH and PH, including company, client type, effective Invoice Month, Rate Card and secondary custom fee controls.
- TH/PH use the same active, month-effective MYR Rate Cards as Account. Card identity, exact version, tier caps and effective month are retained by the v2 setup payload. No client type or rate is automatically inferred.
- THB/PHP source amounts use the confirmed preceding-Service-Month BNM policy. Fees, tier thresholds and caps remain MYR; SG fixed3.2 does not carry into TH/PH.
- Market/client-type changes preserve company and month while clearing incompatible card/version/FX choices. Month changes resolve the applicable card version. Deleted, unavailable or stale versions fail validation.
- The BNM field and Rate Card editor share one Invoice Month; the duplicate FX month input is hidden inside the combined Staging setup.

## Persistence boundary

Account persistence remains explicitly deferred by the user. The Staging form does not create a store while omitting its Rate Card. Its save control remains disabled when Account saving is unavailable, and the authenticated v2 API still returns503 with no Store write. Production continues its previously released store-only flow.

This delivery adds the requested selectable, validated Staging setup; it does not claim Rate Card persistence or enable Account database migrations.

## Verification

- 34 targeted model, real React DOM, Store API, effective-month, FX and shared Rate Card linkage tests PASS.
- Actual TH/PH Staging form tests select Internal Rate Cards, verify MYR caps and BNM quotes, assert one Invoice Month input, and prove no POST is emitted while persistence is unavailable.
- API guard tests include MY/SG/TH/PH v2 requests, all refused without partial Store creation. Production store-only Add/Edit regression remains covered.
- TypeScript PASS. Full build/Preview status recorded in the delivery report. Actual visual acceptance and final post-visual QC remain pending.

Review: https://shopee-hub-v2-260731-git-cod-e05b8d-shopeehubctg-5199s-projects.vercel.app/?section=permissions
