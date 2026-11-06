-- Independent Staging first. Canonical Store lifecycle and durable access revision.
-- No Store, grant, source fact, commercial version, user or audit record is deleted.
alter table public.stores
 add column if not exists service_status text not null default 'active' check(service_status in ('active','inactive','ended')),
 add column if not exists service_status_version bigint not null default 0 check(service_status_version>=0),
 add column if not exists service_status_updated_at timestamptz not null default now();
alter table public.user_store_access
 add column if not exists service_access_version bigint not null default 0 check(service_access_version>=0);
comment on column public.user_store_access.service_access_version is 'Explicit grant revision. Store lifecycle changes invalidate old grants; Active alone never renews them.';

-- Distinct lifecycle history/request receipt; commercial Account and user permission audits remain canonical.
create table public.store_service_events(
 id uuid primary key default gen_random_uuid(),tenant_id text not null references public.tenants(id),store_id text not null,
 actor_user_id bigint not null references public.customer_users(id),actor_email text not null,
 request_id uuid not null,request_payload jsonb not null,before_value jsonb not null,after_value jsonb not null,result jsonb not null,
 created_at timestamptz not null default now(),unique(tenant_id,request_id),
 foreign key(tenant_id,store_id) references public.stores(tenant_id,id));
create index store_service_events_store_idx on public.store_service_events(tenant_id,store_id,created_at desc);
create index store_service_events_actor_idx on public.store_service_events(actor_user_id);
alter table public.store_service_events enable row level security;
revoke all on public.store_service_events from public,anon,authenticated,service_role;
grant select,insert on public.store_service_events to service_role;

create or replace function public.permission_effective_stores(p_tenant text,p_user_id bigint) returns text[]
language sql volatile security invoker set search_path='' as $$
 select coalesce(array_agg(s.id order by s.id),array[]::text[])
 from public.customer_users u join public.tenants t on t.id=u.tenant_id join public.stores s on s.tenant_id=u.tenant_id
 where u.id=p_user_id and u.tenant_id=p_tenant and u.active and t.active and s.id<>'shopee-skindae-sg-by-ctg4u'
 and (u.role='superadmin' or (s.service_status='active' and (
  (u.store_access_mode='all' and s.service_status_version=0) or exists(
   select 1 from public.user_store_access a where a.user_id=u.id and a.enabled and a.service_access_version=s.service_status_version
    and case when a.store_id='shopee-skindae-sg-by-ctg4u' then 'shopee-skindae-sg' else a.store_id end=s.id
  )
 )))
$$;

-- An existing explicit leaderboard capability can expose other active stores on that board only.
-- Its lifecycle barrier remains identical; the caller cannot provide an untrusted all-stores flag.
create or replace function public.permission_effective_leaderboard_stores(p_tenant text,p_user_id bigint) returns text[]
language sql volatile security invoker set search_path='' as $$
 select case when exists(select 1 from public.customer_users u join public.tenants t on t.id=u.tenant_id
  where u.id=p_user_id and u.tenant_id=p_tenant and u.active and t.active
   and (u.role='superadmin' or 'overview_leaderboard_all_stores'=any(public.permission_effective_modules(p_tenant,p_user_id))))
 then (select coalesce(array_agg(s.id order by s.id),array[]::text[]) from public.stores s
  join public.customer_users u on u.tenant_id=s.tenant_id and u.id=p_user_id
  where s.tenant_id=p_tenant and s.id<>'shopee-skindae-sg-by-ctg4u'
   and (u.role='superadmin' or (s.service_status='active' and (s.service_status_version=0 or exists(
    select 1 from public.user_store_access a where a.user_id=u.id and a.enabled and a.service_access_version=s.service_status_version
     and case when a.store_id='shopee-skindae-sg-by-ctg4u' then 'shopee-skindae-sg' else a.store_id end=s.id)))))
 else public.permission_effective_stores(p_tenant,p_user_id) end
$$;

-- Direct legacy writers cannot renew a stale grant or enable an inactive Store.
create function public.guard_store_service_grant() returns trigger
language plpgsql security invoker set search_path='' as $$
declare t text;s public.stores;canonical text;
begin
 if not new.enabled then return new;end if;
 select tenant_id into t from public.customer_users where id=new.user_id;
 canonical:=case when new.store_id='shopee-skindae-sg-by-ctg4u' then 'shopee-skindae-sg' else new.store_id end;
 select * into s from public.stores where tenant_id=t and id=canonical;
 if not found then raise exception 'STORE_ACCESS_DENIED';end if;
 if s.service_status<>'active' then raise exception 'STORE_SERVICE_INACTIVE';end if;
 if new.service_access_version<>s.service_status_version then raise exception 'STORE_ACCESS_REGRANT_REQUIRED';end if;
 return new;
end $$;
create trigger user_store_access_service_guard before insert or update on public.user_store_access
 for each row execute function public.guard_store_service_grant();
revoke all on function public.guard_store_service_grant() from public,anon,authenticated;
grant execute on function public.guard_store_service_grant() to service_role;

CREATE OR REPLACE FUNCTION public.save_user_access(p_tenant text, p_actor text, p_target_id bigint, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 actor public.customer_users;target public.customer_users;saved public.customer_users;
 prior public.user_access_audit_log;v_request_id uuid;expected bigint;v_request_payload jsonb;result jsonb;
 actor_modules text[];target_modules text[];actor_stores text[];target_stores text[];
 selected_modules text[];selected_stores text[];before_value jsonb;after_value jsonb;
 ordinary text[]:=array['overview','design','calculator','packages','advertising','orders','health','protection','live_calendar','actions','overview_leaderboard','overview_leaderboard_all_stores','overview_store_sales'];
begin
 if p_tenant is null or p_actor is null or p_target_id is null then raise exception 'PERMISSION_INVALID';end if;
 -- All writers of user access use this tenant lock, followed by actor/target rows.
 -- It serializes capability revocation with delegated edits and avoids mutual-admin deadlocks.
 perform pg_advisory_xact_lock(hashtext(p_tenant),hashtext('user-access-write'));
 perform 1 from public.tenants where id=p_tenant and active;
 if not found then raise exception 'PERMISSION_ACCESS_DENIED';end if;
 select * into actor from public.customer_users where tenant_id=p_tenant and email=lower(p_actor) for share;
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
 if jsonb_array_length(p_payload->'enabledModules')>13 or jsonb_array_length(p_payload->'storeIds')>1000
 or exists(select 1 from jsonb_array_elements(p_payload->'enabledModules') v where jsonb_typeof(v) is distinct from 'string' or not((v#>>'{}')=any(ordinary)))
 or exists(select 1 from jsonb_array_elements(p_payload->'storeIds') v where jsonb_typeof(v) is distinct from 'string' or length(v#>>'{}') not between 1 and 160) then raise exception 'PERMISSION_INVALID';end if;
 select coalesce(array_agg(v order by v),array[]::text[]) into selected_modules from jsonb_array_elements_text(p_payload->'enabledModules') v;
 select coalesce(array_agg(v order by v),array[]::text[]) into selected_stores from jsonb_array_elements_text(p_payload->'storeIds') v;
 if cardinality(selected_modules)<>(select count(distinct v) from unnest(selected_modules) v)
 or cardinality(selected_stores)<>(select count(distinct v) from unnest(selected_stores) v) then raise exception 'PERMISSION_INVALID';end if;
 if exists(select 1 from unnest(selected_stores) x where x='shopee-skindae-sg-by-ctg4u' or not exists(select 1 from public.stores s where s.id=x and s.tenant_id=p_tenant)) then raise exception 'PERMISSION_SCOPE';end if;

 if p_payload->>'storeAccessMode'='selected' and p_payload->>'role'<>'superadmin' and exists(select 1 from public.stores s where s.tenant_id=p_tenant and s.id=any(selected_stores) and s.service_status<>'active') then raise exception 'STORE_SERVICE_INACTIVE';end if;

 if 'overview_leaderboard_all_stores'=any(selected_modules) and not('overview_leaderboard'=any(selected_modules)) then raise exception 'PERMISSION_INVALID';end if;
 if 'overview_leaderboard'=any(selected_modules) and
 (p_payload->>'moduleAccessMode'<>'custom' or not('overview'=any(selected_modules))) then
  raise exception 'PERMISSION_INVALID';
 end if;
 if 'overview_store_sales'=any(selected_modules) and
 (p_payload->>'moduleAccessMode'<>'custom' or not('overview'=any(selected_modules))) then
  raise exception 'PERMISSION_INVALID';
 end if;
 if 'overview_store_sales'=any(selected_modules) and
 (p_payload->>'storeAccessMode'<>'selected' or cardinality(selected_stores)=0) then
  raise exception 'PERMISSION_INVALID';
 end if;

 -- Fresh auth and protected-target checks precede request replay too.
 perform 1 from public.user_module_permissions where user_id in (actor.id,target.id) for share;
 perform 1 from public.user_store_access where user_id in (actor.id,target.id) for share;
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
 if saved.store_access_mode='selected' and saved.role<>'superadmin' then
  update public.user_store_access set enabled=false where user_id=saved.id and not(store_id=any(selected_stores));
  -- selected_stores is an explicit, fresh-CAS permission edit, not a status reactivation.
  insert into public.user_store_access(user_id,store_id,enabled,service_access_version)
  select saved.id,s.id,true,s.service_status_version from public.stores s
  where s.tenant_id=p_tenant and s.service_status='active' and s.id=any(selected_stores)
  on conflict(user_id,store_id) do update set enabled=true,service_access_version=excluded.service_access_version;
 end if;
 after_value:=jsonb_build_object('displayName',coalesce(saved.display_name,''),'role',saved.role,'active',saved.active,'moduleAccessMode',saved.module_access_mode,'enabledModules',public.permission_effective_modules(p_tenant,saved.id),'storeAccessMode',saved.store_access_mode,'storeIds',public.permission_effective_stores(p_tenant,saved.id),'canManagePermissions',saved.can_manage_permissions,'permissionsVersion',saved.permissions_version::text);
 result:=jsonb_build_object('id',saved.id,'version',saved.permissions_version::text);
 insert into public.user_access_audit_log(tenant_id,actor_user_id,target_user_id,actor_email,request_id,request_payload,before_value,after_value,result)
 values(p_tenant,actor.id,target.id,lower(p_actor),v_request_id,v_request_payload,before_value,after_value,result);
 return result;
end $function$;



create or replace function public.account_assert_store_manager(p_tenant text,p_actor text,p_store_id text default null)
returns public.customer_users language plpgsql security invoker set search_path='' as $$
declare manager public.customer_users;
begin
 if p_tenant is null or p_actor is null then raise exception 'STORE_ACCESS_DENIED';end if;
 perform pg_advisory_xact_lock(hashtext(p_tenant),hashtext('user-access-write'));
 perform 1 from public.tenants where id=p_tenant and active;
 if not found then raise exception 'STORE_ACCESS_DENIED';end if;
 select * into manager from public.customer_users where tenant_id=p_tenant and email=lower(p_actor) for update;
 if not found or not manager.active or (manager.role<>'superadmin' and not manager.can_manage_permissions) then raise exception 'STORE_ACCESS_DENIED';end if;
 if p_store_id is not null and (p_store_id='shopee-skindae-sg-by-ctg4u'
  or not(p_store_id=any(public.permission_effective_stores(p_tenant,manager.id)))) then raise exception 'STORE_ACCESS_DENIED';end if;
 return manager;
end $$;


create function public.store_service_affected_user_ids(p_tenant text,p_store_id text) returns bigint[]
language sql volatile security invoker set search_path='' as $$
 select coalesce(array_agg(u.id order by u.id),array[]::bigint[])
 from public.customer_users u where u.tenant_id=p_tenant and u.role<>'superadmin'
 and exists(select 1 from public.stores s where s.tenant_id=p_tenant and s.id=p_store_id)
 and (p_store_id=any(public.permission_effective_stores(p_tenant,u.id))
  or p_store_id=any(public.permission_effective_leaderboard_stores(p_tenant,u.id))
  or exists(select 1 from public.user_store_access a where a.user_id=u.id and a.enabled
   and case when a.store_id='shopee-skindae-sg-by-ctg4u' then 'shopee-skindae-sg' else a.store_id end=p_store_id))
$$;
create function public.preview_store_service_status(p_tenant text,p_actor text,p_store_id text) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare s public.stores;
begin
 perform public.account_assert_admin(p_tenant,p_actor);
 select * into s from public.stores where tenant_id=p_tenant and id=p_store_id;
 if not found or p_store_id='shopee-skindae-sg-by-ctg4u' then raise exception 'STORE_NOT_FOUND';end if;
 return jsonb_build_object('id',s.id,'serviceStatus',s.service_status,'serviceStatusVersion',s.service_status_version::text,'affectedUsers',cardinality(public.store_service_affected_user_ids(p_tenant,p_store_id)));
end $$;

create function public.set_store_service_status(p_tenant text,p_actor text,p_store_id text,p_status text,p_expected_version bigint,p_request_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare actor public.customer_users;target public.stores;prior public.store_service_events;payload jsonb;answer jsonb;before_store jsonb;affected jsonb:='[]';member public.customer_users;item jsonb;before_access jsonb;after_access jsonb;revoked integer:=0;ids text[];affected_ids bigint[];version bigint;
begin
 if p_tenant is null or p_actor is null or p_store_id is null or p_status is null or p_status not in ('active','inactive','ended') or p_expected_version is null or p_expected_version<0 or p_request_id is null then raise exception 'STORE_STATUS_INVALID';end if;
 perform pg_advisory_xact_lock(hashtext(p_tenant),hashtext('user-access-write'));
 perform 1 from public.tenants where id=p_tenant and active;
 if not found then raise exception 'STORE_ACCESS_DENIED';end if;
 select * into actor from public.customer_users where tenant_id=p_tenant and email=lower(p_actor) for update;
 if not found or not actor.active or actor.role<>'superadmin' then raise exception 'STORE_ACCESS_DENIED';end if;
 payload:=jsonb_build_object('actor',lower(p_actor),'storeId',p_store_id,'status',p_status,'expectedVersion',p_expected_version::text);
 select * into prior from public.store_service_events where tenant_id=p_tenant and request_id=p_request_id;
 if found then
  if prior.request_payload is distinct from payload then raise exception 'STORE_STATUS_REQUEST_CONFLICT';end if;
  return prior.result;
 end if;
 -- Permission writers take this same tenant advisory lock; actor/target rows precede Store/grants.
 perform 1 from public.customer_users where tenant_id=p_tenant and role<>'superadmin' order by id for update;
 select * into target from public.stores where tenant_id=p_tenant and id=p_store_id for update;
 if not found or p_store_id='shopee-skindae-sg-by-ctg4u' then raise exception 'STORE_NOT_FOUND';end if;
 if target.service_status_version<>p_expected_version then raise exception 'STORE_STATUS_VERSION_CONFLICT';end if;
 before_store:=jsonb_build_object('serviceStatus',target.service_status,'serviceStatusVersion',target.service_status_version::text);
 if target.service_status<>p_status then
  affected_ids:=public.store_service_affected_user_ids(p_tenant,p_store_id);
  for member in select * from public.customer_users where tenant_id=p_tenant and id=any(affected_ids) order by id loop
   ids:=public.permission_effective_stores(p_tenant,member.id);
   affected:=affected||jsonb_build_array(jsonb_build_object('userId',member.id,'before',jsonb_build_object('role',member.role,'active',member.active,'enabledModules',public.permission_effective_modules(p_tenant,member.id),'storeIds',ids,'leaderboardStoreIds',public.permission_effective_leaderboard_stores(p_tenant,member.id),'permissionsVersion',member.permissions_version::text)));
  end loop;
  update public.stores set service_status=p_status,service_status_version=service_status_version+1,service_status_updated_at=now() where tenant_id=p_tenant and id=p_store_id returning service_status_version into version;
  if p_status<>'active' then
   update public.user_store_access a set enabled=false
   from public.customer_users u where a.user_id=u.id and u.tenant_id=p_tenant and u.role<>'superadmin'
    and case when a.store_id='shopee-skindae-sg-by-ctg4u' then 'shopee-skindae-sg' else a.store_id end=p_store_id and a.enabled;
  end if;
  for item in select value from jsonb_array_elements(affected) loop
   update public.customer_users set permissions_version=permissions_version+1 where tenant_id=p_tenant and id=(item->>'userId')::bigint returning * into member;
   before_access:=item->'before';
   after_access:=jsonb_build_object('role',member.role,'active',member.active,'enabledModules',public.permission_effective_modules(p_tenant,member.id),'storeIds',public.permission_effective_stores(p_tenant,member.id),'leaderboardStoreIds',public.permission_effective_leaderboard_stores(p_tenant,member.id),'permissionsVersion',member.permissions_version::text);
   insert into public.user_access_audit_log(tenant_id,actor_user_id,target_user_id,actor_email,request_id,request_payload,before_value,after_value,result)
   values(p_tenant,actor.id,member.id,lower(p_actor),md5('store-service:'||p_request_id::text||':'||member.id::text)::uuid,
    jsonb_build_object('mode','store-service-status','storeId',p_store_id,'fromStatus',target.service_status,'toStatus',p_status,'parentRequestId',p_request_id),before_access,after_access,jsonb_build_object('id',member.id,'version',member.permissions_version::text));
   revoked:=revoked+1;
  end loop;
 else version:=target.service_status_version;end if;
 answer:=jsonb_build_object('id',p_store_id,'serviceStatus',p_status,'serviceStatusVersion',version::text,'revokedUsers',revoked);
 insert into public.store_service_events(tenant_id,store_id,actor_user_id,actor_email,request_id,request_payload,before_value,after_value,result)
 values(p_tenant,p_store_id,actor.id,lower(p_actor),p_request_id,payload,before_store,jsonb_build_object('serviceStatus',p_status,'serviceStatusVersion',version::text,'affectedUsers',affected),answer);
 return answer;
end $$;
revoke all on function public.permission_effective_stores(text,bigint),public.permission_effective_leaderboard_stores(text,bigint),public.save_user_access(text,text,bigint,jsonb),public.account_assert_store_manager(text,text,text),public.set_store_service_status(text,text,text,text,bigint,uuid),public.store_service_affected_user_ids(text,text),public.preview_store_service_status(text,text,text) from public,anon,authenticated;
grant execute on function public.permission_effective_stores(text,bigint),public.permission_effective_leaderboard_stores(text,bigint),public.save_user_access(text,text,bigint,jsonb),public.account_assert_store_manager(text,text,text),public.set_store_service_status(text,text,text,text,bigint,uuid),public.store_service_affected_user_ids(text,text),public.preview_store_service_status(text,text,text) to service_role;
notify pgrst,'reload schema';
