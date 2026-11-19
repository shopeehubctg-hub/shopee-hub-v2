# Batch Create Packages in the Dashboard

Branch `codex/package-batch-grid-20261119` starts at `93ba69d`.

Packages & Pricing and the single-package editor open Batch Create with a directly editable table. Inventory entry defaults to By Product and supports By SKU. A paste starts at the focused cell, adds the necessary rows and inventory columns, and preserves leading-zero SKUs. The table supports 500 packages and 20 inventory items per package. Product matches use the selected store's library. Users can supply both a name and SKU for a new product. Row errors can be corrected in place.

Import Excel remains available with its template, By Product Name and By SKU tabs, and Calculator references. Both entry methods use the existing protected batch review, date selection, pricing, preview and retry-safe save flow. The initial table is an in-memory draft with a leave warning. The existing save journal applies once creation starts.

## Verification

35 automated tests cover grid paste, limits, inventory matching, Excel formats, period pricing and save retries. Local Chrome exercised both entry methods through final preview and mocked creation, including multi-row paste, duplicate SKU correction, keyboard navigation, new whole-month pricing and mobile width. TypeScript and the Next.js webpack build passed.

## Release scope

Fixed Staging only. UI acceptance and final Staging function QC are pending. No Production PR or release is approved. Database structure review is not applicable because the change uses existing store-scoped inventory and package interfaces and introduces no database changes.
