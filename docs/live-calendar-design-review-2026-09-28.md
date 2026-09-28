# Live Calendar — implementation and design handoff

## Delivery boundary

- Branch: `codex/live-calendar-production` (rebased by cherry-pick onto latest `origin/main` `acd7526`).
- Independent checkout: `/Users/jolinyong/Documents/BD Dashboard/live-calendar-worktree`.
- Base: `origin/main` at `acd75269f269cafae63c3fe89e272d8be02e8960`.
- This is reviewable code and a synthetic UI preview. No real Staging deployment or database migration has been performed. No Production writes or release have been performed.
- Calendar changes were cherry-picked onto that newer Production main, preserving Advertising and store-switch synchronization fixes. Shared integration files include `app/page.tsx`, `app/api/dashboard/route.ts`, module permissions and user permission settings.

## Implemented experience

- Live Calendar navigation and module settings; tenant defaults and absent configuration keep client access off.
- Super Admin: Month, Week, List; canonical store picker; create, edit, reschedule and cancel a one-off session; optional title and internal note.
- Same-store overlaps return HTTP 409 until the admin explicitly confirms. The confirmation lists each conflicting title, store and local start/end time. Adjacent end/start times are allowed.
- Customer: read-only upcoming List by default, optional Month/Week and an All Stores filter for multiple assigned stores. A one-store account has no redundant store picker. Cancelled sessions and internal notes are omitted from customer responses.
- MY and SG use explicit `Asia/Kuala_Lumpur` / `Asia/Singapore` store zones. Local input converts to UTC; grid queries use local midnight boundaries, independent of the browser time zone. Cross-midnight cards include the ending date. Month/Week cells render an event on every intersecting store-local day, including when it starts before a visible week or month; continuation is labelled. List shows the exact inclusive 120-day date range while navigating.
- Loading hides old event cards and disables Add/Edit. Dialog keyboard handling supports Escape, focus trapping and return to the trigger.
- All matching event pages are read in batches of 500 with `(start_at, id)` ordering. There is no silent 500-event cutoff. A request range is limited to 370 days.

## Authorization and store registry

1. Every Calendar request resolves active membership and active tenant from authenticated identity. Client-supplied tenant IDs are ignored.
2. Non-admin reads require an explicitly enabled tenant Calendar permission, plus an explicitly enabled user permission in custom mode.
3. **Customer Calendar always uses explicit `user_store_access` rows**, even if an old account has `store_access_mode = all`. Without store grants, it returns an empty scope. Managers may keep their existing all-store scope; Super Admin manages its tenant's stores.
4. Enabling Calendar for a customer through user settings requires selected, non-empty store grants. Selecting the module in the UI switches an all-store customer to an empty selection so the admin must choose the customer's stores.
5. Write operations require active Super Admin membership and a store belonging to that same tenant. Update/cancel lookup is scoped by both tenant and session ID.
6. The current Link Directory belongs to `j-packaging`. Only this tenant's Super Admin sees missing-directory-store registration and can register a name validated against the current Sheet. Other tenants cannot see or register this global list; customers cannot invoke registration.
7. Registration writes a canonical `public.stores` row, making the same ID available to the Calendar picker and user selected-store settings. Missing stores are shown explicitly instead of silently omitted. A failed Directory read shows a warning and leaves Calendar reads available.

### SkinDae SG identity

| Identity | Treatment |
| --- | --- |
| `shopee-skindae-sg` | Canonical ID, based on historical stores seed migrations |
| `SkinDae SG` / `SkinDae SG by CTG4u` | Explicit names resolving only to that SG ID |
| `shopee-skindae-sg-by-ctg4u` | Orders/Directory slug alias, mapped to canonical for selected-store grants |
| `shopee-skindae-my-by-ctg4u` | Separate MY store; never used as SG fallback |

The migration inserts the SG canonical row only when absent, stops on a conflicting tenant/market, copies and deduplicates alias store grants into the canonical row, while preserving old alias grants and store rows for older module references. The Dashboard Vercel picker now resolves Directory names through the canonical registry. Future Orders integration must use the same canonical mapping; any Orders/Advertising records still stored under the slug alias need a separate reviewed data reconciliation rather than an unverified bulk rewrite here.

## Migration and real database boundary

Migration: `supabase/migrations/20260928020801_live_calendar.sql`, generated with cached Supabase CLI `2.116.0` using `migration new live_calendar`.

- Adds `live_sessions`, a transactional change-audit trigger/table, time/status checks, and a composite tenant/store foreign key.
- Enables RLS on both new tables, revokes `anon` / `authenticated` access, and explicitly grants only the server `service_role` the required operations and sequence/function rights. Direct client table access is intentionally unavailable.
- Extends the actual existing permission CHECK expressions instead of replacing their allowed lists, preserving `individual_ads` and any other already allowed permissions.
- Checks an existing `stores_tenant_id_id_key` definition before reuse, and stops if the same name means something else.
- Seeds Calendar tenant defaults as false without replacing existing explicit settings.

Read-only connector evidence: the only visible Supabase project is Shopee Hub (`zwnmonnbmqncwoytdigd`); `list_branches` returned `[]`. Its current stores include MY SkinDae and lack SG SkinDae. Its user module CHECK already includes `individual_ads`; the tenant module CHECK does not. No schema or data was changed there. Local inventory found no `psql`, `pg_ctl`, Docker or existing local Postgres installation to use for isolated SQL execution.

**Pending DB validation:** execute only on a confirmed isolated database with the existing tenants/stores/user-access schema and Supabase roles. Verify migration application, table grants/RLS, audit inserts on create/edit/cancel, foreign-key cross-tenant denial and existing permission preservation. SQL runtime behavior has not been tested against a database. The active application currently signs in through server sessions and uses a server-only Supabase key; the new tables follow that server-only access model.

## Verification evidence

| Check | Result and scope |
| --- | --- |
| `node --test tests/live-calendar.test.mjs` | **15 PASS**. Actual API handlers with mocked identity/REST adapters: inactive/disabled/cross-tenant denial, customer read-only and notes exclusion, one/multi-store grants, legacy customer all isolation, admin registration, SG conversion/invalid dates, create/edit/reschedule/cancel, explicit overlap confirmation, 1001-event paging, permission settings, local grid day bounds in UTC/MY/Los Angeles/Auckland, and cross-week/month continuation without a midnight end-day ghost |
| `tsc --noEmit` | PASS |
| ESLint | New Calendar API/UI/model/registry, tests, preview builder and `db/schema.ts` PASS. Existing `page.tsx` / `permission-settings.tsx` contain pre-existing lint errors; full-repo lint is not claimed |
| `git diff --check` | PASS |
| Next build | Webpack build PASS using the existing cached Noto Sans woff2 through Next's test-only font response hook. Root `next/font` configuration is unchanged. Normal build is blocked by DNS access to `fonts.googleapis.com`; Turbopack also rejects the shared dependency symlink in this independent checkout |
| Browser mock | Full Dashboard shell at 1440px desktop / 390px mobile, using shared navigation, context header, Noto Sans, final color tokens and title scale; no browser errors observed. Single-store customer has no MY event, admin action, note or store picker; no horizontal overflow. Shift+Tab cycles from first field to Schedule, Escape closes and returns focus to Add live |

Mocked API tests do not verify real Supabase REST grants, authentication-provider behavior, RLS or audit execution. The preview uses only synthetic in-memory data and has no database writes. Browser inspection confirmed no horizontal overflow at 390px, List range text and `aria-pressed` state; no browser errors. Formal UI/UX approval and same-commit QC remain pending.

## Design artifacts

Interactive mock: `/Users/jolinyong/Documents/BD Dashboard/outputs/live-calendar-preview-2026-09-28/index.html`.

Screenshots in the same directory:

- `dashboard-desktop.png`, `dashboard-mobile.png`, `dashboard-list-mobile.png` (current full-shell design)
- `admin-desktop.png`, `admin-form.png` (earlier component-only design)
- `admin-mobile.png`, `admin-form-mobile.png`
- `customer-single-mobile.png`, `customer-multi-mobile.png`
- `module-disabled-mobile.png`

The HTML links switch Super Admin, one-store customer, multi-store customer and disabled-module examples. Regenerate using `node tools/build-live-calendar-preview.mjs <output-directory> <verified-Noto-Sans-woff2>`. Serve that directory with `python3 -m http.server 8766 --bind 127.0.0.1` for browser review.

## Next gate

The reviewer requested cross-week continuation, a List range, overlap details, accessibility states and integration with the Dashboard shell; these code changes are ready for renewed design review. The user later authorized a direct Production release without a paid Staging branch. Production preflight and deployment status are recorded separately; this design report is not a release verification record.
