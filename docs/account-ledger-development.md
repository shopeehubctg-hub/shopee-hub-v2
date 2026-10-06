# Account billing ledger: development scaffold

The first billing cycle is October 2026, assessed from September statements. Invoice month, statement month, service period and collection date remain separate. Terms and fee calculations are unconfirmed until backed by a commercial reference; NEW VER alone does not activate a fee rule. No financial records are seeded.

GET /api/admin/account?invoiceMonth=2026-10 is Super Admin only and tenant scoped. Decimal amounts are JSON strings. Billed means issued gross less evidenced credits. Collected for the invoice cycle means allocated cash minus allocated refunds for those invoices; Today and This Month use actual collection dates in Asia/Kuala_Lumpur, including verified unallocated receipts. Outstanding and overpaid are evaluated invoice by invoice. Missing records remain null. A missing migration returns not_configured; permission, network and reconciliation failures remain errors.

The migration is local only. Direct browser roles have no financial table grants. Server access is read only. Roster provenance, commercial terms, statement/invoice/receipt evidence and audit data remain internal; the billing entity is displayed to Super Admin for identification. Commercial term JSON must preserve basis/rate/caps/minima/tax/confirmation; no fee calculation is implemented until those terms are agreed. Invoice lines preserve service/setup/additional/tax/credit breakdown for the future import.

Before adding ingestion, implement transactional validation of confirmed effective terms and statement evidence, currency equality, receipt allocations not exceeding receipt amounts, invoice-line reconciliation to net/tax/gross/credits, idempotency and immutable audit writes. Add constrained write grants only for that reviewed flow. No POST, live database mutations, Production deployment or full P&L/cost accounting is included. A separate Staging database is required for actual save/sync tests; do not test writes against shared Production.

The current `store_id` on a term represents a resolved billing unit only. Roster projects can cover multiple stores, and a store can belong to multiple projects. LIVACT MY, ILADY SG, ZEERO SG and shared MIZINO PLACENTA/Slimpro mappings require explicit allocation evidence. Keep unresolved mappings null; design a billing-unit/store junction and allocation rules before importing those cases. No automatic name matching is enabled.

Read performance: this initial read-only scaffold paginates tenant ledger reads (500 rows per page; fails explicitly at 50,000 rather than silently truncating). Before populated deployment, replace whole-history loading with month/cycle queries, selected-invoice allocation queries and current-collection-period receipts; preserve cross-period collections and allocation reconciliation. No realtime subscription or ingestion is configured yet; UI refresh can only show data that has actually been persisted.

## Audited October roster display

The server-only reviewed roster snapshot is visible only to the verified `j-packaging` tenant's active Super Admin, for October 2026 invoices / September 2026 statements. It contains 58 candidate billing units (45 MY, 13 SG); all financial amounts remain unknown and source evidence has not been imported. Candidate store IDs remain null until confirmed. Snapshot review time is `rosterUpdatedAt`; financial `updatedAt` remains separate. It is not a live Sheet feed.

When a ledger is partly populated, rows join only through `account_store_terms.roster_key` equal to snapshot row ID. Unrepresented roster rows remain pending, without changing recorded invoice/receipt amounts. Names and aliases do not bind financial records. Missing mapping, multiple historical candidates and shared store cases are retained visibly. Internal raw roster/source fields and project IDs are excluded from the API response.

## Canonical Store Mapping labels

Account candidate labels now come from the current tenant's canonical global selector registry (`display_name ?? name`; duplicate alias IDs filtered by `canonicalStoreId`). Reviewed historical MAP IDs are linked to selector IDs in `app/account-selector.ts` for presentation only. This leaves the roster row's financial `storeId`, mapping status, terms confirmation and amounts unchanged. Later selector renames therefore appear immediately in Account. Removed/unknown selector identities return no stale historical label. SG identities never fall through to a similarly named MY store. Shared historical candidates remain separate records even when their displayed store name is the same.

Current unresolved presentation cases: MY MIZINO CHOCOLATE/HUMEAL have no audited candidate ID; Winsense MAP0077 and LivAct By Naturelish MAP0015 are absent from the current selector. All SG roster candidates except SkinDae SG MAP0042 are absent from the current selector, including MOESIE SG with no candidate mapping. They must not be silently rebound to MY stores.
