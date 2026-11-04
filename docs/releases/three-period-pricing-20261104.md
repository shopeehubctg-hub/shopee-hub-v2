# Three pricing modes · Staging candidate

Feature branch: codex/calculator-three-period-pricing. Initial base: origin/main 36afc260a7a50518a32818b9de3011a5b3faaadd; updated to 0e4a22a before delivery.
User authorized combining the candidate with existing fixed Staging work on 4 Nov 2026. Preserve the permissions updates during integration. Production is not authorized.

## Data contract

No DDL, backfill, cleanup or new table. `package_prices` retains canonical Normal availability and Campaign ranges. A validated `_pricingMode` distinguishes uniform, normal_campaign and split_normal. `_normalMonthlyRule` schema1 stores early/late decimal prices per market; its lifetime is exactly the canonical Normal availability, with no separate dates. Campaign events override the applicable Normal half. Saved prices are not changed by later voucher-reference changes.

Calculator export storage envelope remains schema_version1 (required by the existing immutable table constraint). Payload `pricingSchemaVersion:2`, explicit `pricingMode` and stable `pricingPeriod` identities distinguish content. Never rewrite historical exports. Legacy two-scenario payloads and previous spreadsheets remain readable. Pricing periods are not inferred from array order or translated names.

Historical Platform Voucher averages: source Final!A1:D36 in https://docs.google.com/spreadsheets/d/1gTTmWXao1j9nDzg5MJdVCOAGwRaRV222_2nC-t1Kg2k/edit , read 4 Nov 2026. These are references, not future entitlement guarantees. A missing late-month reference requires manual input; do not invent one. Calculator computes MY only. Other markets are independent manual entries.

Uniform mode uses the highest of the period recommendations as one shared recommended selling price; the period comparisons show actual estimated Buyer Payment and Order Income at that shared price. Customer may change the saved price later, with a reason when it differs from a linked calculation.

## Gates

Database reuse design: PASS, reviewed by existing Database Structure owner; no migration required. Automated, UI/UX, functional QC and deployment evidence will be recorded after execution. No Production PR, main merge or Production deployment is part of this candidate.

## Local verification (4 November)
- Feature branch rebased by fast-forward onto origin/main `0e4a22a`; only an unrelated release-policy document changed upstream.
- 49 automated checks PASS: Calculator selection/handoff; immutable period snapshots; Excel 20-item + MY/SG roundtrip; legacy two-scenario files; partial price updates/retry/rollback/permissions; package lifecycle; four-market single creation/edit; History.
- TypeScript PASS; Next webpack production build PASS. React review retains scoped Noto Sans styles and shared controls.
- Database Structure/persistence implementation owner PASS. No new table, migration, backfill, business-data write, credential transfer or deletion. Canonical Normal availability owns all rule lifetime; Normal halves share Original Price.
- Actual fixed Staging UI/UX and Function QC PENDING. Chrome AppleEvent page-read timed out; Vercel connector denied deployment metadata (403). These are deployment/verification blockers, not a QC PASS.
- Production PR, main merge and Production deployment NOT EXECUTED.
