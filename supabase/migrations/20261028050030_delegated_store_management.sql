-- Prerequisite: 20261028045403_delegated_permission_settings.sql.
-- Store-only delegation; all other Account entry points retain account_assert_admin.
-- No records or schema objects are removed. Caller identity is server-derived.
create or replace function public.account_assert_store_manager(p_tenant text,p_actor text,p_store_id text default null)
returns public.customer_users language plpgsql security invoker set search_path='' as $$
declare manager public.customer_users;
begin
 if p_tenant is null or p_actor is null then raise exception 'STORE_ACCESS_DENIED';end if;
 perform 1 from public.tenants where id=p_tenant and active;
 if not found then raise exception 'STORE_ACCESS_DENIED';end if;
 -- Lock UPDATE immediately: self-grant advances permissions_version without a lock upgrade.
 -- Permission revocation takes this same actor row lock and therefore cannot race a Store write.
 select * into manager from public.customer_users where tenant_id=p_tenant and email=lower(p_actor) for update;
 if not found or not manager.active or (manager.role<>'superadmin' and not manager.can_manage_permissions) then raise exception 'STORE_ACCESS_DENIED';end if;
 if p_store_id is not null then
  if p_store_id='shopee-skindae-sg-by-ctg4u' or not exists(select 1 from public.stores where tenant_id=p_tenant and id=p_store_id) then raise exception 'STORE_ACCESS_DENIED';end if;
  if manager.role<>'superadmin' and manager.store_access_mode='selected' then
   perform 1 from public.user_store_access where user_id=manager.id and enabled
    and (case when store_id='shopee-skindae-sg-by-ctg4u' then 'shopee-skindae-sg' else store_id end)=p_store_id for share;
   if not found then raise exception 'STORE_ACCESS_DENIED';end if;
  end if;
 end if;
 return manager;
end $$;
revoke all on function public.account_assert_store_manager(text,text,text) from public,anon,authenticated;
grant execute on function public.account_assert_store_manager(text,text,text) to service_role;

create or replace function public.account_create_store_with_setup_v2(p_tenant text,p_actor text,p_store_id text,p_name text,p_source_name text,p_market text,p_setup jsonb,p_details jsonb,p_request_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare payload jsonb;prior jsonb;setup jsonb;version bigint;result jsonb;manager public.customer_users;before_access jsonb;after_access jsonb;access_request uuid;
begin
 manager:=public.account_assert_store_manager(p_tenant,p_actor,null);
 payload:=jsonb_build_object('mode','store-create-v2','actor',lower(p_actor),'id',p_store_id,'name',p_name,'source',p_source_name,'market',p_market,'setup',p_setup,'details',p_details);
 prior:=public.account_request_prior(p_tenant,p_request_id,payload);if prior is not null then return prior;end if;
 if p_store_id='shopee-skindae-sg-by-ctg4u' or p_store_id is null or p_store_id!~'^shopee-[a-z0-9]+(-[a-z0-9]+)*$' or length(trim(coalesce(p_name,''))) not between 1 and 120 or length(trim(coalesce(p_source_name,''))) not between 1 and 120 then raise exception 'STORE_SETUP_INVALID';end if;
 setup:=public.account_normalize_store_setup(p_tenant,p_market,p_setup);
 perform pg_advisory_xact_lock(hashtext(p_tenant),hashtext('store-registry'));
 if exists(select 1 from public.stores where tenant_id=p_tenant and (lower(regexp_replace(trim(coalesce(display_name,name)),'[[:space:]]+',' ','g')) in (lower(regexp_replace(trim(p_name),'[[:space:]]+',' ','g')),lower(regexp_replace(trim(p_source_name),'[[:space:]]+',' ','g'))) or lower(regexp_replace(trim(bigseller_name),'[[:space:]]+',' ','g')) in (lower(regexp_replace(trim(p_name),'[[:space:]]+',' ','g')),lower(regexp_replace(trim(p_source_name),'[[:space:]]+',' ','g'))))) then raise exception 'STORE_DUPLICATE';end if;
 if exists(select 1 from public.stores where id=p_store_id) then raise exception 'STORE_DUPLICATE';end if;
 insert into public.stores(id,tenant_id,name,platform,bigseller_name) values(p_store_id,p_tenant,trim(p_name),'Shopee '||p_market,trim(p_source_name));
 perform public.account_write_store_directory(p_tenant,p_store_id,trim(p_name),p_details);
 version:=public.account_append_unit_setup(p_tenant,p_actor,'store:'||p_store_id,trim(p_name),'MYR',p_store_id,p_market,setup,'setup',0,p_request_id);
 if manager.role<>'superadmin' and manager.store_access_mode='selected' then
  before_access:=jsonb_build_object('permissionsVersion',manager.permissions_version::text,'storeIds',public.permission_effective_stores(p_tenant,manager.id));
  insert into public.user_store_access(user_id,store_id,enabled) values(manager.id,p_store_id,true)
   on conflict(user_id,store_id) do update set enabled=true;
  update public.customer_users set permissions_version=permissions_version+1 where id=manager.id and tenant_id=p_tenant returning * into manager;
  after_access:=jsonb_build_object('permissionsVersion',manager.permissions_version::text,'storeIds',public.permission_effective_stores(p_tenant,manager.id));
  access_request:=md5('store-self-grant:'||p_request_id::text)::uuid;
  insert into public.user_access_audit_log(tenant_id,actor_user_id,target_user_id,actor_email,request_id,request_payload,before_value,after_value,result)
   values(p_tenant,manager.id,manager.id,lower(p_actor),access_request,
    jsonb_build_object('mode','store-self-grant','storeId',p_store_id,'parentRequestId',p_request_id::text),before_access,after_access,
    jsonb_build_object('id',manager.id,'version',manager.permissions_version::text));
 end if;
 result:=jsonb_build_object('id',p_store_id,'version',version::text);
 insert into public.account_store_requests(tenant_id,request_id,request_payload,result,created_at) values(p_tenant,p_request_id,payload,result,now());return result;
end $$;

create or replace function public.account_update_store_with_setup_v2(p_tenant text,p_actor text,p_store_id text,p_name text,p_source_name text,p_market text,p_setup jsonb,p_details jsonb,p_request_id uuid,p_roster_key text,p_expected_version bigint) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare payload jsonb;prior jsonb;setup jsonb;version bigint:=null;result jsonb;target public.stores;latest public.account_billing_unit_versions;applicable public.account_billing_unit_versions;company_only boolean;month date;
begin
 perform public.account_assert_store_manager(p_tenant,p_actor,p_store_id);
 payload:=jsonb_build_object('mode','store-update-v2','actor',lower(p_actor),'id',p_store_id,'name',p_name,'source',p_source_name,'market',p_market,'setup',p_setup,'details',p_details,'rosterKey',p_roster_key,'expectedVersion',p_expected_version::text);
 prior:=public.account_request_prior(p_tenant,p_request_id,payload);if prior is not null then return prior;end if;
 if length(trim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'STORE_SETUP_INVALID';end if;
 if p_setup is not null and p_setup<>'null'::jsonb then
  company_only:=jsonb_typeof(p_setup)='object' and not(p_setup?'feeRule') and not exists(select 1 from jsonb_object_keys(p_setup) k where k not in ('version','legalEntity','effectiveMonth'));
  if not company_only then setup:=public.account_normalize_store_setup(p_tenant,p_market,p_setup);end if;
 end if;
 perform pg_advisory_xact_lock(hashtext(p_tenant),hashtext('store-registry'));
 select * into target from public.stores where tenant_id=p_tenant and id=p_store_id for update;
 if not found then raise exception 'STORE_NOT_FOUND';end if;
 if p_market is null or p_market not in ('MY','SG','TH','PH') or (target.platform='Shopee' and p_market<>'MY') or (target.platform<>'Shopee' and target.platform<>'Shopee '||p_market) or target.bigseller_name is distinct from p_source_name then raise exception 'STORE_SETUP_INVALID';end if;
 if exists(select 1 from public.stores where tenant_id=p_tenant and id<>p_store_id and (lower(regexp_replace(trim(coalesce(display_name,name)),'[[:space:]]+',' ','g'))=lower(regexp_replace(trim(p_name),'[[:space:]]+',' ','g')) or lower(regexp_replace(trim(bigseller_name),'[[:space:]]+',' ','g'))=lower(regexp_replace(trim(p_name),'[[:space:]]+',' ','g')))) then raise exception 'STORE_DUPLICATE';end if;
 if p_setup is not null and p_setup<>'null'::jsonb then
  if company_only then
   if p_setup->>'version' is distinct from '2' or length(trim(coalesce(p_setup->>'legalEntity',''))) not between 1 and 240 or coalesce(p_setup->>'effectiveMonth','')!~'^20[0-9]{2}-(0[1-9]|1[0-2])$' then raise exception 'STORE_SETUP_INVALID';end if;
   month:=((p_setup->>'effectiveMonth')||'-01')::date;
   if month<date_trunc('month',now() at time zone 'Asia/Kuala_Lumpur')::date then raise exception 'ACCOUNT_PAST_MONTH';end if;
   perform pg_advisory_xact_lock(hashtext(p_tenant),hashtext('unit:'||coalesce(p_roster_key,'')));
   select * into latest from public.account_billing_unit_versions where tenant_id=p_tenant and roster_key=p_roster_key order by version desc limit 1;
   if not found or latest.version is distinct from p_expected_version or latest.store_id is distinct from p_store_id then raise exception 'ACCOUNT_VERSION_CONFLICT';end if;
   select * into applicable from public.account_billing_unit_versions where tenant_id=p_tenant and roster_key=p_roster_key and effective_month<=month order by effective_month desc,version desc limit 1;
   if not found then raise exception 'ACCOUNT_INVALID';end if;
   setup:=jsonb_build_object('version',2,'legalEntity',trim(p_setup->>'legalEntity'),'effectiveMonth',p_setup->>'effectiveMonth','clientType',applicable.client_type,'rateCard',applicable.rate_card,'feeRule',applicable.fee_rule,'inputCurrency',applicable.input_currency,'billingCurrency',coalesce(applicable.fee_rule->>'currency',applicable.currency),'fxPolicy',applicable.fx_policy)||case when applicable.fx_rate is null then '{}'::jsonb else jsonb_build_object('fxRate',applicable.fx_rate::text) end;
   version:=public.account_append_unit_setup(p_tenant,p_actor,p_roster_key,latest.roster_project,latest.currency,p_store_id,coalesce(applicable.market,p_market),setup,'company',p_expected_version,p_request_id);
  else
   if p_roster_key is distinct from 'store:'||p_store_id then raise exception 'STORE_SETUP_INVALID';end if;
   select * into latest from public.account_billing_unit_versions where tenant_id=p_tenant and roster_key=p_roster_key order by version desc limit 1;
   version:=public.account_append_unit_setup(p_tenant,p_actor,p_roster_key,coalesce(latest.roster_project,target.name),coalesce(latest.currency,'MYR'),p_store_id,p_market,setup,'setup',p_expected_version,p_request_id);
  end if;
 end if;
 update public.stores set display_name=case when trim(p_name)=target.name then null else trim(p_name) end where tenant_id=p_tenant and id=p_store_id;
 perform public.account_write_store_directory(p_tenant,p_store_id,target.name,p_details);
 result:=jsonb_build_object('id',p_store_id,'version',version::text);
 insert into public.account_store_requests(tenant_id,request_id,request_payload,result,created_at) values(p_tenant,p_request_id,payload,result,now());return result;
end $$;


revoke all on function public.account_create_store_with_setup_v2(text,text,text,text,text,text,jsonb,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.account_update_store_with_setup_v2(text,text,text,text,text,text,jsonb,jsonb,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.account_create_store_with_setup_v2(text,text,text,text,text,text,jsonb,jsonb,uuid) to service_role;
grant execute on function public.account_update_store_with_setup_v2(text,text,text,text,text,text,jsonb,jsonb,uuid,text,bigint) to service_role;
