-- Reviewed proposal: scoped catalog in Production + independent Staging.
-- REQUIRES explicit permission for the DROP INDEX below before execution.
-- No inventory/product/package/history rows are deleted or renamed.
alter table public.inventory_skus add column if not exists store_id text;
-- Both targets must expose a unique stores(tenant_id,id) key; verify before apply.
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.inventory_skus'::regclass and conname='inventory_skus_tenant_store_fk') then
  alter table public.inventory_skus add constraint inventory_skus_tenant_store_fk foreign key(tenant_id,store_id) references public.stores(tenant_id,id);
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.inventory_skus'::regclass and conname='inventory_skus_tenant_store_id_key') then
  alter table public.inventory_skus add constraint inventory_skus_tenant_store_id_key unique(tenant_id,store_id,id);
 end if;
end $$;
-- Production currently empty; Staging existing scoped rows must remain intact.
alter table public.inventory_skus alter column store_id set not null;
create unique index if not exists inventory_sku_project_key on public.inventory_skus(tenant_id,store_id,lower(btrim(sku)));
-- Explicit approval gate: replace only this old uniqueness index.
drop index public.inventory_sku_tenant_idx;
