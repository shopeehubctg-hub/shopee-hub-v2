-- Dashboard reads actions on the server after enforcing tenant and storefront access.
grant select on table public.management_actions to service_role;
