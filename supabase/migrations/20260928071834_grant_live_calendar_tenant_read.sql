-- The Calendar API checks that the signed-in user's tenant is active.
-- Keep tenant rows private to the server-side Supabase role.
grant select on table public.tenants to service_role;
