-- Supabase default privileges may grant service_role ALL on newly created tables.
-- Preserve SELECT/INSERT only for immutable permission audit and request replay.
revoke all on public.user_access_audit_log from service_role;
grant select,insert on public.user_access_audit_log to service_role;
