# Dashboard loading: front-end evidence

Base inspected: `9ff5e8c`. Scope: browser loading and request orchestration. Database/API query timing is a separate measurement; these results do not establish UI/UX or final QC acceptance.

## JavaScript size

| Measurement | Before | After |
| --- | ---: | ---: |
| Minified page and transitive static JavaScript, esbuild with React/framework packages external | 369,686 bytes | 47,609 bytes |
| Gzip of the same initial static JavaScript | 81,887 bytes | 15,466 bytes |
| Heavy module implementations in initial static dependency graph | 7 | 0 |

This reproducible esbuild comparison reduces initial page-specific static JavaScript by 87.1% (gzip 81.1%). It excludes React/framework and the root layout. It measures transferred code size, not real browser duration. The after graph has seven dynamic module entries: Packages, Calculator, Design Checker, Fake Seller, Permission Settings, Live Calendar and Account.

Measurement outputs, including esbuild metafiles, are retained at `/private/tmp/bd-dashboard-perf-before-9ff5e8c/` and `/private/tmp/bd-dashboard-perf-after-9ff5e8c/`. Both runs use the same entry, external packages, browser platform, automatic JSX, minification, ESM and splitting. After counts include transitive static shared chunks, rather than only the smaller entry file.

The existing pre-change Vite artifact `dist/client/assets/page-B4ktOF08.js` measured 356,213 bytes / gzip 74,094 and contained Package and Account implementations. The final production-framework build must supply a corresponding after measurement; do not compare this Vite baseline directly with esbuild output.

## Interaction changes

| Flow | Before, from implementation inspection | After, exercised with actual React DOM and controlled transport |
| --- | --- | --- |
| Initial page | Full `/api/dashboard` must resolve before navigation appears | `section=bootstrap` verifies access and renders shell; only current inline module then fetches its fields |
| Self-fetching module | Full dashboard aggregate still loaded first | Bootstrap plus the module's existing scoped endpoint; no redundant dashboard snapshot request |
| Changing stores | Full dashboard request; selector disabled until completed | Immediate selection with scoped loading; previous request aborted, previous store's content hidden |
| Concurrent A → B → C | Sequence guard ignored old responses; issued queries continued | Abort plus sequence and store/section/revision key; late A/B responses cannot paint over C |
| Rate Card catalog | Persistent root provider requested admin catalog on every app entry | Authorized Account/Permission consumers trigger loading; concurrent consumers/manual refresh calls share one in-flight request |
| Scoped request failure | Dashboard data reset and whole application replaced | Shell stays usable with module-specific error and retry |

Data responses remain `cache: no-store`. Manual Update data and Permission Settings store changes arm a one-shot refresh epoch: after bootstrap, the next scoped module request includes `refresh=1`, bypassing the backend’s bounded advertising-facts cache. Initial reads and ordinary module/store switches do not force that bypass. Switching modules or refreshing does not reuse an indefinitely cached snapshot. Aborting a browser request does not guarantee cancellation of an already running server/database query.

## Verification

`tests/dashboard-on-demand-interaction.test.mjs` verifies the actual module dependency graph and React DOM behavior, not a snapshot of a replacement dashboard:

- Bootstrap precedes module data, and navigation appears before that data finishes.
- Seven module implementations stay outside initial static dependencies.
- Rapid store switches abort prior signals; out-of-order responses cannot repaint the active store.
- A module response naming the wrong store is rejected.
- Failed module reads retry without replacing the shell.
- A pending bootstrap refresh cannot overwrite a subsequent store selection.
- Packages uses its own endpoint; a client cannot see Account/Permission navigation or trigger eager Rate Card reads.
- Deferred Rate Card consumers and manual retries share one request and expose failures without inventing seed data.

New tests: 7/7 passed (including Staging isolation and opt-in profiling cases). Existing Store Account setup interaction regression: 2/2 passed. TypeScript passed. Scoped ESLint passed for the new boundary, root layout and catalog provider; the page retains existing explicit-any and effect lint debt.

No real API latency or visual acceptance is inferred from these controlled-transport tests. No business writes, deletes, deployments or commits were performed by this front-end change.

## Staging display isolation

The fixed Staging hostname requires an explicit `environment: staging` bootstrap. Module responses must match the bootstrap environment. Staging does not use production static snapshots, sales/order examples, default target amounts, static Drive folders or Fake Seller portal examples. Missing DB snapshots show no-data guidance; partial real Staging snapshots retain their real fields. An empty store list displays guidance instead of an endless loader. The header displays STAGING, and Packages hides its production Google Sheet History links while retaining local export and package save behavior. DOM tests exercise the same-name Mizino store, real Stage values, missing records, mismatched environments and the external-link guard.

## Opt-in profiling

Adding `debugLoad=1` to the page URL enables one JSON console.info record per bootstrap/module load. It contains relative performance.now start/end times, duration, request kind, section, store ID and success/cancellation booleans. Normal URLs emit no timing logs. Cancellation is never logged as success; no email, store name, financial value, token or full request URL is logged. These timings end after fetch/JSON/access validation and state enqueue; they do not claim to measure browser paint or lazy chunk completion. The esbuild size figures above precede this small final profiling helper; the final Vite build is the deployed-size comparison.
