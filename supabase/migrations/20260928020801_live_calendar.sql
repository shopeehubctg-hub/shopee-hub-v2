-- Apply before deploying Calendar code. Review the target database and take a backup first.
do $$
begin
  if exists (
    select 1 from public.stores where id = 'shopee-skindae-sg'
      and (tenant_id <> 'j-packaging' or platform !~* '(SG|Singapore)')
  ) then
    raise exception 'SkinDae SG canonical ID conflicts with existing tenant/market; reconcile before migration';
  end if;
end;
$$;

-- The directory's SkinDae SG entry has its own canonical store ID, separate from MY.
insert into public.stores (id, tenant_id, name, platform, bigseller_name)
select 'shopee-skindae-sg', id, 'SkinDae SG', 'Shopee SG', 'SkinDae SG by CTG4u'
from public.tenants where id = 'j-packaging'
on conflict (id) do nothing;

-- Add canonical selected-store grants from the Orders/Directory slug alias.
-- Preserve legacy grants and store rows for older module references.
insert into public.user_store_access (user_id, store_id)
select usa.user_id, 'shopee-skindae-sg'
from public.user_store_access usa
join public.customer_users cu on cu.id = usa.user_id
join public.stores canonical on canonical.id = 'shopee-skindae-sg' and canonical.tenant_id = cu.tenant_id
where usa.store_id = 'shopee-skindae-sg-by-ctg4u' and cu.tenant_id = 'j-packaging'
on conflict (user_id, store_id) do nothing;

do $$
begin
  if exists (select 1 from pg_constraint where conrelid = 'public.stores'::regclass and conname = 'stores_tenant_id_id_key') then
    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.stores'::regclass and conname = 'stores_tenant_id_id_key'
        and contype = 'u' and pg_get_constraintdef(oid) = 'UNIQUE (tenant_id, id)'
    ) then
      raise exception 'stores_tenant_id_id_key exists with an unexpected definition';
    end if;
  else
    alter table public.stores add constraint stores_tenant_id_id_key unique (tenant_id, id);
  end if;
end;
$$;

-- Extend the actual existing checks rather than replacing their permission lists.
-- This preserves individual_ads and any other permissions already allowed by that database.
do $$
declare
  permission_table text;
  constraint_name text;
  existing_expression text;
begin
  foreach permission_table in array array['tenant_module_permissions', 'user_module_permissions'] loop
    constraint_name := permission_table || '_module_check';
    select pg_get_expr(conbin, conrelid) into existing_expression
    from pg_constraint
    where conrelid = format('public.%I', permission_table)::regclass
      and conname = constraint_name and contype = 'c';
    if existing_expression is null then
      raise exception 'Expected module check missing on %; inspect schema before migration', permission_table;
    end if;
    execute format('alter table public.%I drop constraint %I', permission_table, constraint_name);
    execute format('alter table public.%I add constraint %I check ((%s) or module_id = %L)',
      permission_table, constraint_name, existing_expression, 'live_calendar');
  end loop;
end;
$$;

-- Existing tenants must opt in. The explicit false row also keeps admin settings clear.
insert into public.tenant_module_permissions (tenant_id, module_id, enabled)
select id, 'live_calendar', false from public.tenants
on conflict (tenant_id, module_id) do nothing;

create table public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id),
  store_id text not null,
  title text not null default 'Live session',
  start_at timestamptz not null,
  end_at timestamptz not null,
  time_zone text not null check (time_zone in ('Asia/Kuala_Lumpur','Asia/Singapore')),
  status text not null default 'scheduled' check (status in ('scheduled','cancelled')),
  internal_note text,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint live_sessions_time_check check (end_at > start_at),
  constraint live_sessions_store_fk foreign key (tenant_id, store_id)
    references public.stores(tenant_id, id)
);
create index live_sessions_tenant_store_start_idx on public.live_sessions(tenant_id, store_id, start_at);
create index live_sessions_tenant_time_idx on public.live_sessions(tenant_id, start_at);

create table public.live_session_audit (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.live_sessions(id),
  tenant_id text not null,
  action text not null check (action in ('created','updated','cancelled')),
  actor_email text not null,
  previous_value jsonb,
  current_value jsonb not null,
  changed_at timestamptz not null default now()
);

create function public.audit_live_session_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  insert into public.live_session_audit
    (session_id, tenant_id, action, actor_email, previous_value, current_value)
  values
    (new.id, new.tenant_id,
      case when tg_op = 'INSERT' then 'created'
           when new.status = 'cancelled' and old.status <> 'cancelled' then 'cancelled'
           else 'updated' end,
      new.updated_by,
      case when tg_op = 'INSERT' then null else to_jsonb(old) end,
      to_jsonb(new));
  return new;
end;
$$;
revoke all on function public.audit_live_session_change() from public;
grant execute on function public.audit_live_session_change() to service_role;
create trigger live_session_audit_trigger
after insert or update on public.live_sessions
for each row execute function public.audit_live_session_change();

alter table public.live_sessions enable row level security;
alter table public.live_session_audit enable row level security;
revoke all on public.live_sessions, public.live_session_audit from anon, authenticated;
grant select, insert, update on public.live_sessions to service_role;
grant select, insert on public.live_session_audit to service_role;
grant usage, select on sequence public.live_session_audit_id_seq to service_role;
