# Account billing integration — Xero mapping

## Approved scope

The user approved mapping and integration of Xero invoices into the existing Billing Records on the same fixed Staging entry. Production is not authorised. Existing live-Wisdom Staging permission remains limited to necessary records from Shopee Hub, Shopee Hub Internal, Tik Tok Hub and Lazada Hub. No Xero accounting write or deletion is part of this change.

## Ownership and financial semantics

- Canonical billing client remains the existing Account roster key and `account_billing_unit_versions`; Store Selector IDs and month-effective fee/FX history remain the owners of commercial setup.
- Source identity is tenant + independent Xero connection + ContactID + tracking category/option IDs. Department tracking alone, display names and exchange-rate assumptions never allocate money.
- Exact unique company/entity/client/store-name matches are suggestions. Only a saved source mapping allocates invoice amounts to a client. Ambiguous or missing mappings remain pending and retain their unallocated totals.
- Billing rows show the selected Invoice Month's invoice cohort. Invoiced is invoice gross; Received is Xero AmountPaid (paid/applied, not a claim of lifetime verified cash); Outstanding is that cohort's current AmountDue. Credits remain separately inspectable and gross = paid/applied + credits + due.
- Summary receipt totals follow actual payment dates, including receipts for older invoices. They must never be confused with the invoice cohort's AmountPaid. Source summary and existing legacy ledger are alternative sources, never additive.
- Financial currency follows Xero. An SG store's setup may use SGD source sales and MYR billing; neither fact relabels ledger records. Multiple actual currencies remain separate.

## Persistence and retries

One append-only `account_xero_mapping_versions` source association table references existing billing unit version identities. Its first assignment may materialise a missing historical billing identity with a mapping-only version, no fee or Rate Card. Existing same-month/earlier setup is reused; scheduled future versions are preserved.

Server-only invoker RPCs enforce active tenant Super Admin, persisted primary session and Account unlock. A batch validates the latest selected-month source snapshot, verified company/project identities, canonical tenant stores and both source/target versions. Save, history and audit commit atomically. Exact retries reuse the shared request ledger; changed client intent conflicts. No GET mutates mappings.

Minimal source company labels are retained only alongside eligible four-project invoice identities. Emails, phones, bank information, raw Contacts records and raw source payloads are excluded.

## Delivery gates

Feature branch `codex/account-xero-billing-mapping` starts from current main and integrates the reviewed Xero dependency. The Package candidate already on Staging must be preserved. Before any shared branch update, inspect its current head and use a compare-and-swap lease.

Fixed Staging: https://shopee-hub-v2-260731-git-cod-e05b8d-shopeehubctg-5199s-projects.vercel.app/?section=account

Actual UI/UX review, then final functional QC, are required after deployment. Tests alone are not acceptance. No Production merge or release is authorised by this document.
