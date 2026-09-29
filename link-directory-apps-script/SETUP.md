# Link Directory → Dashboard Store Selector

Target spreadsheet: `Link Directory`, spreadsheet ID `1iMNKdNs5tqgXgWUQhtg-UhWcb0mP3SlGYbTOyx4avkc`, tab `WhatsApp Group`.

1. Open **Extensions → Apps Script** in the target spreadsheet.
2. Replace `Code.gs` and `appsscript.json` with the files in this directory.
3. In **Project Settings → Script Properties**, add `SUPABASE_URL` and `SUPABASE_SECRET_KEY`.
4. Run `testSupabaseConnection` and approve Google authorization.
5. Run `prepareLinkDirectoryColumns`. This adds `Store ID` and `Market` without changing existing columns.
6. Check any blank `Market` cells and select `MY` or `SG`. New stores are intentionally skipped until this is set.
7. Run `syncLinkDirectoryToSupabase` and confirm `_LinkDirectorySyncLog` reports success.
8. Run `installLinkDirectoryTriggers` once. It installs an edit trigger and a five-minute recovery trigger.

The Store ID column is the stable identity. Edit the Dashboard display name in Super Admin → Permission Settings → Stores; this sync preserves that name for existing stores. The Sheet store name continues to identify source data and links. Do not delete or manually change an existing Store ID.

`KATA Care Malaysia` remains excluded. `Kata Skincare Malaysia`, `Kata Skincare Singapore`, and `Supu` have fixed IDs; Supu is fixed to MY.

The Supabase secret belongs only in Apps Script Properties. Never place it in a cell or commit it.
