# Fixed Staging candidate — 2 November 2026

Integration base: 6213e0c7c4d772e354ebc848a1c0d9e385a4d5f2. Preserve the existing Xero/Account invoice amount disclosure and all earlier integrations. User authorized combining Package fixes with this Staging candidate.

Package List Normal-before-Campaign: main PR #47, 7c03f2c8d562c60b861c32d9d95bf014c432d151; released and Production smoke passed.
Package Start Date: codex/package-start-date-lock-20261102, e1f8b71c07d8d3fe43eeb8298818277d55b4ad08. No overlap in the four existing Package/test files against current main and Staging. Automated 57/57 PASS; TypeScript/webpack build PASS; Database Structure and guard review PASS, no migration. Actual combined Staging UI/UX and function QC pending; never treat this integration as Production acceptance.

Fixed URL: https://shopee-hub-v2-260731-git-cod-e05b8d-shopeehubctg-5199s-projects.vercel.app/
Independent DB: ubjfuveoqbvouryldqfu only. No Production auth/data replication.
