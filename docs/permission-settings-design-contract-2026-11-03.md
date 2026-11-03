# Permission Settings visual finish contract

The user rejected the previous Stores page. Earlier functional and modal checks did not establish visual quality of the full management page; that old visual approval does not apply to this redesign.

## Target

A calm, precise Shopee Hub management workspace. One clear page title, thin underline navigation, restrained navy primary action, a coherent table and readable typography. No oversized gradient hero, per-store floating cards, repeated platform badges or three equally prominent row actions.

## Required actual visual evidence

- Full-page desktop screenshot with real Staging data, including sidebar and page header. At 1440×900 equivalent desktop viewport and normal zoom, aim for at least eight complete 60px table rows in the first viewport.
- Store names lead the hierarchy; Country, Platform, Service and Actions have fixed consistent alignment. Status is a non-interactive green/amber/neutral pill.
- Search and country/status filters share a compact control row. Add Store is the only strong action. Manage is quiet; Edit details and Change service status live in overflow.
- Clean empty/filter-zero/loading states. No clipped menu, wrapped buttons, accidental horizontal scrolling or unreadably faint labels.
- Existing registered-name, Account, country setup and status confirmation dialogs remain functional. Keyboard overflow/escape and focus restoration must work.
- Mobile cannot be marked PASS from desktop CSS or source reading. If actual narrow viewport is unavailable, state that limit explicitly.

## Scope

Presentation and client-side filtering only. No database, store status, grant, rate, historical record or business data changes. Permission Settings is tenant-wide, so its redundant global Store/Project header is hidden; the compact page heading retains the Staging environment label.

Final sequence: actual visual review against this contract, then final functional QC. Tests alone are not aesthetic approval.
