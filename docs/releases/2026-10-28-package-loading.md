# Package loading performance — 28 October 2026

Package loading now shows an explicit pending state instead of a false empty list. Dashboard bootstrap fetches only navigation and access facts; module data and package history load on demand. Compact package reads use one snapshot and fetch only latest, published and required predecessor versions. Functions run in Singapore near Supabase.

This scoped release preserves existing Production permission-management APIs and schema. Permission delegation and its migrations remain in draft PR #28. No data migration or deletion.

Validation: user accepted the fixed Staging UI. Database Structure owner reviewed exact compact query and read-only Production schema compatibility. TypeScript, Next webpack production build and 36 targeted regressions pass. Stage samples: 18 packages in 606ms, all 139 packages in 245/297ms; small samples, not an SLA or Production benchmark. Final deployment verification is recorded separately.
