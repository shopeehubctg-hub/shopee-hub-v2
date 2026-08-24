grant select, insert, update, delete on table
  public.customer_users,
  public.tenant_module_permissions,
  public.user_module_permissions,
  public.user_store_access,
  public.stores
to service_role;

grant usage, select on all sequences in schema public to service_role;
