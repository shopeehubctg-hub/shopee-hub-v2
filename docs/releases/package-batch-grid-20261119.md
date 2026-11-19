# Batch Create Packages in the Dashboard

Branch `codex/package-batch-grid-20261119` starts at `93ba69d`.

Packages & Pricing and the single-package editor open Batch Create with a directly editable table. Inventory entry defaults to By Product and supports By SKU. A paste starts at the focused cell, adds the necessary rows and inventory columns, and preserves leading-zero SKUs. The table supports 500 packages and starts with 20 inventory item slots per package. Product matches use the selected store's library. Users can supply both a name and SKU for a new product. Row errors can be corrected in place.

Import Excel remains available with its template, By Product Name and By SKU tabs, and Calculator references. Both entry methods use the existing protected batch review, date selection, pricing, preview and retry-safe save flow. The initial table is an in-memory draft with a leave warning. The existing save journal applies once creation starts.

## Verification

35 automated tests cover grid paste, limits, inventory matching, Excel formats, period pricing and save retries. Local Chrome exercised both entry methods through final preview and mocked creation, including multi-row paste, duplicate SKU correction, keyboard navigation, new whole-month pricing and mobile width. TypeScript and the Next.js webpack build passed.

## Release scope

Fixed Staging only. UI acceptance and final Staging function QC are pending. No Production PR or release is approved. Database structure review is not applicable because the change uses existing store-scoped inventory and package interfaces and introduces no database changes.

## Calculator entry correction

The Calculator’s single and selected-package Create actions now open the same Dashboard table in the current tab. Each selected Calculator package has one row with its original three recommended MY selling prices and any main product quantity. Other markets start with empty prices. Users can edit prices, products, SKUs and quantities directly, paste multiple rows, and choose package pricing and dates before final preview. There is no workbook action in this flow. Packages & Pricing still offers the standalone Excel import.

Calculator drafts are scoped to the current tab, store and signed-in account. The entry and reviewed rows survive refresh when session storage is available. Review links the original recommendations using stable request IDs and the existing store-scoped calculator snapshot API. Package creation uses the existing idempotent save process. No change to Supabase schema, access policies or migrations is required.

38 affected automated tests passed. Local Chrome with mock API responses exercised two packages from the actual Calculator buttons through edited prices with reasons, multi-row paste, refresh, retry after review failed, shared dates, final preview, creation requests and return to the package list. The standalone Excel regression and Next.js build passed. Fixed Staging visual acceptance and final function QC remain pending.

## Inventory library and item columns

Both Dashboard entry paths open with 20 item slots, including previously opened Calculator drafts with fewer slots. Users can add several slots at once, up to the catalog service’s existing limit of 100 items per package. Empty slots do not enter the review or save payload. Workbook formats keep their original 20-slot layout.

Focusing either a product name or an inventory SKU opens the selected store’s library. Search accepts either field. Choosing a result fills its exact SKU and product name together. Matching and paste preserve leading zeros and distinguish products with duplicate names.

Read-only schema review on Staging and Production confirmed package version components use JSONB without a 20-item database constraint. The review and save APIs now use the same 100-item limit as inventory capture. No migrations, data imports or catalog writes were needed to deploy this change. Local Chrome exercised the Calculator workflow with 21 actual item lines through the final mocked save, including mouse and keyboard selection, five added columns, retry and refresh. Standalone batch, Excel and single-package inventory picker regressions also passed.

## Add a product from an empty search

In the Calculator handoff and direct batch table, an unsuccessful product or SKU search offers **+ Add New Product**. The form carries over the current item's name and SKU. **Add to Item** fills both cells and returns focus to that item's quantity. Cancel keeps the item as it was when the form opened. An existing SKU with a conflicting name is flagged in the form. Catalog persistence follows the existing package save flow.

The Calculator browser regression covers pointer and keyboard activation, both inventory modes, leading-zero SKUs, cancellation, conflicting names, correct row and slot, quantity preservation, draft refresh and the final mocked package requests. No database migration is involved.

## Round Calculator prices and check Original Price during entry

The MY price header in Create Packages from Calculator offers **Round to nearest RM** for all package rows. It rounds only early-month, campaign and late-month MY selling prices. RM406.03 becomes RM406 and RM406.50 becomes RM407. The original Calculator recommendations remain available in pricing history. The Calculator creation workflow accepts rounded and manually edited prices directly through review and save. Pricing history records the linked recommendations and final prices.

An Original Price below a selling price shows an inline error immediately, including the minimum amount, currency and period. Typing, pasting and rounding all update the warning. Each market is checked independently, and an Original Price equal to the highest selling price is valid.

## Continue from dates to preview

Applying dates to the last packages that need them opens Final Preview in one click. Setting dates for part of a batch keeps the remaining packages in review. Returning to a completed review shows Continue to Final Preview and a date editor for each package. Creation still requires confirmation on Final Preview.

## One Dashboard package editor

Create Packages opens the By Product grid for one or more packages. The Calculator sends its selected rows directly to the same editor. Package creation now takes place entirely in the Dashboard, including multi-row paste, product lookup and final preview. The package list offers one creation action and reserves package selection for fulfillment. Existing package prices can be updated from Price Calculator.
