# Calculator package handoff and product picker visibility

Create All Ready and single-package confirmation retain the Calculator batch when the browser blocks new tabs. A persisted draft opens in a same-origin blank tab with its opener cleared; if popups fail, the current page opens the package form with the complete batch, selected store and Calculator snapshots. The fallback URL retains the draft reference for reload recovery. If browser storage is unavailable, the current page uses the in-memory batch. No package is saved during this handoff. Store and package-access errors remain in the confirmation dialog instead of silently dismissing it.

The confirmation dialog is portaled to the document body so module layout cannot clip it. Product search menus choose available space above or below the input, scroll their result list and keep Add New Product inside the visible menu on desktop and mobile.

Validation: the prior popup failure was reproduced in Chrome with a browser-enforced popup policy. The fixed complete UI transfers ten packages/twenty price snapshots, restores them after reload, and supports normal new-tab handoff with no opener. Four handoff regression checks, catalog and Excel/batch Chrome workflows, near-bottom desktop/mobile dropdown checks, TypeScript and Next production build pass.

Two older interaction suites have thirteen existing failures (obsolete component selectors, old module/API assumptions and a missing provider). The exact same thirteen failures were confirmed against the unchanged Production source; they were not introduced by this patch. No database/schema or customer package changes are included.
