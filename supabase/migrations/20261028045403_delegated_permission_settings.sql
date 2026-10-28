-- Independent administrative capability. Missing/default is false for every non-SA.
-- Ordinary module IDs, tenant defaults and existing module CHECKs are unchanged.
alter table public.customer_users add column if not exists can_manage_permissions boolean not null default false;
alter table public.customer_users add column if not exists permissions_version bigint not null default 0;
alter table public.user_store_access add column if not exists enabled boolean not null default true;

-- One independent permission lifecycle audit also provides exact request replay.
-- No permission, user, store or existing audit row is removed by this migration.
create table if not exists public.user_access_audit_log (
 id uuid primary key default gen_random_uuid(),tenant_id text not null references public.tenants(id),
 actor_user_id bigint not null references public.customer_users(id),target_user_id bigint not null references public.customer_users(id),
 actor_email text not null,request_id uuid not null,request_payload jsonb not null,
 before_value jsonb not null,after_value jsonb not null,result jsonb not null,
 created_at timestamptz not null default now(),unique(tenant_id,request_id)
);
create index if not exists user_access_audit_target_idx on public.user_access_audit_log(target_user_id,tenant_id,created_at desc);
create index if not exists user_access_audit_actor_idx on public.user_access_audit_log(actor_user_id);
alter table public.user_access_audit_log enable row level security;
revoke all on public.user_access_audit_log from public,anon,authenticated;
grant select,insert on public.user_access_audit_log to service_role;

create or replace function public.permission_effective_modules(p_tenant text,p_user_id bigint) returns text[]
language sql volatile security invoker set search_path='' as $$
 select coalesce(array_agg(m.id order by m.id),array[]::text[])
 from public.customer_users u cross join unnest(array['overview','design','calculator','packages','advertising','orders','health','protection','live_calendar','actions']) m(id)
 where u.id=p_user_id and u.tenant_id=p_tenant and (u.role='superadmin' or (
  (case when m.id='live_calendar' then exists(select 1 from public.tenant_module_permissions t where t.tenant_id=p_tenant and t.module_id=m.id and t.enabled)
   else not exists(select 1 from public.tenant_module_permissions t where t.tenant_id=p_tenant and t.module_id=m.id and not t.enabled) end)
  and (u.module_access_mode<>'custom' or exists(select 1 from public.user_module_permissions p where p.user_id=u.id and p.module_id=m.id and p.enabled))
 ))
$$;
create or replace function public.permission_effective_stores(p_tenant text,p_user_id bigint) returns text[]
language sql volatile security invoker set search_path='' as $$
 select coalesce(array_agg(s.id order by s.id),array[]::text[])
 from public.customer_users u join public.stores s on s.tenant_id=u.tenant_id
 where u.id=p_user_id and u.tenant_id=p_tenant and s.id<>'shopee-skindae-sg-by-ctg4u'
 and (u.role='superadmin' or u.store_access_mode='all' or exists(
  select 1 from public.user_store_access a where a.user_id=u.id and a.enabled
  and case when a.store_id='shopee-skindae-sg-by-ctg4u' then 'shopee-skindae-sg' else a.store_id end=s.id
 ))
$$;

create or replace function public.save_user_access(p_tenant text,p_actor text,p_target_id bigint,p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 actor public.customer_users;target public.customer_users;saved public.customer_users;
 prior public.user_access_audit_log;v_request_id uuid;expected bigint;v_request_payload jsonb;result jsonb;
 actor_modules text[];target_modules text[];actor_stores text[];target_stores text[];
 selected_modules text[];selected_stores text[];before_value jsonb;after_value jsonb;
 ordinary text[]:=array['overview','design','calculator','packages','advertising','orders','health','protection','live_calendar','actions'];
begin
 if p_tenant is null or p_actor is null or p_target_id is null then raise exception 'PERMISSION_INVALID';end if;
 -- All writers of user access use this tenant lock, followed by actor/target rows.
 -- It serializes capability revocation with delegated edits and avoids mutual-admin deadlocks.
 perform pg_advisory_xact_lock(hashtext(p_tenant),hashtext('user-access-write'));
 perform 1 from public.tenants where id=p_tenant and active for share;
 if not found then raise exception 'PERMISSION_ACCESS_DENIED';end if;
 select * into actor from public.customer_users where tenant_id=p_tenant and lower(email)=lower(p_actor) for share;
 if not found or not actor.active or (actor.role<>'superadmin' and not actor.can_manage_permissions) then raise exception 'PERMISSION_ACCESS_DENIED';end if;
 select * into target from public.customer_users where tenant_id=p_tenant and id=p_target_id for update;
 if not found then raise exception 'PERMISSION_SCOPE';end if;

 -- Reject unknown or partial state; routes extract this exact allowlist from UI rows.
 if jsonb_typeof(p_payload) is distinct from 'object'
 or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('displayName','role','active','moduleAccessMode','enabledModules','storeAccessMode','storeIds','canManagePermissions','expectedVersion','requestId'))
 or not(p_payload?&array['displayName','role','active','moduleAccessMode','enabledModules','storeAccessMode','storeIds','canManagePermissions','expectedVersion','requestId'])
 or jsonb_typeof(p_payload->'displayName') is distinct from 'string' or length(trim(p_payload->>'displayName'))>120
 or coalesce(p_payload->>'role','') not in ('customer','manager','superadmin')
 or jsonb_typeof(p_payload->'active') is distinct from 'boolean'
 or coalesce(p_payload->>'moduleAccessMode','') not in ('role_default','custom')
 or coalesce(p_payload->>'storeAccessMode','') not in ('all','selected')
 or jsonb_typeof(p_payload->'canManagePermissions') is distinct from 'boolean'
 or coalesce(p_payload->>'expectedVersion','')!~'^[0-9]{1,18}$'
 or jsonb_typeof(p_payload->'requestId') is distinct from 'string'
 or coalesce(p_payload->>'requestId','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
 or jsonb_typeof(p_payload->'enabledModules') is distinct from 'array'
 or jsonb_typeof(p_payload->'storeIds') is distinct from 'array' then raise exception 'PERMISSION_INVALID';end if;
 if jsonb_array_length(p_payload->'enabledModules')>10 or jsonb_array_length(p_payload->'storeIds')>1000
 or exists(select 1 from jsonb_array_elements(p_payload->'enabledModules') v where jsonb_typeof(v) is distinct from 'string' or not((v#>>'{}')=any(ordinary)))
 or exists(select 1 from jsonb_array_elements(p_payload->'storeIds') v where jsonb_typeof(v) is distinct from 'string' or length(v#>>'{}') not between 1 and 160) then raise exception 'PERMISSION_INVALID';end if;
 select coalesce(array_agg(v order by v),array[]::text[]) into selected_modules from jsonb_array_elements_text(p_payload->'enabledModules') v;
 select coalesce(array_agg(v order by v),array[]::text[]) into selected_stores from jsonb_array_elements_text(p_payload->'storeIds') v;
 if cardinality(selected_modules)<>(select count(distinct v) from unnest(selected_modules) v)
 or cardinality(selected_stores)<>(select count(distinct v) from unnest(selected_stores) v) then raise exception 'PERMISSION_INVALID';end if;
 if exists(select 1 from unnest(selected_stores) x where x='shopee-skindae-sg-by-ctg4u' or not exists(select 1 from public.stores s where s.id=x and s.tenant_id=p_tenant)) then raise exception 'PERMISSION_SCOPE';end if;

 -- Fresh auth and protected-target checks precede request replay too.
 perform 1 from public.user_module_permissions where user_id in (actor.id,target.id) for share;
 perform 1 from public.user_store_access where user_id in (actor.id,target.id) for share;
 perform 1 from public.tenant_module_permissions where tenant_id=p_tenant for share;
 actor_modules:=public.permission_effective_modules(p_tenant,actor.id);
 target_modules:=public.permission_effective_modules(p_tenant,target.id);
 actor_stores:=public.permission_effective_stores(p_tenant,actor.id);
 target_stores:=public.permission_effective_stores(p_tenant,target.id);
 if actor.role<>'superadmin' then
  if target.id=actor.id or target.role<>'customer' or target.can_manage_permissions then raise exception 'PERMISSION_PROTECTED';end if;
  if (target.store_access_mode='all' and actor.store_access_mode<>'all') or not(target_stores<@actor_stores) or not(target_modules<@actor_modules) then raise exception 'PERMISSION_SCOPE';end if;
  if p_payload->>'role'<>'customer' or (p_payload->>'canManagePermissions')::boolean
  or p_payload->>'moduleAccessMode'<>'custom' or p_payload->>'storeAccessMode'<>'selected'
  or not(selected_modules<@actor_modules) or not(selected_stores<@actor_stores) then raise exception 'PERMISSION_SCOPE';end if;
 end if;
 if target.id=actor.id and actor.role='superadmin' and (not(p_payload->>'active')::boolean or p_payload->>'role'<>'superadmin') then raise exception 'PERMISSION_SELF';end if;
 if p_payload->>'role'='customer'
 and ((p_payload->>'moduleAccessMode'='custom' and 'live_calendar'=any(selected_modules)) or (p_payload->>'moduleAccessMode'='role_default' and exists(select 1 from public.tenant_module_permissions t where t.tenant_id=p_tenant and t.module_id='live_calendar' and t.enabled)))
 and (p_payload->>'storeAccessMode'<>'selected' or cardinality(selected_stores)=0) then raise exception 'PERMISSION_INVALID';end if;

 v_request_id:=(p_payload->>'requestId')::uuid;expected:=(p_payload->>'expectedVersion')::bigint;
 v_request_payload:=jsonb_build_object('actor',lower(p_actor),'target',p_target_id,'payload',p_payload);
 select * into prior from public.user_access_audit_log where tenant_id=p_tenant and request_id=v_request_id;
 if found then
  if prior.request_payload is distinct from v_request_payload then raise exception 'PERMISSION_REQUEST_CONFLICT';end if;
  return prior.result;
 end if;
 if target.permissions_version<>expected then raise exception 'PERMISSION_VERSION_CONFLICT';end if;
 before_value:=jsonb_build_object('displayName',coalesce(target.display_name,''),'role',target.role,'active',target.active,'moduleAccessMode',target.module_access_mode,'enabledModules',target_modules,'storeAccessMode',target.store_access_mode,'storeIds',target_stores,'canManagePermissions',target.can_manage_permissions,'permissionsVersion',target.permissions_version::text);
 update public.customer_users set display_name=nullif(trim(p_payload->>'displayName'),''),
 role=p_payload->>'role',active=(p_payload->>'active')::boolean,module_access_mode=p_payload->>'moduleAccessMode',store_access_mode=p_payload->>'storeAccessMode',
 can_manage_permissions=case when actor.role='superadmin' then (p_payload->>'canManagePermissions')::boolean else target.can_manage_permissions end,
 permissions_version=target.permissions_version+1 where id=target.id and tenant_id=p_tenant returning * into saved;
 if saved.module_access_mode='custom' then
  insert into public.user_module_permissions(user_id,module_id,enabled,updated_at)
  select saved.id,m,m=any(selected_modules),now() from unnest(ordinary) m
  on conflict(user_id,module_id) do update set enabled=excluded.enabled,updated_at=excluded.updated_at;
 end if;
 if saved.store_access_mode='selected' then
  update public.user_store_access set enabled=false where user_id=saved.id and not(store_id=any(selected_stores));
  insert into public.user_store_access(user_id,store_id,enabled)
  select saved.id,s,true from unnest(selected_stores) s
  on conflict(user_id,store_id) do update set enabled=true;
 end if;
 after_value:=jsonb_build_object('displayName',coalesce(saved.display_name,''),'role',saved.role,'active',saved.active,'moduleAccessMode',saved.module_access_mode,'enabledModules',public.permission_effective_modules(p_tenant,saved.id),'storeAccessMode',saved.store_access_mode,'storeIds',public.permission_effective_stores(p_tenant,saved.id),'canManagePermissions',saved.can_manage_permissions,'permissionsVersion',saved.permissions_version::text);
 result:=jsonb_build_object('id',saved.id,'version',saved.permissions_version::text);
 insert into public.user_access_audit_log(tenant_id,actor_user_id,target_user_id,actor_email,request_id,request_payload,before_value,after_value,result)
 values(p_tenant,actor.id,target.id,lower(p_actor),v_request_id,v_request_payload,before_value,after_value,result);
 return result;
end $$;
revoke all on function public.permission_effective_modules(text,bigint),public.permission_effective_stores(text,bigint),public.save_user_access(text,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.permission_effective_modules(text,bigint),public.permission_effective_stores(text,bigint),public.save_user_access(text,text,bigint,jsonb) to service_role;
grant select on public.tenants,public.stores,public.tenant_module_permissions to service_role;
grant select,insert,update on public.customer_users,public.user_module_permissions,public.user_store_access to service_role;
do $$declare seq text;t text;begin
 foreach t in array array['user_module_permissions','user_store_access'] loop
  seq:=pg_get_serial_sequence('public.'||t,'id');if seq is not null then execute format('grant usage,select on sequence %s to service_role',seq);end if;
 end loop;
end $$;
notify pgrst,'reload schema';
