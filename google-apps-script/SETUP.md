# Google Sheet → Supabase sync

Target spreadsheet: `Shopee Ads Report` (`Sheet1` and `FullAd`).

`Sheet1` is optional. If it is absent, the script skips Ad Balance and still syncs `FullAd` performance data.

1. Apply `supabase/migrations/20260921090000_google_sheet_ads_sync.sql` to Supabase.
2. In the spreadsheet, open **Extensions → Apps Script**.
3. Replace `Code.gs` and `appsscript.json` with the files in this directory.
4. In **Project Settings → Script Properties**, add:
   - `SUPABASE_URL`
   - `SUPABASE_SECRET_KEY` (prefer a dedicated `sb_secret_...` key named `google_sheets_sync`)
5. Run `testSupabaseConnection` once and approve the requested scopes.
6. Run `syncAdsToSupabase`; verify `_SyncLog` shows `success` or only known alias warnings.
7. Run `installDailyTrigger` once. It replaces previous triggers for `syncAdsToSupabase` and schedules daily runs near 9:05 am and 5:05 pm Kuala Lumpur time. Google time triggers can fire about 15 minutes before or after the chosen minute.
8. Confirm the Apps Script **Triggers** page shows both time triggers. After a late run, check `_SyncLog` and verify the latest `performance_date` and store coverage in Supabase.

Every `full` log entry includes `sourceLatestDate`, the newest business date seen in `FullAd`, as well as the number of matched rows and unmatched store names. A `failed` entry records a caught sync error. A `warning` entry can also mean unmatched stores; inspect its detail before treating it as a failed run.

The late run catches `FullAd` rows added after the morning run. Repeating the sync is safe for existing rows: the script upserts on `store_id,performance_date` and refreshes their metrics and `synced_at`. Both runs currently read the whole `FullAd` sheet, so monitor Apps Script execution time as the history grows. Changing this repository copy does not update the bound Apps Script project; paste the revised files and run `installDailyTrigger` there to activate the second trigger.

The secret key is intentionally stored only in Script Properties. Never place it in a Sheet cell or commit it to source control.
