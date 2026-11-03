# Xero STORE NAME evidence — DB review, 2 November 2026

Database Structure **PASS** for the additive isolated-Staging validator contract. Actual source re-read, mapping review, UI/UX and final function QC remain separate gates.

## Contract and ownership

The existing immutable `xero_sync_snapshots.snapshot` owns source evidence. Eligible `report.rows[]` may add optional `storeNames:string[]`, mirrored exactly in `report.invoices[]`. Only explicit STORE NAME labels are extracted; raw Description is memory-only and is not persisted. Labels are bounded to 8 unique values, each 1–120 trimmed characters without controls, email or URL. An empty array means the refreshed invoice has no usable explicit label. An omitted field marks a legacy snapshot requiring refresh for store-name review. Pending/mixed/out-of-scope invoices cannot retain the field.

The existing append-only `account_xero_mapping_versions` owns the selected billing-unit target. Stable invoice/group mapping IDs are not replaced by a renamed company or a new suggestion. Missing, multiple, ambiguous or conflicting STORE NAME evidence remains uncertain. Exact normalized canonical client/Store Selector identities or expressly confirmed aliases may propose a target; source currency and company name do not manufacture a country/store identity. Existing manual invoice choices may confirm a genuine country ambiguity, but disagreements are surfaced rather than silently remapped.

No company/store table, column, index, foreign key, ledger row or business mapping is added by this migration. The existing tenant/connection source boundary, approved four Projects, actor/session checks, per-source global CAS, requests and audits remain unchanged. Multiple per-invoice overrides within one Contact/Project group use the same initial expectedVersion and serially append versions in one transaction; no separate version sequence or duplicate mapping entity is introduced.

## Implementation and actual Stage evidence

Migration `supabase/migrations/20261102033822_xero_invoice_store_name_evidence.sql` was generated through Supabase CLI and successfully applied only to `ubjfuveoqbvouryldqfu`. It replaces `xero_private.snapshot_valid(jsonb)` with backward-compatible strict validation; SECURITY INVOKER, empty search_path and service-only EXECUTE were verified. No Production write, Delete, archive or cleanup occurred.

Actual rollback-only suites under `SET LOCAL ROLE service_role` passed:

- `tests/sql/xero-invoice-store-name-evidence.rollback.sql`: legacy snapshots, empty/one/multiple labels, invalid types/blank/oversized/duplicate/unsafe/overflow labels, mirrored-list equality, rejection of raw Description, pending-row privacy and exact money reconciliation.
- `tests/sql/xero-billing-invoice-overrides.rollback.sql`: two invoice bindings sharing one Contact/Project baseline, atomic version increments, replay, changed/stale requests, per-invoice scope, tenant/session boundary and rollback after late failure.

Readback at 03:44 UTC: all 10 existing snapshots remain valid; 22 mapping versions and 21 billing-unit versions remain unchanged; no synthetic test tenant remains. No business mapping or registered name was changed by this work. Independent focused extractor/model/mapping-route/source tests: 54/54 passed, including valid-plus-invalid-label poisoning and no-raw-description persistence.

Before the new source refresh, the latest October snapshot had 53 eligible invoices and zero store-name evidence. It cannot prove a store match from Description. A new approved-scope source sync is required before producing the invoice-by-invoice uncertainty list or applying any reviewed mapping corrections.
