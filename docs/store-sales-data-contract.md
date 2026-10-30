# Store sales in Overview

All Stores retains the existing company/platform summary. Selecting a canonical store changes Overview to that store’s daily sales. These two grains are never added together or automatically reconciled. Existing Super Admin-only Overview sales policy remains; other users see locked values and the endpoint denies them.

Reuse bigseller_store_daily keyed by authenticated tenant and selected canonical store. Validate active tenant and ownership before reading. Store-only source IDs that cannot be mapped are not guessed. Read latest selected-store month, bounded through MYT today; reject duplicate canonical dates, mixed currencies, malformed dates/amounts, and unsafe integer cent totals. Source currency remains MYR, including imported store reports for other countries; do not apply a second FX conversion.

Gross sales and cancellations are independent source fields; do not subtract cancellations or call gross sales net profit. MTD sums recorded daily gross values only; show coverage and label partial months as recorded sales. Missing dates remain gaps, while actual zero is zero. Company targets are not reused as store targets. Native stage database gets only the reviewed source table structure and read permission, no business-row copy. Production remains unchanged by this feature until separately released; service-role SELECT for this source table is a release prerequisite.

UI shares Sales Overview styles. Daily/Monthly controls, selectable daily chart and daily breakdown. Data refresh and store changes cancel stale requests; results carry selected store identity and are not shared with another store’s UI. No source filenames, import names or raw payloads exposed.

Database Structure review PASS before implementation; final API/model review PASS. Tests cover tenant isolation, inactive/ordinary access, currency/duplicate guards, gaps, cents, cancellation separation, stale responses and locked UI. Store Health deferred at user request.
