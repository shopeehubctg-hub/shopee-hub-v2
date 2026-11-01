# Xero read-only Account integration

This integration is a separate source view. It never creates Account assessments, invoices, receipts or Rate Card assignments and never sends accounting mutations to Xero. Only the four approved `Projects` tracking options are in scope: Shopee Hub, Shopee Hub Internal, Tik Tok Hub and Lazada Hub. These are invoice line tracking options, not the Xero Projects API.

## Environment and authorization

Staging requires its own Xero Web app, callback on the fixed Staging origin, a test/demo organisation allowlist and independent token encryption key. The existing app with a Production callback must not be configured on Staging. Wisdom Factory's live organisation and Production tokens/credentials must not be copied into Stage. Missing configuration remains visibly disabled.

Server configuration (never client-prefixed): `XERO_ENABLED`, `XERO_SANDBOX_ONLY` (Stage), `XERO_APP_ID` (Stage app management ID), `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI`, `XERO_ORGANISATION_ID`, and `XERO_TOKEN_KEY` (canonical base64 encoding of independent random 32 bytes). Never put real values in code, documentation, logs or screenshots. A change of key/environment/tenant/organisation must not silently decrypt or adopt another connection.

All routes require an active `j-packaging` Super Admin, signed Dashboard session and Account verification. Connect and sync require same-origin POST. OAuth state is short-lived, hash-stored, actor/session/tenant/environment bound and consumed once. Token ciphertext uses AES-256-GCM with authenticated environment/tenant/organisation binding. Access and rotating refresh tokens are stored atomically under refresh lease/CAS, never sent to the browser.

## Data meaning

- Posted ACCREC invoices only. Draft, submitted, voided and deleted records do not count as invoices or cash.
- An invoice is eligible only when every line resolves to the same one of the approved tracking options. Mixed or missing tracking remains pending. No full-invoice allocation to an arbitrary project.
- Invoice gross, tax, outstanding, allocations and actual cash receipts remain separate. Credit notes, prepayment and overpayment allocations are not cash receipts.
- Preserve decimal strings and separate currencies. Never sum raw currencies as MYR or label store sales as company income.
- Successful snapshots are published atomically only after all required pages and validation finish. Errors/rate limits keep the last successful snapshot with its timestamp; they never publish partial zero totals.
- Store only in-scope validated fields and minimal pending reasons. Do not persist unrelated invoices, raw contacts, bank details, line descriptions or unfiltered source responses.

## Delivery gates

Database Structure implementation/release review, synthetic Stage tests, actual UI/UX PASS and final function QC are required. No live Xero app/organisation authorization or Production release is implied by local checks. The fixed Stage URL remains the sole reviewer entry.

Official references: [OAuth flow](https://developer.xero.com/documentation/guides/oauth2/auth-flow/), [scopes](https://developer.xero.com/documentation/guides/oauth2/scopes/), [token handling](https://developer.xero.com/documentation/best-practices/data-integrity/managing-tokens/).

## Current sync bounds

The current release uses explicit sync plus a five-minute refresh while the connected Account page is visible. Failed requests pause automatic attempts until an explicit retry; unattended background sync is not enabled. A sync scans at most 20 pages of 100 invoices and 20 pages of 100 payments. Reaching that bound or observing duplicate page IDs fails closed and preserves the preceding successful snapshot. This is not an unlimited-history import. Snapshots are currently keyed by their requested month; another month requires a successful sync rather than relabeling prior results. The recorded cutoff is sync start time, not a claim of incremental completeness.

The Projects selector filters the invoice/payment lists; headline totals explicitly cover all four projects. Entirely unknown or outside-department documents are excluded before persistence; mixed documents with at least one approved tracking ID remain minimal pending entries.
