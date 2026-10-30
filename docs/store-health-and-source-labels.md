# Canonical source labels and Store Health

Live Leaderboard username identity reuses the reviewed account roster and selector mapping. Deduplicate reviewed MAP identities by canonical store ID and require that ID to exist in the authenticated tenant. Display `display_name ?? name` from the current Store Selector registry. Do not guess fuzzy names, infer SG from MY, alter sales, or persist a second store directory.

Store Health is a read-only independent Staging bridge to the existing store_health_snapshots importer-owned relation. The source has no tenant/store IDs, so the API explicitly restricts environment and source ownership to the verified legacy roster tenant, active Super Admin and active tenant. The additional active test tenant must be denied. Production has no source table; this feature does not transfer any Stage records there.

Resolve source names with exact normalized current registry aliases and reviewed roster aliases; global ambiguity or absent canonical IDs are excluded. Read only the latest Shopee check date at/before MYT today and that day’s rows; do not revive historical checks for stores missing today. Validate nonnegative penalty integers, percentages 0–100 and ratings 0–5. Preserve missing/invalid metrics as unknown. Known source failing keys mean attention, unknown flags or missing values mean incomplete, complete metrics and no flags mean no flags. Notification workflow status never means healthy.

API responses exclude raw notification lines, group destinations, status notes, sending times and workflow state. Existing notification state and importer rights remain unchanged; only independent Staging server-role SELECT was added. No external messaging or data copying.

All Stores is a compact table; selected store is six metric cards and a short attention list. Existing snapshot/demo rendering is replaced with this guarded source module. Other users cannot fetch this initial Super Admin review view. Stage UI/UX and final functional QC must pass before a separate Production release request.
