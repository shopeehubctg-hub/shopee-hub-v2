# Package publishing release — 2026-09-28

## Changes

- **Save Draft** stores a package without writing to the Fulfillment Sheet. **Create Package** publishes a version to the `Package History` tab.
- Failed Sheet synchronization leaves the version retryable; retries use its stable Change ID and the Apps Script lock prevents duplicate rows.
- Package edits retain the full campaign event history and calculator snapshot in each version.
- Super Admin can remove a package from the active list while its database versions and audit trail remain available.

## Release checks

- `origin/main` was an ancestor of the release branch, so publication can fast-forward.
- Local build and the 16 rendered HTML tests passed using Node.js 24.19.0. Repository-wide lint has existing errors; the two errors in `app/package-control.tsx` are present in the preceding `origin/main` version.
- The Supabase migration `20260928090000_package_publish_and_archive.sql` was applied and verified before this release. Vercel Preview and Production have the Google Sheet webhook URL and secret configured.
- The deployed Apps Script accepted the existing system Change ID on a duplicate POST with HTTP 200 and `duplicate:true`. The original test appended exactly one `SYSTEM-QC-20260928-V2` row.

## Validation boundary

No authenticated user session was available for a fresh Dashboard → API → database → Sheet package creation. Production verification should include a signed-in Save Draft, Create Package, retry, and Super Admin removal when a suitable test account is available. No additional Sheet row or database package was created for this release check.
