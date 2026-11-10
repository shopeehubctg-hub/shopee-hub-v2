# Live Sales Monitor in Production

Production uses `public.live_sales_cast_rooms` and revocable portal sessions.
Set `SHOPEE_PORTAL_SESSION_SECURITY_ENABLED=1` in Production. Existing
sessions issued before activation require a fresh sign-in.

Store the independent relay configuration in the Production-only Vercel
secret `SALES_CAST_PRODUCTION_TURN`. It contains `url`, `username`,
`credential`, and an ISO `expiresAt`. The route refuses expired
configuration. This timestamp is enforced by the Dashboard and does not
expire a provider credential. Rotate the relay before this timestamp and
redeploy the current main commit to load the new settings.
