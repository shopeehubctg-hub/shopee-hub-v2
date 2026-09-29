# Store Management Staging — 29 Sep 2026

Commit: `07c7cb3` on `codex/admin-store-management`.

- Super Admin can add a store with Store name and Market only, and edit the display name of an existing store. Store ID, market, BigSeller source name, and customer permissions are unchanged by rename.
- Dashboard uses the registered display name while continuing to resolve advertising balance, product catalog, contacts, and top-up ownership through the original Link Directory identity.
- Price Calculator defaults Commission Fee to 0% when no product commission data is imported.
- Local verification: TypeScript, build, and 19 tests passed. No real store was created or renamed during testing.

Release dependency: apply `supabase/migrations/20260929073136_store_display_name_override.sql` before deploying the app. Admin edits write `stores.display_name`, while the existing Link Directory sync continues updating `stores.name` as a source identifier. The override survives scheduled sync without changing the installed Apps Script.

UI/UX visual review and post-review functional QC remain pending. This preview has no separate Supabase branch, so a write in Preview may affect the live database.
