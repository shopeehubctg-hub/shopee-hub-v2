# Store directory cutover

## Scope

Super Admin Add/Edit Store now maintains project group links (one row per project), optional project Drive links, the store group link, the default Google Drive link, and the Ads Top Up List owner in Supabase. Dashboard and Live Calendar no longer fetch the Link Directory Sheet. FullAd and AdBalance remain separate advertising sources.

## Source check, 29 September 2026

- Source tab `WhatsApp Group`: 45 nonempty rows, 44 distinct store names, 45 project links.
- Supabase before cutover: 44 registered stores, 43 store directory profiles and 43 project rows.
- `SUPU • 食补` is registered as `Supu` but its profile lacks links and owner. The migration fills it by registered store ID.
- Mizino Premium has two projects with separate Drive folders. The migration gives the project rows their own Drive values; the existing store Drive stays the default.
- `Naturelish Humeal by CTG4u` exists in the Sheet but has no registered store. It is not auto-created. This is distinct from the previously removed `Humeal Malaysiaa` record.
- SkinDae SG is registered but has no directory profile; it can be filled in the new Super Admin editor.

## Release sequence

1. Disable the bound Link Directory Apps Script's `onLinkDirectoryEdit_` and `syncLinkDirectoryToSupabase` installable triggers. Confirm there are no subsequent executions. The old script upserts store profiles and deletes/recreates project rows every run, so it would overwrite admin edits.
2. Apply `20260929180000_store_directory_dashboard_management.sql` to the connected Supabase project. Verify nullable `source_sheet_id`, the new project `google_drive_link` column, SUPU's profile/project, and Mizino's two Drive links.
3. Publish the reviewed application commit. Check the Super Admin Stores screen, all 44 registered stores, existing links and owners, permissions, and read-only customer views.
4. Create a new store and edit an existing store with controlled test data only after the production schema is ready. Confirm data persists across reloads and that unauthorized users cannot write.
5. Keep the Link Directory Sheet as a read-only historical reference until the new flow is verified; do not re-enable its triggers.

The Staging preview shares the Production Supabase project, so reviewers should inspect its forms without saving test records.
