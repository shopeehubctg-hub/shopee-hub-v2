# Fixed Staging candidate

1 November 2026 — Account mapping integration plus retained Package candidate.

- Account feature: codex/account-xero-billing-mapping at 39365e642e0e401d9b8b730614b0ca073a4108c8.
- Existing Package Normal-first candidate and original Xero integration retained; no shared branch overwrite.
- Billing Records is primary. Stable source/group and invoice-level associations map to canonical billing clients with month-effective atomic history. Accounting connection/sync/matching is secondary.
- Fixed entry: https://shopee-hub-v2-260731-git-cod-e05b8d-shopeehubctg-5199s-projects.vercel.app/
- Independent Supabase ubjfuveoqbvouryldqfu only. Two additive mapping migrations and rollback suites PASS; Production untouched.
- Actual UI:20 verified mappings,18 clients,33 invoices deliberately pending confirmation. No fake income/fees, deletion or arbitrary multi-store allocation.
- Automated affected checks:105 PASS, TypeScript and targeted lint PASS.
- Desktop UI/UX PASS captured on c9ebf4a layout; pending-state-only patch requires quick actual final-candidate recheck before final function QC. No mobile acceptance claimed.
- Production PR/merge/release require user authorization and main-only automatic Vercel deployment. This task does not authorize Production.
