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

## Delivery evidence / integration queue

Feature commit28e008c8b151622b49ab4aad631894beeff752d1 on codex/account-registered-names. Independent Stage migration applied; four actual rollback suites PASS, original-row fingerprint unchanged. Final173 affected Node testsPASS; TypeScriptPASS. Independent code review59 targeted testsPASS. Full broad exploratory run has unrelated historical harness failures; existing delegated Rate Card read test200/403 is unchanged and not certified by this task. Permission Settings lint reports two pre-existing set-state-in-effect errors and one unused-expression warning in unchanged lines; no new lint error was identified.

Fixed Staging changed concurrently from8441a969 to2da5167b491d2605f8b672890c0f7c337664f856 while Account integration was being prepared. Source diff is Package-only plus staging-candidate.md, which explicitly says Package visual/functionQC is in progress. No Account candidate ref replaced this active review. A stale-ref update returned an error, and readback confirmed2da516 remains intact. Account remains queued; exact deployed UI/UX and final function QC NOT PASS yet. Do not describe this feature as usable on fixed Staging or Production until the queue opens and checks finish. No Production changes.
