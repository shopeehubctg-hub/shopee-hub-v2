# Xero to Billing Records — Database Structure review

Implementation and independent Staging database gate: PASS. This does not replace actual UI/UX review, function QC or Production authorization.

## Evidence and canonical ownership

Actual Stage inspection found 53 selected-month source invoices already retaining ContactID, 40 distinct ContactID/Project pairs, seven contacts appearing across multiple Projects, and no retained company labels. Only three canonical billing-unit identities had persisted versions; the other audited roster rows remain a server-owned read-only catalog. Names alone therefore cannot safely bind financial records, and a new second client/store registry would be redundant.

The approved source identity is the tuple `(tenant_id, connection_id, ContactID, Projects category UUID, option UUID)`. A connection already pins environment, Xero organisation and the four approved Projects option IDs. The association points to the existing billing unit's stable `roster_key`; its `target_unit_version` is approval evidence, not a frozen Rate Card or a competing store/company definition. The composite FK directly reuses the existing unique `(tenant_id, roster_key, version)` key. Existing Account logic continues resolving company, store and commercial terms by Invoice Month. Several source identities may map to one unit; one identity resolves to at most one effective target, selected by effective month and version. A contact/project spanning multiple clients remains ambiguous until explicitly resolved; the implementation does not allocate or duplicate invoice amounts.

New table `account_xero_mapping_versions` is an append-only external association history. It reuses `account_store_requests` for atomic idempotency and `account_audit_log` for changes; it creates no additional request/audit/client/store/Rate Card owner. No removal, archive, cleanup or unmapping operation is added.

## Source identity and money

Optional snapshot `companies` contains only `{contactId,companyName,categoryId,optionId,project}`, unique per contact/option. The minimal source business label is display/candidate evidence; it never replaces canonical Account company names. Entries must correspond to an eligible selected-month invoice and a pinned approved Projects option. Other categories, raw contacts, email/address/bank fields and line descriptions are not permitted. Old immutable snapshots remain valid without this field and are not rewritten; a fresh scoped sync is required before saving an observed source identity.

Candidate suggestions may use unique exact names together with project/store evidence. Names are never persisted as matching keys. Suggested bulk matches require an explicit POST; ambiguous or missing links retain the warning/manual choice. GET performs no writes.

Billing Records use the selected invoice-date month cohort: invoice gross, Xero paid/applied amount and amount due. Tax/credit details remain source facts; top-level actual cash follows payment dates independently. An old invoice is not rebound using its collection month. Xero source currency stays separate from store market, Account setup currency and Rate Card currency; heterogeneous currencies cannot be silently summed or relabelled. Source facts do not create assessed ledger invoices, receipts, expected fees or Rate Card assignments.

## Missing identity anchors and history

The audited roster is not bulk-seeded. When an explicitly selected target has no applicable unit version for the source Invoice Month, the same transaction appends one existing `account_billing_unit_versions` record with `change_action='mapping'`. Its company/project/currency/market/store come from the server-reviewed catalog plus canonical tenant store. Fee rule, Rate Card and fee/FX policy fields remain null. An October identity anchor may be appended alongside an existing November commercial setup; the November row is preserved and month-first resolution still applies it in November. Existing same-month/earlier versions are reused rather than overwritten. An existing unresolved/null-store target is rejected and must first be resolved through the existing Account workflow.

## RPC and isolation

- `xero_billing_mappings_read(..., p_environment, p_invoice_month, ...)` returns one requested-month source snapshot/run/timestamp and all bounded mapping history, without credentials. Source facts and identity labels come from the same source run; it never adopts another month's latest global snapshot.
- `xero_billing_mappings_save(..., p_source_run_id, p_invoice_month, p_bindings, p_request_id, ...)` validates the latest successful snapshot for that month, observed identities, pinned option IDs, canonical tenant stores, maximum source/target versions and server-derived target metadata. Up to 100 explicit matches save atomically; stale/changed requests, duplicate identities and late failures cannot partially save.
- Every call uses the existing active Super Admin, tenant, persisted primary and supplied Account verification session checks. Mutation locks the connection, shared request and target unit keys in the established sorted order. The deployed unit advisory-lock prefix was inspected and matches exactly.
- New functions are security-invoker with an empty search path and service-only execution. The mapping table has RLS, no browser grants and only service SELECT/INSERT, with no UPDATE/DELETE/TRUNCATE. All FKs are tenant-scoped; source/target/run query indexes cover their keys.

## Delivered evidence

- CLI-created migration `20261101150445_xero_billing_source_mappings.sql`, reviewed by root before application, applied only to independent Stage `ubjfuveoqbvouryldqfu`.
- `tests/sql/xero-billing-mappings.rollback.sql` passed under service_role. It checks old/new snapshot compatibility, malformed/extra company fields, source UUID binding, latest-source freshness, null-store/cross-tenant rejection, CAS, exact and changed replay, one shared target anchor, preserved future commercial version, late-batch rollback and read-only GET behavior.
- Original `tests/sql/xero-readonly-snapshots.rollback.sql` passed again after the validator extension.
- Readback: real mapping count zero; billing-unit count remains three and its full-content fingerprint is unchanged (`baaed774864461ebcb5542c73f580619`); assessed ledger count remains zero. Test tenants, users, sessions and audits all zero after rollback. Existing source snapshots still pass validation.
- New mapping table RLS is enabled; authenticated SELECT and service UPDATE/DELETE/TRUNCATE are false. Security/performance advisor delta has no new WARN/ERROR or unindexed FK finding: only server-only RLS-without-policy INFO and fresh-table unused-index INFO. No destructive action or Production write occurred.

## Per-invoice override follow-up

After the application explicitly saved 19 source-group mappings, a contact/project spanning several billing clients required invoice-specific resolution. CLI-generated `20261101153038_xero_billing_invoice_overrides.sql` adds only nullable `source_invoice_id` to the existing history and replaces the same two RPC implementations. No new table/index, constraint replacement, data migration or old-row update is used. The original global source-group/version UNIQUE remains unchanged; group rows retain null invoice scope.

`invoiceId` is an optional save binding/read field. It must identify an eligible invoice in the latest selected-month snapshot and match that invoice's ContactID and pinned Project option. Mixed/pending, unrelated or unobserved invoices cannot receive a binding. Duplicate batch identity is `(source key, invoice scope)`. All rows in one source group compare against one captured initial global version, then append consecutive global versions; the second invoice in a valid batch does not falsely conflict with the first insert. Audit before-state comes from the same invoice/group scope. The application resolves an effective invoice override before any group default and suppresses a group default when the server's canonical target candidates are ambiguous. It does not divide or duplicate amounts.

The extension was applied only to independent Stage after design review. `xero-billing-invoice-overrides.rollback.sql` and the prior `xero-billing-mappings.rollback.sql` both passed under service_role. Tests cover two invoices under one contact/project with distinct targets and one baseline, append/replay, old groups, wrong-contact/unknown/pending invoices, late failure rollback and scope-correct audit. All fixtures rolled back.

Pre/post readback retained the 19 existing group records with identical content fingerprint excluding the new nullable schema field (`1987c27323792733d0ea38484744d2f0`); all 18 unit-version records retained fingerprint `b036d79bca50a014eabc36f1c2a03d95`. Real invoice overrides remain zero, assessed ledger remains zero, and synthetic tenants/users/sessions/audits remain zero. Client SELECT and service UPDATE/DELETE remain false; service INSERT includes the added column through the existing table grant. Security/performance advisors introduced no new finding. Production and existing mappings were not modified by this extension.
