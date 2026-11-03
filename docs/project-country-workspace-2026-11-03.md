# Project and country workspace

Status: implementation and isolated Staging verification in progress. No Production release.

A Project is a tenant-owned selector group. Canonical country storefront IDs, source names, grants, Package owners, Account units and historical facts stay intact. Existing linked storefronts remain members permanently; current enabled countries are versioned configuration. No store or business record is deleted.

The header shows one Project entry, with authorized country buttons for fact modules. The selector intersects group results with the current Dashboard-authorized stores. Disabled and ended storefronts cannot reappear as legacy fallback entries. Unknown/ungrouped stores remain independent until their relationship is confirmed.

Packages and Calculator retain an explicit operation storefront plus their existing country price controls. A fact-country change does not move old multi-market packages to a different Store. The Project relationship never grants access to an operation storefront.

Super Admin Add Store supports per-country existing storefront linking, independently entered new storefronts or explicitly pending setup. Each new country requires its own complete Account setup, exact Rate Card version/effective invoice month and FX policy. Existing storefront rates and FX are preserved. Optional links and advertising top-up ownership remain available. Account security must be unlocked for new Account-backed storefront creation.

Sales retain their source currency. Current fee thresholds and final billing remain MYR; UI states this explicitly. SG fixed/BNM policies remain as approved; TH/PH use preceding service-month BNM average. Missing quotes remain unresolved, never 1:1. No financial records are fabricated.

Removing an active country is blocked in UI and RPC until the administrator reviews each affected storefront through the existing lifecycle impact/confirmation. Configuration save retains memberships and Account/history. Reactivation never renews ordinary access. New country storefronts use an access epoch requiring explicit grants even for legacy all-mode users.

The first evidence-backed group is SkinDae MY/SG. Similar names alone are not sufficient to group any other projects. iLady SG market inconsistency and ambiguous Mizino billing units remain unresolved.

Release gates: Database Structure review, rollback-only SQL/API/UI tests, fixed Staging deployment, actual UI/UX review, final functional QC, then explicit Production authorization. Static review is not visual acceptance.

## Initial Staging verification

Reviewed SkinDae grouping was first executed with ROLLBACK, then committed through the same service-role RPC on independent Staging. Saved Project `0b01b2e6-ede9-476f-965f-1a210b06a546`, revision 1, links only existing MY and SG Store IDs; createdStoreIds is empty. Script asserts no Store identity/status, grant or Account version changes. No other project was guessed or grouped.

Combined app verification: 20 targeted API/model/UI interaction and existing-permission/Account/status regression tests passed, TypeScript and full build passed. A required storefront name prevents silently inventing an import name from the project label. Actual deployment/visual review remains a separate gate.
