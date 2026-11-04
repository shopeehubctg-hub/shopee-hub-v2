# Sidebar grouping and personal pins — Staging

Feature branch: codex/sidebar-pins-20261104, based on origin/main eb37582.

Client Action Center remains a direct top-level entry. Analytics groups Advertising, Orders & Inventory, Store Health and Fake Seller Reports. Client Services groups Design Checker and Live Calendar. Account and Permission Settings remain direct management entries. Each authorized grouped child can be pinned to the main level without a duplicate child entry.

Pin preferences are per email and origin in local browser storage, not database settings and not cross-device synchronization. Unknown or revoked module IDs never create an accessible navigation item. Storage unavailable/corrupt falls back to a usable menu. No API, Supabase schema, grants, store identity or backend access behavior changes.

Desktop uses compact line icons and selected-page highlight. Mobile uses a 64px header with explicit Menu/Close menu and vertical drawer. Selecting a destination closes the drawer; Escape closes and returns keyboard focus to Menu. Desktop collapsed sidebar exposes authorized items with titles.

Automated: sidebar interaction/account switch/revocation test PASS; Calculator handoff/repricing regression checks (13 combined) PASS; TypeScript and integration build PASS. Actual first desktop Stage9331afa was acceptable but mobile was HOLD; mobile drawer replacement required re-review. Do not treat the first gate as final responsive acceptance.

Fixed entry: https://shopee-hub-v2-260731-git-cod-e05b8d-shopeehubctg-5199s-projects.vercel.app/

Final UI/UX and function QC receipts are recorded separately after actual final deployed review. Production is not authorized or released for this feature. No deletion or business-data changes were performed.
