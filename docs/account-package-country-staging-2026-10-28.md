# Account countries and Package country filter — Staging

Fixed review entry: https://shopee-hub-v2-260731-git-cod-e05b8d-shopeehubctg-5199s-projects.vercel.app/

## Account

- Billing records now have Malaysia, Singapore, Thailand and Philippines sections, plus a compact country selector. Entity/client/store search combines with country selection. Changing that scope clears bulk selection and the open record.
- Store country, sales currency and recorded ledger currency are separate. Existing money retains its original denomination. Overview totals are explicitly labelled by ledger currency rather than presented as country income.
- The API can append real, canonical, tenant-scoped TH/PH stores as pending billing units. It does not create sample financial data, infer company/card settings, or treat a name candidate as a confirmed financial binding. Existing explicit store bindings are deduplicated.
- THB/PHP sales previews use verified BNM monthly average evidence for the preceding Service Month and normalized MYR per one source-currency unit. Cards and tier caps are in MYR. A fixed MYR fee works without source sales or an exchange-rate quote. Existing SG fixed-3.2/Bonlife policies retain their separate scope.
- TH/PH records may share the same active MYR Rate Card in a bulk preview. Client type, effective Invoice Month, exact card version and locked-history checks still apply.
- At inspection, Production tenant `j-packaging` had no TH/PH store rows; isolated Staging also had no such rows. Empty Thailand/Philippines sections are therefore intentional. Developer fixtures are not inserted into Supabase.

## Package & Pricing

- Country offers All countries, Malaysia, Singapore, Thailand and Philippines alongside the existing status/duration controls.
- Grid and List use the same country/status/duration/search result set. Selected-country views show its prices, columns and price-date lines only.
- Editing and package actions receive the original complete package. Country filtering never drops other-country prices from an edit payload. Changing a country clears export selection, open history/details and the pagination scope; switching only Grid/List retains selection.
- Existing Super Admin-only read-only Staging samples can demonstrate TH/PH without writing data. Samples expose no mutations or Fulfillment exports.

## Saving and review status

The user previously limited this work to Staging UI. Account database activation remains deferred. Rate Card changes are session previews and reset on refresh. Add Store with Account setup cannot submit while Account persistence is unavailable, avoiding a partially created store without its selected fee settings. Production retains its released store-only flow.

Developer verification: 122 Account/model/API/linked setup/FX and actual React DOM interaction tests PASS; TypeScript, targeted changed-Account lint, diff checks and the full build PASS. Legacy generic `Shopee` rows retain audited SG metadata and fixed FX. Existing Package load/prefill effect lint findings remain outside this change. These checks do not constitute actual visual acceptance or final function QC after UI/UX PASS. Protected Staging visual review remains pending. This change authorizes neither schema migration nor Production deployment.
