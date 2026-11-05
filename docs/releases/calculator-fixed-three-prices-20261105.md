# Fixed three-price Calculator — 5 November 2026

## Candidate and scope

Feature: `codex/calculator-fixed-three-prices-20261105`, created from latest `origin/main` `0e4a22a941e643ef09e5fff4dbff6abb5822aa86`, then fast-forwarded through the queued three-period prerequisite `93b9013`. Integrate with current `origin/staging` rather than replacing its Store permissions, service-status, Account or Xero work.

Fixed Staging: https://shopee-hub-v2-260731-git-cod-e05b8d-shopeehubctg-5199s-projects.vercel.app/

Only independent Supabase `ubjfuveoqbvouryldqfu` is authorized. Production, main, PR creation/merge and Production data writes are outside this handoff.

## Resulting behavior

- Calculator has no Pricing Mode selector. Each package has three independent recommendations: Normal Day 1st–15th, Campaign Day, Normal Day 16th–End. Create/export preserve the three original calculations.
- Single and batch creation offer two applications: Same Price All Month or three distinct period prices. Whole-month pricing requires an explicit choice of recommendation; no highest/lowest recommendation is chosen silently. Applied prices and all three source calculations remain separate in version evidence.
- One Excel layout per selected country combination: Original Price plus three Disc Price columns for each market. Keep both entry tabs, Product Library, 20 inventory items, protected Calculator prices and horizontal freeze of Package Name only. Blank templates and Calculator exports use the same layout; choose application after upload. Non-MY prices remain manual.
- Align three Voucher inputs. Missing store/late-month voucher blockers are visible. Normal price entry uses aligned early/late rows with Original on the left and Disc on the right; Original is shared between the halves.
- Existing two-price packages remain supported without migration. Repricing explicitly selects early/late for a legacy Normal price or one source for an existing uniform package, preserves dates/other markets/Original/components, and retains the original three recommendations and selected mapping. Ordinary later edits preserve this evidence.

This supersedes the earlier candidate's automatic highest-price uniform recommendation described in `three-period-pricing-20261104.md`.

## Database Structure Review

Existing canonical `packages`, `package_versions`, `package_prices` and immutable `calculator_export_snapshots` are reused. Read-only Staging metadata review confirmed the physical export envelope must remain `schema_version=1`; new JSON payloads use the explicit fixed-three discriminator and existing payload schema version 2. No DDL, migration, new grants/indexes, backfill, business-row copying, deletion or cleanup is required or performed. Existing immutable exports/history are untouched.

Server checks authoritative tenant/store-scoped exports, explicit application mapping, unchanged target mode, final prices, expected version and replay fingerprint. Source selections inappropriate for the target mode are rejected, protecting unselected period evidence. New captures are saved by existing APIs when the user exports/creates/updates; deploying this code does not manufacture customer packages or calculation records.

## Checks and gates

- Focused automated checks: 27 PASS across three-period pricing/Excel, Calculator handoff and atomic repricing APIs. Covers all six requested market combinations, 20 inventory slots, name-only freeze, explicit uniform choice, legacy edits, source mapping, retries and partial-update evidence.
- TypeScript and Next webpack build PASS. Scoped React/style review preserves shared controls and Noto Sans. No new dependencies.
- Actual UI/UX: **PENDING USER**. Function QC: **PENDING USER**. The user explicitly requested to perform these checks themselves. No browser QC or real package creation is claimed for this candidate.
- PR: not created. Production commit/deployment: not executed. Release gate remains closed until actual UI/UX and Function QC pass and the user explicitly authorizes Production.

## Known limits

Late-month voucher references that are unavailable require user input; no voucher is guessed. Calculator computes MY prices only. Legacy two-price versions retain their original representation. Supabase structure review and automated checks do not prove customer UI acceptance. Deployment readiness and fixed-alias binding are recorded separately in `docs/staging-candidate.md`; a pushed branch alone is not a verified fixed Staging deployment.
