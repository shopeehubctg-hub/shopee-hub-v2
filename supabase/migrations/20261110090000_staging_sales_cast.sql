-- Private signaling for the Staging pilot. No video or audio is stored here.
create table public.staging_sales_cast (
  tenant_id text primary key references public.tenants(id),
  room_id uuid not null unique,
  host_id bigint not null references public.customer_users(id),
  viewers jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null
);
alter table public.staging_sales_cast enable row level security;
revoke all on public.staging_sales_cast from public, anon, authenticated;
