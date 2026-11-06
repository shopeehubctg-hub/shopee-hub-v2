-- Independent Staging first. A Project groups existing canonical storefronts; it is not a billing client.
-- No Store IDs, imported aliases, grants, Account versions or financial facts are merged or removed.
create table public.store_projects (
 id uuid primary key default gen_random_uuid(),
 tenant_id text not null references public.tenants(id),
 name text not null check(name=trim(name) and length(name) between 1 and 120),
 requested_markets text[] not null default array[]::text[]
  check(cardinality(requested_markets)<=4 and array_position(requested_markets,null) is null
   and requested_markets <@ array['MY','SG','TH','PH']::text[]),
 version bigint not null default 1 check(version>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(tenant_id,id));
create unique index store_projects_tenant_name_idx on public.store_projects
 (tenant_id,lower(regexp_replace(trim(name),'[[:space:]]+',' ','g')));
alter table public.store_projects enable row level security;
revoke all on public.store_projects from public,anon,authenticated,service_role;
grant select,insert,update on public.store_projects to service_role;
alter table public.stores add column project_id uuid,
 add constraint stores_project_tenant_fk foreign key(tenant_id,project_id) references public.store_projects(tenant_id,id);
create index stores_tenant_project_idx on public.stores(tenant_id,project_id,id);
comment on column public.stores.project_id is 'Optional logical selector group; canonical Store identity, country, access and all fact owners remain unchanged.';
comment on column public.store_projects.requested_markets is 'Currently requested countries, including pending storefront setup. Not a permission grant. Previous values remain in configuration audit.';

create function public.store_project_market(p_platform text) returns text
language sql immutable security invoker set search_path='' as $$
 select case p_platform when 'Shopee' then 'MY' when 'Shopee MY' then 'MY'
  when 'Shopee SG' then 'SG' when 'Shopee TH' then 'TH' when 'Shopee PH' then 'PH' end
$$;

-- Single-statement read projection. Ordinary users never receive another country's Store ID or pending setup.
create function public.read_store_projects(p_tenant text,p_actor text,p_admin boolean default false) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare member public.customer_users;answer jsonb;
begin
 select u.* into member from public.customer_users u join public.tenants t on t.id=u.tenant_id
 where u.tenant_id=p_tenant and u.email=lower(p_actor) and u.active and t.active;
 if not found or (coalesce(p_admin,false) and member.role<>'superadmin') then raise exception 'STORE_PROJECT_ACCESS_DENIED';end if;
 if (select count(*) from public.stores where tenant_id=p_tenant)>2000
  or (select count(*) from public.store_projects where tenant_id=p_tenant)>1000 then raise exception 'STORE_PROJECT_LIMIT';end if;
 with scoped as materialized (
  select s.*,public.store_project_market(s.platform) as market from public.stores s
  where s.tenant_id=p_tenant and s.id=any(public.permission_effective_stores(p_tenant,member.id))
 ), visible as materialized (
  select s.* from scoped s left join public.store_projects p on p.tenant_id=s.tenant_id and p.id=s.project_id
  where p_admin or (s.service_status<>'ended' and (s.project_id is null or s.market=any(p.requested_markets)))
 ), groups as (
  select p.id,p.name,p.version,
   (select coalesce(jsonb_agg(jsonb_build_object('market',m.market,'enabled',m.market=any(p.requested_markets),
     'state',case when not exists(select 1 from visible v where v.project_id=p.id and v.market=m.market) then 'pending'
      when exists(select 1 from visible v where v.project_id=p.id and v.market=m.market and v.service_status='active') then 'configured'
      when exists(select 1 from visible v where v.project_id=p.id and v.market=m.market and v.service_status='inactive') then 'inactive' else 'ended' end,
     'stores',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'name',coalesce(v.display_name,v.name),
       'serviceStatus',v.service_status,'serviceStatusVersion',v.service_status_version::text) order by coalesce(v.display_name,v.name),v.id),'[]'::jsonb)
       from visible v where v.project_id=p.id and v.market=m.market)) order by array_position(array['MY','SG','TH','PH'],m.market)),'[]'::jsonb)
    from (select x as market from unnest(p.requested_markets) x where p_admin
      union select v.market from visible v where v.project_id=p.id and v.market is not null) m) as markets
  from public.store_projects p where p.tenant_id=p_tenant
   and (p_admin or exists(select 1 from visible v where v.project_id=p.id))
 )
 select jsonb_build_object('projects',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'version',g.version::text,'markets',g.markets) order by g.name,g.id) from groups g),'[]'::jsonb),
  'ungroupedStores',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'name',coalesce(v.display_name,v.name),'market',v.market,
    'serviceStatus',v.service_status,'serviceStatusVersion',v.service_status_version::text) order by coalesce(v.display_name,v.name),v.id)
    from visible v where v.project_id is null),'[]'::jsonb),
  'excludedStoreIds',case when p_admin then '[]'::jsonb else coalesce((select jsonb_agg(s.id order by s.id) from scoped s where not exists(select 1 from visible v where v.id=s.id)),'[]'::jsonb) end)
 into answer;
 return answer;
end $$;

-- One transaction for Project, optional independently entered storefronts and their complete Account setup.
-- Existing memberships are retained. Country removal requires prior explicit Store lifecycle confirmation.
create function public.save_store_project(p_tenant text,p_actor text,p_project_id uuid,p_spec jsonb,p_expected_version bigint,p_request_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare actor public.customer_users;prior jsonb;payload jsonb;target public.store_projects;project_uuid uuid;
 name_value text;market_spec jsonb;new_store jsonb;card_id text;market_value text;
 all_ids text[]:=array[]::text[];new_ids text[]:=array[]::text[];enabled_markets text[]:=array[]::text[];
 provided_markets text[]:=array[]::text[];selected_ids text[];before_value jsonb;after_value jsonb;answer jsonb;
begin
 if p_tenant is null or p_actor is null or p_expected_version is null or p_expected_version<0 or p_request_id is null then raise exception 'STORE_PROJECT_INVALID';end if;
 -- Same lifecycle/user access lock, then actor, request, Project, cards, registry and Store rows.
 perform pg_advisory_xact_lock(hashtext(p_tenant),hashtext('user-access-write'));
 select u.* into actor from public.customer_users u join public.tenants t on t.id=u.tenant_id
 where u.tenant_id=p_tenant and u.email=lower(p_actor) and u.active and u.role='superadmin' and t.active for update of u;
 if not found then raise exception 'STORE_PROJECT_ACCESS_DENIED';end if;
 payload:=jsonb_build_object('mode','store-project-save','actor',lower(p_actor),'projectId',p_project_id,'expectedVersion',p_expected_version::text,'spec',p_spec);
 prior:=public.account_request_prior(p_tenant,p_request_id,payload);if prior is not null then return prior;end if;
 if jsonb_typeof(p_spec) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_spec) k where k not in ('name','markets','newStores'))
  or jsonb_typeof(p_spec->'name') is distinct from 'string' or length(trim(p_spec->>'name')) not between 1 and 120
  or jsonb_typeof(p_spec->'markets') is distinct from 'array' or jsonb_array_length(p_spec->'markets') not between 1 and 4
  or jsonb_typeof(p_spec->'newStores') is distinct from 'array' or jsonb_array_length(p_spec->'newStores')>12 then raise exception 'STORE_PROJECT_INVALID';end if;
 name_value:=trim(p_spec->>'name');
 for market_spec in select value from jsonb_array_elements(p_spec->'markets') loop
  if jsonb_typeof(market_spec) is distinct from 'object' or exists(select 1 from jsonb_object_keys(market_spec) k where k not in ('market','enabled','storeIds'))
   or coalesce(market_spec->>'market','') not in ('MY','SG','TH','PH') or (market_spec->>'market')=any(provided_markets)
   or jsonb_typeof(market_spec->'enabled') is distinct from 'boolean' or jsonb_typeof(market_spec->'storeIds') is distinct from 'array'
   or jsonb_array_length(market_spec->'storeIds')>100
   or exists(select 1 from jsonb_array_elements(market_spec->'storeIds') id where jsonb_typeof(id) is distinct from 'string' or length(id#>>'{}') not between 1 and 200) then raise exception 'STORE_PROJECT_INVALID';end if;
  provided_markets:=array_append(provided_markets,market_spec->>'market');
  if (market_spec->>'enabled')::boolean then enabled_markets:=array_append(enabled_markets,market_spec->>'market');end if;
  select coalesce(array_agg(id),array[]::text[]) into selected_ids from jsonb_array_elements_text(market_spec->'storeIds') id;
  all_ids:=all_ids||selected_ids;
 end loop;
 if cardinality(all_ids)<> (select count(distinct id) from unnest(all_ids) id) or cardinality(all_ids)>100 then raise exception 'STORE_PROJECT_INVALID';end if;
 for new_store in select value from jsonb_array_elements(p_spec->'newStores') loop
  if jsonb_typeof(new_store) is distinct from 'object' or exists(select 1 from jsonb_object_keys(new_store) k where k not in ('id','name','sourceName','market','setup','details','requestId'))
   or coalesce(new_store->>'id','')!~'^shopee-[a-z0-9-]+$' or length(new_store->>'id')>200 or (new_store->>'id')=any(new_ids)
   or not((new_store->>'id')=any(all_ids)) or not((new_store->>'market')=any(enabled_markets))
   or jsonb_typeof(new_store->'market') is distinct from 'string' or jsonb_typeof(new_store->'name') is distinct from 'string' or jsonb_typeof(new_store->'sourceName') is distinct from 'string'
   or length(trim(coalesce(new_store->>'name',''))) not between 1 and 120 or length(trim(coalesce(new_store->>'sourceName',''))) not between 1 and 120
   or jsonb_typeof(new_store->'setup') is distinct from 'object' or jsonb_typeof(new_store->'details') is distinct from 'object'
   or coalesce(new_store->>'requestId','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   or (new_store->>'requestId')::uuid=p_request_id
   or not exists(select 1 from jsonb_array_elements(p_spec->'markets') m where m->>'market'=new_store->>'market' and (m->'storeIds')? (new_store->>'id')) then raise exception 'STORE_PROJECT_INVALID';end if;
  new_ids:=array_append(new_ids,new_store->>'id');
 end loop;
 if p_project_id is null then
  if p_expected_version<>0 or (cardinality(enabled_markets)=0 and cardinality(all_ids)=0) then raise exception 'STORE_PROJECT_INVALID';end if;
  project_uuid:=gen_random_uuid();
 else
  select * into target from public.store_projects where tenant_id=p_tenant and id=p_project_id for update;
  if not found then raise exception 'STORE_PROJECT_NOT_FOUND';end if;
  if target.version<>p_expected_version then raise exception 'STORE_PROJECT_VERSION_CONFLICT';end if;
  project_uuid:=target.id;
 end if;
 -- Pre-lock all selected Rate Cards in a deterministic order before taking the Store registry lock.
 for card_id in select distinct n#>>'{setup,rateCard,id}' from jsonb_array_elements(p_spec->'newStores') n where n#>>'{setup,rateCard,id}' is not null order by 1 loop
  perform pg_advisory_xact_lock(hashtext(p_tenant),hashtext('card:'||card_id));
 end loop;
 perform pg_advisory_xact_lock(hashtext(p_tenant),hashtext('store-registry'));
 perform 1 from public.stores where tenant_id=p_tenant and (id=any(all_ids) or project_id=project_uuid) order by id for update;
 if exists(select 1 from public.stores where tenant_id=p_tenant and project_id=project_uuid and not(id=any(all_ids))) then raise exception 'STORE_PROJECT_MEMBERS_REQUIRED';end if;
 if exists(select 1 from public.stores where tenant_id=p_tenant and id=any(all_ids) and project_id is not null and project_id<>project_uuid) then raise exception 'STORE_PROJECT_STORE_ALREADY_GROUPED';end if;
 if exists(select 1 from unnest(all_ids) wanted(id) where not(wanted.id=any(new_ids)) and not exists(select 1 from public.stores s where s.tenant_id=p_tenant and s.id=wanted.id and wanted.id<>'shopee-skindae-sg-by-ctg4u')) then raise exception 'STORE_PROJECT_STORE_SCOPE';end if;
 for market_spec in select value from jsonb_array_elements(p_spec->'markets') loop
  market_value:=market_spec->>'market';
  if exists(select 1 from public.stores s where s.tenant_id=p_tenant and (market_spec->'storeIds')?s.id and public.store_project_market(s.platform) is distinct from market_value) then raise exception 'STORE_PROJECT_MARKET_MISMATCH';end if;
  if not(market_spec->>'enabled')::boolean and exists(select 1 from public.stores s where s.tenant_id=p_tenant and (market_spec->'storeIds')?s.id and s.service_status='active') then raise exception 'STORE_PROJECT_STATUS_CONFIRMATION_REQUIRED';end if;
 end loop;
 before_value:=case when target.id is null then null else to_jsonb(target)||jsonb_build_object('storeIds',(select coalesce(jsonb_agg(id order by id),'[]'::jsonb) from public.stores where tenant_id=p_tenant and project_id=project_uuid)) end;
 if target.id is null then
  insert into public.store_projects(id,tenant_id,name,requested_markets) values(project_uuid,p_tenant,name_value,enabled_markets) returning * into target;
 else
  update public.store_projects set name=name_value,requested_markets=enabled_markets,version=version+1,updated_at=now() where tenant_id=p_tenant and id=project_uuid returning * into target;
 end if;
 for new_store in select value from jsonb_array_elements(p_spec->'newStores') order by value->>'id' loop
  if exists(select 1 from public.stores where id=new_store->>'id') then raise exception 'STORE_DUPLICATE';end if;
  perform public.account_create_store_with_setup_v2(p_tenant,p_actor,new_store->>'id',new_store->>'name',new_store->>'sourceName',new_store->>'market',new_store->'setup',new_store->'details',(new_store->>'requestId')::uuid);
  -- New country storefronts never become implicit grants through legacy all-store access mode.
  update public.stores set service_status_version=1 where tenant_id=p_tenant and id=new_store->>'id';
 end loop;
 update public.stores set project_id=project_uuid where tenant_id=p_tenant and id=any(all_ids);
 after_value:=to_jsonb(target)||jsonb_build_object('storeIds',to_jsonb(all_ids),'createdStoreIds',to_jsonb(new_ids));
 insert into public.account_audit_log(tenant_id,actor_email,action,record_type,record_id,before_value,after_value)
 values(p_tenant,lower(p_actor),'store_project_save','store_project',project_uuid,before_value,after_value);
 answer:=jsonb_build_object('id',project_uuid,'name',target.name,'version',target.version::text,'createdStoreIds',to_jsonb(new_ids));
 insert into public.account_store_requests(tenant_id,request_id,request_payload,result,created_at) values(p_tenant,p_request_id,payload,answer,now());
 return answer;
end $$;
revoke all on function public.store_project_market(text),public.read_store_projects(text,text,boolean),public.save_store_project(text,text,uuid,jsonb,bigint,uuid) from public,anon,authenticated;
grant execute on function public.store_project_market(text),public.read_store_projects(text,text,boolean),public.save_store_project(text,text,uuid,jsonb,bigint,uuid) to service_role;
notify pgrst,'reload schema';
