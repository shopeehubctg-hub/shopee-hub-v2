# Store Management release — 29 Sep 2026

- Super Admin can add a store with Store name and Market only, and edit the display name of an existing store. Store ID, market, source names, and customer permissions are unchanged by rename.
- Dashboard uses the registered display name while continuing to resolve advertising balance, product catalog, contacts, and top-up ownership through the original Link Directory identity.
- Price Calculator defaults Commission Fee to 0% when no product commission data is imported.
- `Humeal Malaysiaa` (`shopee-humeal-malaysiaa`) was removed from Production at the user's request. No advertising, package, or live-session records were attached; its one customer store-access row was removed by cascade. Post-delete query returned 0 store and 0 access rows.
- Verification before deployment: TypeScript, build, and 21 tests passed after integrating current `main`. No test store was created or renamed.

The `stores.display_name` migration was applied to Production before app deployment and confirmed present, with 0 renamed rows initially. Admin edits write only this override, while the existing Link Directory sync continues updating `stores.name` as a source identifier. The override survives scheduled sync without changing the installed Apps Script.

The user reviewed the Staging form and confirmed the UI before authorizing Production. Function QC passed based on code review, TypeScript, build, and focused tests; an authenticated end-to-end write was not run because Preview shares the Production database. Post-deployment read-only smoke checks remain required.
