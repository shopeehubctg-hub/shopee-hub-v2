-- Dashboard reads directory details through the server's service role.
-- Add/Edit Store also writes profiles and replaces project rows through that role.
-- Keep these tables inaccessible to anon/authenticated REST callers.
grant select, insert, update on public.link_directory_stores to service_role;
grant select, insert, delete on public.link_directory_projects to service_role;
