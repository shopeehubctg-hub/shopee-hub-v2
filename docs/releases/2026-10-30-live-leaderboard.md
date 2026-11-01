# Compact Live Leaderboard release candidate

Prepared from `main` at `b3ce73b` with only the completed Live Leaderboard changes from Staging. The Sales Overview adds a compact weekly/monthly ranking for active Super Admins in their own tenant. The API reads the existing `live_leaderboard_snapshots` table, validates and sanitizes its eight-shop snapshot, and returns no raw source payload. Empty periods show names without carrying forward past sales amounts. Restricted viewers see a locked panel and make no leaderboard request.

This release adds no database schema or writes. Staging and Production remain on independent Supabase projects. It does not copy data between projects, create income, or alter Package features.

Validation: focused model/API/React DOM tests, Sales Overview integration tests, TypeScript and build are required on this focused branch. The prior Staging owner reported desktop empty-state UI PASS and 14 focused tests with TypeScript PASS. A populated leaderboard and mobile visual review have **not** been accepted; this candidate must not be described as visually complete. Final function QC should follow the required UI/UX review before Production merge.

No Delete, cleanup or database record change is part of this candidate.
