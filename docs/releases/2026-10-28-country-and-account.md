# Country filtering and permanent Store Account setup

Package & Pricing Country selection now uses the same button group as status and package type. All Countries, Malaysia, Singapore, Thailand and Philippines combine with search, status and duration in Grid and List. A country view narrows displayed prices without removing other-country data from an edit or whole-package action.

Super Admin Add Store saves canonical store details, directory links, company, client type, exact Rate Card version, effective Invoice Month and FX policy together in one transaction. MY/SG/TH/PH setup bills MYR. SG Internal keeps fixed3.2; SG External explicitly chooses fixed3.2 or service-month BNM; TH/PH use service-month BNM. Runtime averages are resolved each month rather than frozen at onboarding.

Rate Card catalog edits and Monthly Rate assignments now persist and reload. Card updates retain earlier versions, company/mapping changes retain earlier months, and batch updates fail together. Manual amount calculations and locked calculation previews remain session-only. These configuration changes do not create invoices, receipts or income.

The dedicated Database Structure owner and reusable review checklist are documented in `docs/database-structure-management.md`. The migration uses four distinct configuration/history structures and reuses existing Store and directory identities.

All agent Delete actions require the user's explicit approval first. Project link synchronization uses UPSERT; removing an existing child link is rejected pending approval. No Delete or archive operation was executed for this release.

Validation before Staging: 171 focused model/API/React DOM/Package/Store regressions, TypeScript, targeted changed-code lint and full build PASS. Actual SQL scenarios passed in isolated Staging and Production using transactions rolled back afterward; original45 Production stores remained unchanged, with7valid card templates and no initial billing assignments. UI/UX and final functional QC evidence and final deployment SHA are recorded in the delivery report after review.

Migration: `supabase/migrations/20261028031253_account_store_setup_v2_persistence.sql`. Existing unapplied Account migrations are historical alternatives, not additional prerequisites; do not blindly apply them or delete them without the required approval.
