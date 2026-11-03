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

## Actual data discovery and invoice overrides

Actual Staging sync found40 Contact+Project source groups across53 October invoices.19 uniquely verified company matches were saved through the real UI, covering17 billing clients and19 invoices. The remaining34 invoices require review, including companies that bill several different stores.

Known ambiguous companies and unrecognised companies with multiple invoices must use per-invoice associations, never a company-level bulk allocation. The additive `source_invoice_id` column preserves existing associations and the original global source-group version sequence; no unique constraint is removed. Per-invoice effective associations take priority. Safe unique group defaults remain reusable; ambiguous old defaults are suppressed. Partial client totals remain labelled incomplete. Company-name punctuation is normalised for candidate detection, without fuzzy matching or arbitrary country/currency inference.

Invoice matching displays source invoice numbers with original Xero deep-links so the operator can verify the billing project before selecting a canonical client. No unsupported financial fact is manufactured to complete a mapping.

## Staging verification progress

- Actual real UI saved19 exact source mappings plus one reviewed NOMOQ association:20 mappings,18 clients,20 matched invoices;33 source invoices intentionally unassigned. NOMOQ persists after reload: MYR831.70 invoiced,0.00 paid/applied,831.70 due.
- Latest source snapshot changed as Xero receipts were updated: gross91,043.07; paid/applied46,191.07; credits760.66; selected-cohort due44,091.34; selected-month actualcash66,939.62. These are source-date observations, not static budget assumptions.
- Database owner independently reconciled mapped plus unassigned values, validated scope/history and confirmed no duplicated financial rows, no ledger writes and identity-only anchors without fee/card/FX invention.
- Full affected test run:105 PASS; TypeScript and targeted lint PASS. Original visible-page five-minute sync preserved with background/locked/unmount cleanup. Prior-day receipt values cannot be relabelled as today. Ordinary read polling preserves unsaved selections; saved/new-version reload resets choices before another write.
- Initial visual HOLD findings (dialog position, Credits wording, tiny new-table type) were corrected and actual desktop screenshots retaken. Final UI/UX and function QC follow the final fixed Staging commit. Production remains untouched.

## Final fixed Staging candidate

- Feature commit39365e642e0e401d9b8b730614b0ca073a4108c8; fixed Staging merge109e83801482de8cc7eacd83587cdf9fadf12e2a. Deployment dpl_BbAL1z3sZTcbS79k2qWDRoBoer66 Ready and fixed entry alias confirmed.
- Actual desktop UI/UX owner explicit PASS for109e838: `/private/tmp/account-billing-final-candidate.png`, `/private/tmp/account-invoice-final-candidate.png`; matching layout additionally inspected in `/private/tmp/account-integrated-invoice-matching-final.png`. No mobile acceptance claimed.
- Final function QC follows this UI gate; pending business decisions on33 unassigned invoices remain explicit, not treated as software-generated income or guessed store assignments.

### Final acceptance

Final Function QC owner explicit PASS after desktop UI/UX PASS for109e83801482de8cc7eacd83587cdf9fadf12e2a /dpl_BbAL1z3sZTcbS79k2qWDRoBoer66. Independent Node22 affected suite105/105 PASS; root TypeScript and targeted lint PASS. Actual browser draft-poll test preserved a selected but unsaved invoice mapping through a completed Refresh; draft was then cleared without Save. Actual bulk and reviewed manual saves persist across refresh.

Final read-only DB check:20 source mappings,18 clients,20 mapped invoices,33 unassigned. Snapshot validator true; duplicate mapping versions0; identity-anchor fee/card/FX violations0; ledger writes0. Ordinary/foreign/locked rejection is automated-test coverage, not an ordinary-user live login. Per-invoice save is covered by actual transaction rollback SQL and UI mocked POST, without guessing an unknown live business assignment. Mobile is not certified.

Fixed-entry health returned ready/staging/ubjfuveoqbvouryldqfu/databaseReachable=true. Remote main remainsd511d8bed6c11c3db5493d79336093eabde203a1; remote staging109e83801482de8cc7eacd83587cdf9fadf12e2a. No Production release or deletion occurred.
