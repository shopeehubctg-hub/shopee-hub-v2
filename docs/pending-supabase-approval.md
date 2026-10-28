# Supabase changes awaiting prior notice and approval

No steps in this document authorize a database write. The feature flag `SHOPEE_VALUE_PROOF_ENABLED` remains off.

## Already done before the new instruction

On 28 October 2026, migration `20261028063512_shopee_hub_value_proof` was applied to isolated Staging project `ubjfuveoqbvouryldqfu`. It added nullable action fields and three empty tables. Read-only checks found zero rows in the action and financial tables. Production project `zwnmonnbmqncwoytdigd` was not changed. No customer action, fee, cost or profit facts were inserted or edited.

## Proposed next Staging changes

1. Add a Project ID registry and project-to-store bridge keyed by the existing master directory IDs. Shared stores may have multiple Project IDs. Require an approved allocation rule and effective month before a project-level financial contribution can be marked verified. The current `stores` selector and account fee ledger remain the canonical store and billing sources.
2. Add immutable financial revision and correction events. A later correction appends a new version with actor, reason and source; the original verified month stays available. Remove broad financial UPDATE access in favor of a server-only transactional workflow.
3. Add a composite action/event constraint so an event's tenant and store must match its parent action. Add only the missing query/FK indexes identified by the Staging advisor.
4. Narrow the sequence grant added by the first migration to the three new sequences. Check existing grants before changing them so other modules keep working.
5. Keep department contribution restricted to Super Admin. Client views receive only their own verified store contribution and approved actions.

These changes are additive to business records. They do not delete or rewrite customer transactions. A synthetic rollback-only transaction can test mappings, rejection of mismatched tenants, revision history and API reload after approval.

## Financial definitions to confirm

- Net sales means sales after seller-funded discounts and refunds. Seller discounts are stored for reconciliation and not subtracted twice.
- Department cash revenue should use either **issued and approved invoices** (accrual view) or **allocated receipts actually collected** (cash view). The current working label says cash revenue and therefore requires receipts, not a rate-card estimate.
- For a shared store, project contribution requires a documented allocation basis (for example exact SKU attribution or approved revenue share) for every month. No default even split.
- Internal project value is noncash and reported separately. A 3% internal fee model does not automatically become cash revenue.

## Release gate

After explicit permission to make the described Supabase changes, apply and verify Staging first, review with the Database Structure owner, then run UI review and functional QC. Before any Production migration, state its exact objects and effects and obtain separate approval. Do not enable `SHOPEE_VALUE_PROOF_ENABLED` in Production until all gates pass.
