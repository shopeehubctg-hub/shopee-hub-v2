# Fixed Staging candidate — 2 November 2026

Retains Xero/Account from integration base 6213e0c7c4d772e354ebc848a1c0d9e385a4d5f2 and Package order fix PR #47. User authorized combined Staging; no Xero files enter the Package main PR.

Start Date feature: codex/package-start-date-lock-20261102 at d0b5652176ecafcaf9ca236f79cfbf115842dc3f. Future custom Campaign start remains editable; started market/day-type origins are preserved. Automated 57/57 PASS; webpack/TypeScript build PASS; Database Structure/final guard PASS. Actual UI/UX and function QC in progress, required before main merge.

Fixed Staging: https://shopee-hub-v2-260731-git-cod-e05b8d-shopeehubctg-5199s-projects.vercel.app/
DB only ubjfuveoqbvouryldqfu. No Production auth/data replication.

Account Store Name matching: codex/account-invoice-store-matching at 123f7cdd55e67552155e47a5a740faabf7b92870. Includes queued Registered Name (Platform/Billing) prerequisite28e008c8. Fresh explicit STORE NAME evidence drives per-invoice matching; unknown/conflicting/multi-store invoices remain pending. Stage names and evidence migrations applied, actual rollback checks PASS. Automated186 related checks and TypeScript PASS. Actual fresh source review, UI/UX and final function QC pending. No Production release authorized.
