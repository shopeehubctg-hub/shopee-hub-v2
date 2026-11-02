# Xero Staging verification — 1 November 2026

## Deployment and environment

- Fixed entry: https://shopee-hub-v2-260731-git-cod-e05b8d-shopeehubctg-5199s-projects.vercel.app/
- Staging commit: `693f1c596d1b3867224bf2430af988b6e5ebfa1f`.
- Final Preview deployment: `dpl_13nh4yTiABmE7ZD9boJCtNaF2Np6`, Ready; build duration 53 seconds.
- All five existing branch-scoped Preview variables now target `staging`: SUPABASE_URL, SUPABASE_SECRET_KEY, DATABASE_URL, STAGING_SUPABASE_SECRET_SHA256, SHOPEE_ACCOUNT_SECURITY_ENABLED.
- Only branch metadata was changed. Values were not edited or rotated. Production was not deployed or reconfigured.

## Evidence and limits

- Authenticated fixed-entry health check returned `status: ready`, `environment: staging`, `projectRef: ubjfuveoqbvouryldqfu`, `databaseReachable: true` after the first four bindings.
- Actual Account page loaded after the user signed in. An unconfigured Xero section incorrectly returned a sign-in error for a valid legacy session without a session ID.
- Correction allows only the unconfigured GET status to use the existing authenticated active owner Super Admin identity. Configured financial reads, OAuth and sync retain strict session requirements.
- Complete Xero suite under Node 22: 34 tests passed, 0 failed. Default local Node 20.9 cannot execute the current jsdom dependency chain; it is not a passing UI test runtime.
- Browser inspection of the correction showed “Connection setup is pending. No Xero income has been imported.” with no connection/sync button and no invented income.
- After the fifth binding took effect in the final deployment, the old Dashboard session was rejected and the fixed entry showed the sign-in page. User re-login is required to verify the final Account gate.
- Xero credentials and organisation authorization are not configured in Staging. No actual Xero invoice/payment sync was completed.
- Final user re-login and Account unlock were completed. The Account gate was visibly enforced before unlock; after unlock the roster and Xero pending state displayed normally.
- Final deployment health again returned ready for independent Staging. The authenticated Xero status endpoint returned `{configured:false,connected:false,status:"not_configured"}`.
- UI/UX owner PASS: actual screenshot `/private/tmp/bd-xero-account-unlocked-20261101.jpg`, scoped only to the unconfigured Xero panel.
- Final function QC owner PASS: 10/10 independently executed access/routes/panel tests plus supplied live-page evidence, scoped only to unconfigured Xero. This does not certify connected financial-data states or live OAuth/sync.

## Outstanding

1. Configure a separate approved Staging/demo Xero app and organisation before live OAuth/sync testing. Never reuse Production credentials or tenant data for this step.
2. Review connected-state actual UI, then complete live functional QC before any Production release authorization.

## Subsequent authorised Wisdom Factory connection

The earlier unconfigured results above are historical. The user later explicitly authorised the independent Staging app to read Wisdom Factory and retain necessary records for the four approved Projects only. See `xero-wisdom-staging-connection-2026-11-01.md`.

- Stage commit `11c8236810287e46e39b9392d97e97787d69c54a`, deployment `dpl_EMtyzVPqgqnCGgybqsRg9dvdzWEJ`, Ready.
- Actual successful sync at 2026-11-01 21:06:37 MYT: October invoiced MYR91,043.07; October cash received MYR65,754.02; today cash MYR0.00; all-month outstanding MYR107,495.44.
- Actual project list filter tested: Tik Tok Hub showed only its two October invoice rows and one payment; all-four-project summary stayed explicitly labelled.
- Complete Xero suite rerun:49 tests PASS,0 failures.
- Connected-state UI review HOLD: financial/date columns wrap, dates expose ISO timestamps, long invoice list needs compact sticky headings. Correction is in progress; no connected-state final QC or Production approval claimed.

## Connected-state desktop acceptance

- Final fixed Stage candidate `b2f9a64adaafc93bb0ff696d5960ed57e8147797`, deployment `dpl_4mzztgqpiEtQD1qp8TxKn7mJBSnY` Ready. Fixedalias metadata verified to this commit. Concurrent Package candidate `1b8c1236111616af256540e75247d32602cca975` preserved as first parent; no overwrite.
- UI/UX owner desktop PASS after actual screenshot review: `/private/tmp/xero-compact-table-stage-20261101.png`; additional internal-scroll screenshot `/private/tmp/xero-sticky-table-stage-20261101.png`. Six columns, short dates, single-line grouped amounts and sticky headings verified. Mobile not certified.
- Latest50 Xero tests pass. TypeScript and targeted lint pass. Real payment37-row disclosure expands and displays prior-month invoice receipts on their October payment dates.
- Functional owner final QC is pending separately; no Production release authorised.

### Final functional result

Functional QC owner PASS for connected Staging scope after desktop UI/UX PASS: independent50/50 tests, access/security, period completeness, filter behavior, payment detail, persisted refresh and supplied actual Stage snapshot evidence. Residual limitation: no independent source-export recalculation of every Xero figure; today/all-open aggregates were matched to persisted snapshot output. Production untouched.
