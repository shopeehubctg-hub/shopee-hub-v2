-- Production signaling table. Staging uses its existing isolated pilot table.
create table public.live_sales_cast_rooms (
  tenant_id text primary key references public.tenants(id),
  room_id uuid not null unique,
  host_id bigint not null,
  viewers jsonb not null default '{}'::jsonb check (jsonb_typeof(viewers) = 'object'),
  expires_at timestamptz not null,
  foreign key (tenant_id, host_id) references public.customer_users(tenant_id, id)
);
alter table public.live_sales_cast_rooms enable row level security;
revoke all on public.live_sales_cast_rooms from public, anon, authenticated, service_role;
