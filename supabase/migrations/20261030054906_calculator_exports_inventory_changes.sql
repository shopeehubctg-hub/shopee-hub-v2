-- Production activation of reviewed Staging evidence schema.
create table public.calculator_export_snapshots (
 id uuid primary key, tenant_id text not null, store_id text not null,
 actor text not null, request_id uuid not null, payload_hash text not null,
 schema_version integer not null default 1 check(schema_version=1),
 rules_version text not null, payload jsonb not null check(jsonb_typeof(payload)='object'),
 created_at timestamptz not null default now(),
 constraint calculator_export_store_fk foreign key(tenant_id,store_id) references public.stores(tenant_id,id),
 constraint calculator_export_request_key unique(tenant_id,request_id)
);
create index calculator_export_store_idx on public.calculator_export_snapshots(tenant_id,store_id,created_at desc);
alter table public.calculator_export_snapshots enable row level security;
revoke all on public.calculator_export_snapshots from public,anon,authenticated;
create table public.inventory_sku_changes (
 id uuid primary key, tenant_id text not null, store_id text not null, catalog_id text not null,
 actor text not null, request_id uuid not null, payload_hash text not null,
 before_value jsonb not null, after_value jsonb not null, created_at timestamptz not null default now(),
 constraint inventory_changes_store_fk foreign key(tenant_id,store_id) references public.stores(tenant_id,id),
 constraint inventory_changes_catalog_fk foreign key(tenant_id,store_id,catalog_id) references public.inventory_skus(tenant_id,store_id,id),
 constraint inventory_changes_request_key unique(tenant_id,request_id)
);
create index inventory_changes_catalog_idx on public.inventory_sku_changes(tenant_id,store_id,catalog_id,created_at desc);
alter table public.inventory_sku_changes enable row level security;
revoke all on public.inventory_sku_changes from public,anon,authenticated;
create function public.keep_pricing_catalog_evidence() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Pricing and catalog evidence is append-only'; end $$;
revoke all on function public.keep_pricing_catalog_evidence() from public,anon,authenticated;
create trigger calculator_export_immutable before update or delete on public.calculator_export_snapshots for each row execute function public.keep_pricing_catalog_evidence();
create trigger inventory_changes_immutable before update or delete on public.inventory_sku_changes for each row execute function public.keep_pricing_catalog_evidence();
