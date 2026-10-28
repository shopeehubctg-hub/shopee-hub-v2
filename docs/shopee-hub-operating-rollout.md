# Shopee Hub 90-day operating rollout

Owner: Shopee Hub lead. Start: 28 October 2026. Scope: internal and external projects, with brand/project clients as the primary portal audience.

## Verified starting point

- The [master directory framework](https://docs.google.com/spreadsheets/d/1uDH4BejhePGnO-zJEjTHv37z0Jy2cA7cAI3YvhGaUnU/edit) contains 47 project rows: 44 Active, 1 On Hold and 2 with no status. It classifies 33 as internal and 14 as external. It was last modified on 19 July 2026; current status must be rechecked.
- Project Owner and Account PIC are empty on all 47 project rows. The PIC directory has no people. All 62 commercial-term rows lack an approver. This prevents any claim that every active project already has an accountable owner or approved fee basis.
- Some source mappings are ambiguous: the same store is associated with Placenta and Slimpro; GoHerb and NomoQ classifications or rates conflict between master and term rows; some store names differ by source. Keep those rows pending until the project owner confirms the Project ID, store ID and effective commercial term.
- The existing portal already has price calculation, fee and voucher checks, package setup, advertising, orders, protection, live calendar, account setup and client actions. Extend those flows; do not create a second store selector or invoice ledger.
- No verified three-month set of sales, cost and labor inputs is present in the portal. Sales or fee estimates in the source workbook are not customer or department contribution profit.

## First 14 days: establish the ledger

1. Freeze the active-project list as of the reporting date. Resolve the two missing statuses and all ambiguous store mappings. A project can map to several stores, and a shared store can map to several Project IDs; allocations need an explicit rule.
2. Assign one Project Owner, Account PIC and Finance PIC for each Active project. Record approval by a named person for every current commercial term, with effective month, currency, fee base and service scope.
3. For each store and each of the last three closed months, collect source files for net sales, platform fees, ads, seller vouchers/discounts, goods cost and fulfilment cost. Reconcile platform totals to the month and currency. Enter an explicit zero only when a source confirms zero.
4. For the same months, collect actual cash fees/invoices or receipts, staff hours and loaded labor cost, tools, outsourcing and other direct costs. Record internal project value separately from cash fees. Do not use a rate-card assignment as an invoice.
5. Finance verifies every amount and source link. Only complete, verified records show contribution profit. Report missing fields and unresolved mappings as Pending verification.

Use [the empty financial intake template](financial-baseline-template.csv) to request the exact fields for each Project ID, store and month. It contains no invented transactions.

### Metric definitions

| Metric | Formula and rule |
| --- | --- |
| Customer store contribution | Net sales after seller-funded discounts and refunds − platform fees − ad spend − goods cost − fulfilment cost. Seller discounts are retained for reconciliation and must not be deducted twice. All fields use the same currency and month, with source and verifier. |
| Department contribution | Actual cash fee revenue − allocated labor − tools − outsourcing − other direct costs. Internal project value is a separate noncash field and never enters cash revenue. |
| Contribution per client | Sum department contribution for that client's verified stores, after shared-store allocations are approved. |
| Hours saved by automation | Median manual minutes per item before pilot minus median assisted minutes, multiplied by audited item count; subtract review time. |
| Error rate | Confirmed errors divided by audited transactions, with severity and correction time. Critical price/budget changes require 100% review. |
| Customer value | Approved actions with dated evidence and a result classification. Verified savings and sales changes require a source; effects without sole attribution stay descriptive. |

## Weeks 3–6: prove value in the portal

- Every manager records a dated opportunity or risk with a named owner, due date and expected impact. Another manager approves the record before it becomes client visible.
- Execution evidence links to the underlying source. Results are classified as verified saving, sales change, risk reduction or influence without sole attribution. The first two need exact amount, currency and source.
- The weekly customer view covers open risks, actions taken, owners, deadlines and outcomes. The monthly one-page review uses the same records and shows the verified profit baseline or a clear Pending verification state.
- Prioritize pricing corrections, platform-fee discrepancies, advertising stop-loss, stock and dispatch warnings, account-health incidents and fake-seller case progress.

## Weeks 3–10: automation queue

Rank each candidate by monthly minutes saved × transaction volume, avoidable error severity, source reliability and build/maintenance cost. Pilot the highest score first.

| Candidate | System prepares | Human gate | Pilot measure |
| --- | --- | --- | --- |
| Report export and reconciliation | Import, deduplicate, date and currency checks, variance queue | Finance confirms exceptions and month close | Net hours saved, reconciliation error rate |
| Monthly package checks | Missing SKU, duplicate SKU, stale fee date, inventory mapping, margin floor queue | Owner approves price and package publication | Prevented errors, review minutes |
| Campaign calendar | Upcoming dates and incomplete briefs | Owner approves offer and timing | Missed deadlines |
| Unanswered chats / bad reviews | Aging alerts and draft replies | Customer-service owner sends replies | Response SLA, escalation rate |
| Late dispatch / low stock | Threshold alerts and affected orders | Ops owner acts and confirms | Late orders, stockout hours |
| Ad balance / account health | Data-freshness and threshold alerts | Owner approves budget or account response | Avoided downtime and overspend |

No automation publishes a price, changes an ad budget, files an appeal or promises a client outcome without recorded owner approval. Ad budget and performance review remain the seller's responsibility under [Shopee's terms](https://help.shopee.com.my/portal/4/article/77215).

## Weeks 7–12: improve unit economics

- Segment accounts by actual department contribution, complexity, service hours and growth potential. For low-contribution accounts, prepare a priced change proposal: fee revision, narrower scope or lower-cost process.
- Approve a new ad, live or affiliate experiment only with expected incremental contribution, a spend cap, measurement window and stop-loss trigger. Record the decision and result.
- Decide whether to expand an automation after a measured pilot, not on projected hours alone.

## Months 4–12 and acceptance

- Months 4–6: publish service tiers with scope, frequency, response standard and separately priced extras. Use anonymized cross-store benchmarks with equivalent definitions and market/currency.
- Months 7–12: connect alerts, tasks, approvals and monthly contribution review. Expand staffing or client count only when retention, contribution per client and stable stores per specialist improve together.
- Day-90 evidence: every Active project has an approved term and accountable owner; every customer sees monthly actions/results; all critical price and budget changes have an approval trail; two-layer contribution is calculable for verified months; automation pilots show net hours and error outcomes.

## Current release boundaries

The portal code introduces a reviewed action record and read-only contribution cards. The new financial tables start empty. A controlled, auditable intake process, current source files and named owners are required before showing actual profit numbers. Production remains unchanged until staging UI review, functional QC and an authorized production release.
