# Fixed Staging candidate — 2 November 2026

## Store master and service status — 3 November 2026

Integration starts from main `1b0d347` and preserves Staging `5efafda`, including Xero, Registered Names and Package work below. Store status feature `39bd252` was integrated as `60c2b2a`; the only conflict combined Billing identity and service-status Store fields. `e77e0a3` retains existing saved currency for later mapping/name/fee edits, preventing imported SG units from failing future saves.

Independent Staging data only: 58 Sheet clients imported as November-effective name versions (44 Billing known), with all six source columns retained in the existing request receipt. Fourteen exact unique Shop identities received explicit mapping versions; all October history remains. SkinDae SG display label now follows the Sheet. No new store, invented fee/invoice, deletion, real service-status change or Production write occurred.

Store lifecycle schema and actual rollback tests PASS; all real stores remain Active/version 0. Combined Node 24 build PASS. Focused status/access, Calendar, Account names and currency tests PASS. The pre-existing delegated Rate Card GET expectation (200 versus actual 403) remains separately documented and is not represented as passed. Actual UI/UX and final function QC are pending for this combined deployment.

Production data import remains gated: existing Store-based billing setup and legacy roster clients need an explicit canonical-unit crosswalk first; never copy the Staging manifest or overwrite currency/financial history. ILADY SG has contradictory existing MY metadata, and KATA SG has no supplied Shop Name. These remain pending rather than being guessed.

Retains Xero/Account from integration base 6213e0c7c4d772e354ebc848a1c0d9e385a4d5f2 and Package order fix PR #47. User authorized combined Staging; no Xero files enter the Package main PR.

Start Date feature: codex/package-start-date-lock-20261102 at d0b5652176ecafcaf9ca236f79cfbf115842dc3f. Future custom Campaign start remains editable; started market/day-type origins are preserved. Automated 57/57 PASS; webpack/TypeScript build PASS; Database Structure/final guard PASS. Actual UI/UX and function QC in progress, required before main merge.

Fixed Staging: https://shopee-hub-v2-260731-git-cod-e05b8d-shopeehubctg-5199s-projects.vercel.app/
DB only ubjfuveoqbvouryldqfu. No Production auth/data replication.

Account Store Name matching: codex/account-invoice-store-matching at 123f7cdd55e67552155e47a5a740faabf7b92870. Includes queued Registered Name (Platform/Billing) prerequisite28e008c8. Fresh explicit STORE NAME evidence drives per-invoice matching; unknown/conflicting/multi-store invoices remain pending. Stage names and evidence migrations applied, actual rollback checks PASS. Automated186 related checks and TypeScript PASS. Actual fresh source review, UI/UX and final function QC pending. No Production release authorized.
