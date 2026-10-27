-- Store registration, directory details, and first Account setup commit in one transaction.
-- Only the server's service role may execute these security-invoker functions.
create function public.account_store_setup_available() returns boolean
language sql stable security invoker set search_path='' as $$ select true $$;
revoke all on function public.account_store_setup_available() from public,anon,authenticated;
grant execute on function public.account_store_setup_available() to service_role;

create table public.account_store_requests (
  tenant_id text not null references public.tenants(id), request_id uuid not null,
  request_payload jsonb not null, result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(tenant_id,request_id)
);
alter table public.account_store_requests enable row level security;
revoke all on public.account_store_requests from public,anon,authenticated;
grant select,insert on public.account_store_requests to service_role;

create function public.account_write_store_directory(
  p_tenant text, p_store_id text, p_store_name text, p_details jsonb
) returns void language plpgsql security invoker set search_path='' as $$
declare item jsonb; project text; href text; drive text; seen text[]:=array[]::text[];
  owner text; group_link text; store_drive text;
begin
  if not exists(select 1 from public.stores where tenant_id=p_tenant and id=p_store_id)
    or jsonb_typeof(p_details) is distinct from 'object'
    or jsonb_typeof(p_details->'projectLinks') is distinct from 'array'
    or jsonb_array_length(p_details->'projectLinks')>20 then raise exception 'STORE_DETAILS_INVALID'; end if;
  owner:=p_details->>'adsTopUpOwner';
  group_link:=nullif(trim(coalesce(p_details->>'storeGroupLink','')),'');
  store_drive:=nullif(trim(coalesce(p_details->>'googleDriveLink','')),'');
  if owner is not null and owner not in ('Client','Client Approval','Shopee Hub')
    or length(coalesce(group_link,''))>2000 or length(coalesce(store_drive,''))>2000
    or (group_link is not null and group_link!~'^https?://[^[:space:]]+$')
    or (store_drive is not null and store_drive!~'^https?://[^[:space:]]+$') then raise exception 'STORE_DETAILS_INVALID'; end if;
  for item in select value from jsonb_array_elements(p_details->'projectLinks') loop
    if jsonb_typeof(item) is distinct from 'object' then raise exception 'STORE_DETAILS_INVALID'; end if;
    project:=trim(coalesce(item->>'project',''));
    href:=trim(coalesce(item->>'href',''));
    drive:=nullif(trim(coalesce(item->>'driveLink','')),'');
    if length(project) not between 1 and 120 or length(href) not between 1 and 2000
      or href!~'^https?://[^[:space:]]+$' or length(coalesce(drive,''))>2000
      or (drive is not null and drive!~'^https?://[^[:space:]]+$')
      or lower(project)=any(seen) then raise exception 'STORE_DETAILS_INVALID'; end if;
    seen:=array_append(seen,lower(project));
  end loop;
  insert into public.link_directory_stores(store_id,tenant_id,store_name,ads_top_up_owner,store_group_link,google_drive_link,source_sheet_id,source_tab)
    values(p_store_id,p_tenant,p_store_name,owner,group_link,store_drive,null,'Dashboard')
    on conflict(store_id) do update set ads_top_up_owner=excluded.ads_top_up_owner,
      store_group_link=excluded.store_group_link,google_drive_link=excluded.google_drive_link
    where public.link_directory_stores.tenant_id=p_tenant;
  if not found then raise exception 'STORE_ACCESS_DENIED'; end if;
  delete from public.link_directory_projects where store_id=p_store_id;
  for item in select value from jsonb_array_elements(p_details->'projectLinks') loop
    insert into public.link_directory_projects(store_id,project_name,project_group_link,google_drive_link)
      values(p_store_id,trim(item->>'project'),trim(item->>'href'),nullif(trim(coalesce(item->>'driveLink','')),''));
  end loop;
end $$;
revoke all on function public.account_write_store_directory(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.account_write_store_directory(text,text,text,jsonb) to service_role;

create function public.account_create_store_with_setup(
  p_tenant text,p_actor text,p_store_id text,p_name text,p_source_name text,p_market text,
  p_entity text,p_effective_month date,p_rule jsonb,p_details jsonb,p_request_id uuid
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved jsonb; prior public.account_store_requests; request_payload jsonb; result jsonb;
begin
  if not exists(select 1 from public.customer_users u join public.tenants t on t.id=u.tenant_id
      where u.tenant_id=p_tenant and lower(u.email)=lower(p_actor) and u.active and u.role='superadmin' and t.active)
    then raise exception 'STORE_ACCESS_DENIED'; end if;
  if p_store_id !~ '^shopee-[a-z0-9]+(-[a-z0-9]+)*$' or p_store_id is null
    or length(trim(p_name)) not between 1 and 120 or p_name is null
    or length(trim(p_source_name)) not between 1 and 120 or p_source_name is null
    or p_market not in ('MY','SG') or p_market is null or p_request_id is null
    or not coalesce(public.account_fee_rule_valid(p_rule,case p_market when 'MY' then 'MYR' else 'SGD' end),false)
    then raise exception 'STORE_SETUP_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtext(p_tenant),hashtext('store-create'));
  request_payload:=jsonb_build_object('mode','create','actor',lower(p_actor),'id',p_store_id,'name',p_name,
    'source',p_source_name,'market',p_market,'entity',p_entity,'month',p_effective_month,'rule',p_rule,'details',p_details);
  select * into prior from public.account_store_requests
    where tenant_id=p_tenant and request_id=p_request_id;
  if found then
    if prior.request_payload is distinct from request_payload then raise exception 'ACCOUNT_REQUEST_CONFLICT'; end if;
    return prior.result;
  end if;
  if exists(select 1 from public.stores where tenant_id=p_tenant and (
    lower(regexp_replace(trim(coalesce(display_name,name)),'[[:space:]]+',' ','g')) in
      (lower(regexp_replace(trim(p_name),'[[:space:]]+',' ','g')),lower(regexp_replace(trim(p_source_name),'[[:space:]]+',' ','g')))
    or lower(regexp_replace(trim(bigseller_name),'[[:space:]]+',' ','g')) in
      (lower(regexp_replace(trim(p_name),'[[:space:]]+',' ','g')),lower(regexp_replace(trim(p_source_name),'[[:space:]]+',' ','g')))))
    then raise exception 'STORE_DUPLICATE'; end if;
  insert into public.stores(id,tenant_id,name,platform,bigseller_name)
    values(p_store_id,p_tenant,trim(p_name),'Shopee '||p_market,trim(p_source_name));
  perform public.account_write_store_directory(p_tenant,p_store_id,trim(p_name),p_details);
  saved:=public.account_save_billing_unit_version(p_tenant,p_actor,'store:'||p_store_id,trim(p_name),trim(p_entity),
    case p_market when 'MY' then 'MYR' else 'SGD' end,p_effective_month,'setup',p_store_id,p_rule,0,p_request_id);
  result:=jsonb_build_object('id',p_store_id,'version',saved->>'version');
  insert into public.account_store_requests(tenant_id,request_id,request_payload,result)
    values(p_tenant,p_request_id,request_payload,result);
  return result;
end $$;
revoke all on function public.account_create_store_with_setup(text,text,text,text,text,text,text,date,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.account_create_store_with_setup(text,text,text,text,text,text,text,date,jsonb,jsonb,uuid) to service_role;

create function public.account_update_store_with_company(
  p_tenant text,p_actor text,p_store_id text,p_name text,p_source_name text,p_market text,
  p_entity text,p_effective_month date,p_rule jsonb,p_details jsonb,p_request_id uuid,
  p_roster_key text,p_expected_version bigint
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare target public.stores; latest public.account_billing_unit_versions;
  prior public.account_store_requests; saved jsonb:=null; request_payload jsonb; result jsonb;
begin
  if not exists(select 1 from public.customer_users u join public.tenants t on t.id=u.tenant_id
      where u.tenant_id=p_tenant and lower(u.email)=lower(p_actor) and u.active and u.role='superadmin' and t.active)
    then raise exception 'STORE_ACCESS_DENIED'; end if;
  if p_store_id is null or length(trim(p_name)) not between 1 and 120 or p_name is null
    or p_rule is not null or p_request_id is null or p_market not in ('MY','SG') or p_market is null
    then raise exception 'STORE_SETUP_INVALID'; end if;
  select * into target from public.stores where tenant_id=p_tenant and id=p_store_id for update;
  if not found then raise exception 'STORE_NOT_FOUND'; end if;
  if (target.platform='Shopee' and p_market<>'MY')
    or (target.platform<>'Shopee' and target.platform<>'Shopee '||p_market)
    or target.bigseller_name<>p_source_name
    then raise exception 'STORE_SETUP_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtext(p_tenant),hashtext(p_request_id::text));
  request_payload:=jsonb_build_object('mode','update','actor',lower(p_actor),'id',p_store_id,'name',p_name,
    'source',p_source_name,'market',p_market,'entity',p_entity,'month',p_effective_month,'rule',p_rule,
    'details',p_details,'rosterKey',p_roster_key,'expectedVersion',p_expected_version);
  select * into prior from public.account_store_requests
    where tenant_id=p_tenant and request_id=p_request_id;
  if found then
    if prior.request_payload is distinct from request_payload then raise exception 'ACCOUNT_REQUEST_CONFLICT'; end if;
    return prior.result;
  end if;
  if p_entity is not null then
    if p_roster_key is null or p_expected_version is null then raise exception 'STORE_SETUP_INVALID'; end if;
    select * into latest from public.account_billing_unit_versions
      where tenant_id=p_tenant and roster_key=p_roster_key order by version desc limit 1;
    if not found or latest.version<>p_expected_version or latest.store_id<>p_store_id
      then raise exception 'ACCOUNT_VERSION_CONFLICT'; end if;
  end if;
  if exists(select 1 from public.stores where tenant_id=p_tenant and id<>p_store_id
      and (lower(regexp_replace(trim(coalesce(display_name,name)),'[[:space:]]+',' ','g'))=lower(regexp_replace(trim(p_name),'[[:space:]]+',' ','g'))
        or lower(regexp_replace(trim(bigseller_name),'[[:space:]]+',' ','g'))=lower(regexp_replace(trim(p_name),'[[:space:]]+',' ','g'))))
    then raise exception 'STORE_DUPLICATE'; end if;
  update public.stores set display_name=case when p_name=target.name then null else trim(p_name) end
    where tenant_id=p_tenant and id=p_store_id;
  perform public.account_write_store_directory(p_tenant,p_store_id,target.name,p_details);
  if p_entity is not null then
    saved:=public.account_save_billing_unit_version(p_tenant,p_actor,p_roster_key,latest.roster_project,trim(p_entity),latest.currency,
      p_effective_month,'company',null,null,p_expected_version,p_request_id);
  end if;
  result:=jsonb_build_object('id',p_store_id,'version',saved->>'version');
  insert into public.account_store_requests(tenant_id,request_id,request_payload,result)
    values(p_tenant,p_request_id,request_payload,result);
  return result;
end $$;
revoke all on function public.account_update_store_with_company(text,text,text,text,text,text,text,date,jsonb,jsonb,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.account_update_store_with_company(text,text,text,text,text,text,text,date,jsonb,jsonb,uuid,text,bigint) to service_role;
