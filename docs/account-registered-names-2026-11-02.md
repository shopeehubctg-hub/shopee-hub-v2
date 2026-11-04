# Registered names — 2 November 2026

User request: label the existing Dashboard company as Registered Name (Platform), add Registered Name (Billing), and persist both in the database.

## Design contract

- Platform retains legal_entity / entity / legalEntity compatibility and existing values.
- Billing adds nullable billing_registered_name / billingEntity. Unknown remains null; no automatic Xero inference or bulk backfill.
- Nonempty Billing edits append a name version. Omitted/null Billing preserves the existing applicable value. Clearing is not provided without separate Delete approval.
- Reuse account_billing_unit_versions, stable tenant and roster/store identities, effective Invoice Month, global version conflict checks, idempotent requests, atomic saves and audit.
- Add/Edit Store and Account company editor use the same fields. Fee/mapping/setup append paths must preserve Billing.
- Explicit Billing name is used for new Xero suggestions; existing saved stable-ID mappings remain unchanged.
- Store Selector names, fee assignments, invoice amounts, historical ledger and Xero are not rewritten.
- Settings reminder counts unassigned invoices directly, avoiding confusing source-group counts.

## Environment and delivery

Feature branch codex/account-registered-names was created from latest main7c03f2c8d562c60b861c32d9d95bf014c432d151. It depends on the unreleased Xero integration72fb135625bdbe7920fdf5d8bdd4aed1f2f6a6b9. Keep latest Package change and existing Staging work.
Independent Staging Supabase ubjfuveoqbvouryldqfu only; Production unchanged. Database Structure design GO before implementation. Required actual UI/UX then final function QC. No Deletes.

## Current release candidate

The isolated latest-main Account candidate and disabled-Xero activation limits are described in `account-production-release-2026-11-04.md`. Historical Stage branch/dependency notes above do not authorize copying Stage configuration or financial facts to Production.
