# Wisdom Factory — authorised Staging connection

The user explicitly authorised the independent Staging Xero app to read WISDOM FACTORY SDN BHD and persist only the necessary Invoice, payment and outstanding fields for Shopee Hub, Shopee Hub Internal, Tik Tok Hub and Lazada Hub in independent Staging Supabase. No Xero accounting mutations or Production deployment are authorised.

## Verified configuration and consent

- Independent app: Shopee Hub Dashboard Staging (`f507678e-99a0-4f8e-b399-c7b4ece1f6aa`).
- Pinned organisation: `eef31301-39b8-4208-83b0-473f0fa46e12`, verified against the visible Xero organisation selector and successful Dashboard OAuth callback name.
- User generated the client secret and saved it directly to Vercel Secret, staging branch only. Values were not printed or copied to source.
- Independent token-encryption key was generated in memory and saved as a branch-scoped Vercel Secret without a local secret file.
- Dashboard consent requested `offline_access`, `accounting.invoices.read`, `accounting.payments.read`, `accounting.settings.read` only. User completed final organisation consent.
- Callback returned `xero=connected`; Account displayed WISDOM FACTORY SDN BHD.
- API Explorer's organisation consent requested broad write scopes. It was cancelled without approval; no such organisation grant was made.

## First sync and operational recovery

- No completed sync or financial snapshot was present after the first failed HTTP request.
- Old failure handling used an error code rejected by the DB, leaving a run in running state until its lease expiry.
- A reviewed, exact-ID/lease/epoch CAS operational repair marked only that run failed and appended one clearly labelled operations audit. It did not delete or modify connection/token/session/snapshot data, alter the watermark, or remove the original lease/history.
- The original source failure was unconfirmed; the repair classification must not be interpreted as proof of invalid Xero accounting data.
- Failure handling now uses DB-supported codes. Diagnostics record only fixed phases and allowlisted error codes, never unknown messages, tokens, raw source responses or customer data.
- The revised complete test suite passed 38 tests. Actual successful financial-data sync and connected-state UI/QC remain pending.

## Database Structure review

Owner approved the explicitly authorised import boundary: canonical tenant ownership, five RLS-protected source tables, server-only RPC access, complete-snapshot publication and fixed tracking scope. Pure other-department/unknown documents are excluded before persistence; mixed documents are minimal pending entries without arbitrary amount allocation. Raw contacts, bank details and line descriptions are not retained.

## First successful financial sync

Actual fixed Staging completed its October2026 sync at 21:06:37MYT on 1November2026. Four canonical Projects were resolved to stable tracking IDs (explicit TikTok spelling alias, ambiguity rejected). Period-scoped complete payment windows, selected-month invoices, all outstanding invoices and payment-linked invoice records replaced the unbounded history read while preserving shared call/row budgets. No partial snapshot is published.

Observed totals: invoiced MYR91,043.07; October receipts MYR65,754.02; today receipts MYR0.00; all-invoice-month outstanding MYR107,495.44;0 pending tracking invoices;37 October payment rows. Database aggregate verification and connected UI/QC are separate gates.49 focused tests pass. UI review requested compact, nonwrapping financial/date columns before PASS.

### Database owner actual readback

Stage run `40882388…` succeeded in5.50seconds; exactly1 snapshot, validator=true, four pinned trackingIDs verified. Invoice split:Lazada5/Shopee11/Internal35/TikTok2. No duplicate IDs, wrong-scope records or wrong-month payments. Invoice gross91,043.07 = paid45,005.47 + credited760.66 + due45,276.94; tax6,743.99. October37payments sum65,754.02. All53 lifetimecash fields null because lifetime payment history was not claimed complete. Successaudit1; connectionconnected, error/retry null. Today0/all-open107,495.44 matched snapshot outputs; these two aggregates were not independently rebuilt from a persisted full source ledger.
