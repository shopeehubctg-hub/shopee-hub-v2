# Staging environment isolation

The fixed Staging URL is a Vercel Preview deployment. Every Vercel Preview runtime must use Supabase project `ubjfuveoqbvouryldqfu`; Vercel Production must use `zwnmonnbmqncwoytdigd`. A mismatched project or missing binding stops server access before the first database or Supabase request. `DASHBOARD_ENVIRONMENT=staging` applies the same checks to a local run. `VERCEL_ENV` takes precedence and cannot be downgraded by `DASHBOARD_ENVIRONMENT`.

## Preview configuration

Set these Preview-only values in the existing Vercel project:

- `DASHBOARD_ENVIRONMENT=staging`
- `SUPABASE_URL=https://ubjfuveoqbvouryldqfu.supabase.co`
- `SUPABASE_SECRET_KEY` from that Staging project
- `STAGING_SUPABASE_SECRET_SHA256` for an opaque `sb_secret_...` key: the SHA-256 hex digest of that exact Staging service key. An existing legacy service-role JWT with embedded `ref=ubjfuveoqbvouryldqfu` can omit this variable.
- `DATABASE_URL` for the same Staging project, using its direct host or pooler username `postgres.ubjfuveoqbvouryldqfu`

Keep the actual key and database password in Vercel secrets. A legacy JWT must identify the Staging project and `service_role`; a JWT with a missing or different project ref or role is rejected. When a fingerprint is provided, it must match even for a valid JWT. The JWT claim check establishes deployment identity, while Supabase verifies the token itself on use. Supabase REST, Auth, Storage, and direct Postgres access all check this configuration. No code path silently falls back to Production.

The Production deployment validates its Supabase URL and database URL against project `zwnmonnbmqncwoytdigd`; its existing service key stays in the Production environment. Do not make Production variables available to Preview.

## External effects

Staging does not send Package History to the customer Google Sheet. An inherited real webhook URL and secret are ignored. After the isolation checks pass, a test publish records a local receipt without a network request, so draft/publish/edit can be exercised using only the Staging database. The signed Apps Script package sync endpoint is disabled in Staging.

Signed BigSeller imports are disabled in Staging. A logged-in administrator can still run a manual import after the Staging database binding passes. Ad Balance manual import also writes only to the bound Staging database. Read-only external report fetches remain available.

Password recovery and reset are unavailable in Staging unless the account email is listed in `STAGING_AUTH_RECIPIENT_ALLOWLIST` (comma-separated). An allowed reset also requires a separate `STAGING_PORTAL_TEMPORARY_PASSWORD`; the Production temporary password is ignored. Existing Staging Auth sign-in and session validation remain available. No real customer email or specialist contact is triggered by default.

Before reviewing the fixed Staging UI, verify the deployment's Preview variables, run the isolation tests, and confirm that a Preview configured with either Production Supabase URL, Production pooler URL, or an unmatched service key fails before a write. Do not test this by writing to Production.
