-- Additive Registered Name (Platform/Billing) configuration. Stage is the first target.
-- No existing names are backfilled, no ledger/source facts are changed, and no object is deleted.
-- legal_entity remains the Platform compatibility field. NULL Billing means unknown/preserve.
alter table public.account_billing_unit_versions
 add column if not exists billing_registered_name text
 constraint account_billing_unit_billing_registered_name_check
 check (billing_registered_name is null or (billing_registered_name=trim(billing_registered_name) and length(billing_registered_name) between 1 and 240));
comment on column public.account_billing_unit_versions.legal_entity is 'Registered Name (Platform); legacy API entity/legalEntity alias retained.';
comment on column public.account_billing_unit_versions.billing_registered_name is 'Registered Name (Billing), month-effective configuration; NULL is unknown. Never inferred from Xero or Platform.';

-- Every version writer (including legacy fee/mapping and Xero identity-only anchors) retains
-- the name effective in its own month. Future names never leak into earlier identity anchors.
-- Company/setup actions alone own name changes; carried values on fee/mapping rows are snapshots.
create or replace function public.account_carry_billing_registered_name() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(new.tenant_id),hashtext('unit:'||new.roster_key));
 if new.billing_registered_name is null then
  select v.billing_registered_name into new.billing_registered_name
  from public.account_billing_unit_versions v
  where v.tenant_id=new.tenant_id and v.roster_key=new.roster_key
   and v.effective_month<=new.effective_month and v.change_action in ('company','setup')
   and v.billing_registered_name is not null
  order by v.effective_month desc,v.version desc limit 1;
 end if;
 return new;
end $$;
create trigger account_billing_unit_carry_registered_name
 before insert on public.account_billing_unit_versions
 for each row execute function public.account_carry_billing_registered_name();
revoke all on function public.account_carry_billing_registered_name() from public,anon,authenticated;
grant execute on function public.account_carry_billing_registered_name() to service_role;

create or replace function public.account_registered_names_available() returns boolean
language sql stable security invoker set search_path='' as $$select true$$;
revoke all on function public.account_registered_names_available() from public,anon,authenticated;
grant execute on function public.account_registered_names_available() to service_role;

create or replace function public.account_normalize_store_setup(p_tenant text,p_market text,p_setup jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare src text;month date;card public.account_rate_card_versions;rule jsonb;card_ref jsonb:=null;policy text;rate text;
begin
 src:=case p_market when 'MY' then 'MYR' when 'SG' then 'SGD' when 'TH' then 'THB' when 'PH' then 'PHP' end;
 if src is null or jsonb_typeof(p_setup) is distinct from 'object' or p_setup->>'version' is distinct from '2' or length(trim(coalesce(p_setup->>'legalEntity',''))) not between 1 and 240 or coalesce(p_setup->>'effectiveMonth','')!~'^20[0-9]{2}-(0[1-9]|1[0-2])$' or coalesce(p_setup->>'clientType','') not in ('Internal','External') or p_setup->>'inputCurrency' is distinct from src or p_setup->>'billingCurrency' is distinct from 'MYR' then raise exception 'STORE_SETUP_INVALID';end if;
 if p_setup->'billingEntity' is not null and p_setup->'billingEntity'<>'null'::jsonb and (jsonb_typeof(p_setup->'billingEntity') is distinct from 'string' or length(trim(p_setup->>'billingEntity')) not between 1 and 240) then raise exception 'STORE_SETUP_INVALID';end if;
 month:=((p_setup->>'effectiveMonth')||'-01')::date;
 if month<date_trunc('month',now() at time zone 'Asia/Kuala_Lumpur')::date then raise exception 'ACCOUNT_PAST_MONTH';end if;
 if p_setup->'rateCard' is not null and p_setup->'rateCard'<>'null'::jsonb then
  if jsonb_typeof(p_setup->'rateCard') is distinct from 'object' or coalesce(p_setup#>>'{rateCard,id}','')='' or coalesce(p_setup#>>'{rateCard,version}','')!~'^[1-9][0-9]{0,17}$' then raise exception 'STORE_SETUP_INVALID';end if;
  perform pg_advisory_xact_lock(hashtext(p_tenant),hashtext('card:'||(p_setup#>>'{rateCard,id}')));
  if exists(select 1 from public.account_rate_card_versions where tenant_id=p_tenant and card_id=p_setup#>>'{rateCard,id}' and archived_at is not null) then raise exception 'ACCOUNT_CARD_ARCHIVED';end if;
  select * into card from public.account_rate_card_versions where tenant_id=p_tenant and card_id=p_setup#>>'{rateCard,id}' and effective_month<=month order by effective_month desc,version desc limit 1;
  if not found then raise exception 'ACCOUNT_CARD_NOT_FOUND';end if;
  if card.version<>(p_setup#>>'{rateCard,version}')::bigint then raise exception 'ACCOUNT_VERSION_CONFLICT';end if;
  if card.currency<>'MYR' or card.client_type<>p_setup->>'clientType' then raise exception 'STORE_SETUP_INVALID';end if;
  if p_setup->'feeRule' is distinct from card.fee_rule then raise exception 'ACCOUNT_VERSION_CONFLICT';end if;
  rule:=card.fee_rule;card_ref:=jsonb_build_object('id',card.card_id,'version',card.version,'name',card.name);
 else rule:=p_setup->'feeRule';end if;
 if not coalesce(public.account_fee_rule_valid(rule,'MYR'),false) then raise exception 'STORE_SETUP_INVALID';end if;
 policy:=p_setup->>'fxPolicy';rate:=p_setup->>'fxRate';
 if (p_market='MY' and (policy is distinct from 'none' or rate is not null))
 or (p_market in ('TH','PH') and (policy is distinct from 'bnm-service-average' or rate is not null))
 or (p_market='SG' and ((policy not in ('fixed','bnm-service-average') or policy is null) or (p_setup->>'clientType'='Internal' and policy<>'fixed') or (policy='fixed' and rate is distinct from '3.2') or (policy='bnm-service-average' and rate is not null))) then raise exception 'STORE_SETUP_INVALID';end if;
 return jsonb_build_object('version',2,'legalEntity',trim(p_setup->>'legalEntity'),'effectiveMonth',p_setup->>'effectiveMonth','clientType',p_setup->>'clientType','rateCard',card_ref,'feeRule',rule,'inputCurrency',src,'billingCurrency','MYR','fxPolicy',policy)||case when p_setup->>'billingEntity' is null then '{}'::jsonb else jsonb_build_object('billingEntity',trim(p_setup->>'billingEntity')) end||case when rate is null then '{}'::jsonb else jsonb_build_object('fxRate',rate) end;
end $$;

create or replace function public.account_append_unit_setup(p_tenant text,p_actor text,p_roster_key text,p_project text,p_currency text,p_store_id text,p_market text,p_setup jsonb,p_action text,p_expected_version bigint,p_request_id uuid) returns bigint
language plpgsql security invoker set search_path='' as $$
declare latest public.account_billing_unit_versions;saved public.account_billing_unit_versions;month date;
begin
 if p_roster_key is null or p_roster_key!~'^(roster-2026-10-(my|sg)-[0-9]+|store:shopee-[a-z0-9-]+)$' or length(trim(coalesce(p_project,''))) not between 1 and 120 or p_currency is null or p_currency not in ('MYR','SGD','THB','PHP') or p_expected_version is null or p_expected_version<0 then raise exception 'ACCOUNT_INVALID';end if;
 if p_store_id is not null and not exists(select 1 from public.stores where tenant_id=p_tenant and id=p_store_id) then raise exception 'ACCOUNT_INVALID';end if;
 if p_store_id is not null and exists(select 1 from public.stores where tenant_id=p_tenant and id=p_store_id and platform in ('Shopee MY','Shopee SG','Shopee TH','Shopee PH') and platform<>'Shopee '||p_market) then raise exception 'ACCOUNT_INVALID';end if;
 if p_roster_key like 'store:%' and p_store_id is distinct from substring(p_roster_key from 7) then raise exception 'ACCOUNT_INVALID';end if;
 perform pg_advisory_xact_lock(hashtext(p_tenant),hashtext('unit:'||p_roster_key));
 select * into latest from public.account_billing_unit_versions where tenant_id=p_tenant and roster_key=p_roster_key order by version desc limit 1;
 if coalesce(latest.version,0)<>p_expected_version then raise exception 'ACCOUNT_VERSION_CONFLICT';end if;
 if latest.id is not null and latest.currency<>p_currency then raise exception 'ACCOUNT_INVALID';end if;
 if p_setup->'billingEntity' is not null and p_setup->'billingEntity'<>'null'::jsonb and (jsonb_typeof(p_setup->'billingEntity') is distinct from 'string' or length(trim(p_setup->>'billingEntity')) not between 1 and 240) then raise exception 'STORE_SETUP_INVALID';end if;
 month:=((p_setup->>'effectiveMonth')||'-01')::date;
 insert into public.account_billing_unit_versions(tenant_id,roster_key,roster_project,legal_entity,currency,store_id,effective_month,version,change_action,fee_rule,actor_email,request_id,request_payload,market,input_currency,client_type,rate_card,fx_policy,fx_rate,billing_registered_name)
 values(p_tenant,p_roster_key,trim(p_project),trim(p_setup->>'legalEntity'),p_currency,p_store_id,month,coalesce(latest.version,0)+1,p_action,p_setup->'feeRule',lower(p_actor),p_request_id,p_setup,p_market,p_setup->>'inputCurrency',p_setup->>'clientType',nullif(p_setup->'rateCard','null'::jsonb),p_setup->>'fxPolicy',(p_setup->>'fxRate')::numeric,trim(p_setup->>'billingEntity')) returning * into saved;
 insert into public.account_audit_log(tenant_id,actor_email,action,record_type,record_id,before_value,after_value) values(p_tenant,lower(p_actor),p_action,'billing_unit_version',saved.id,to_jsonb(latest),to_jsonb(saved));
 return saved.version;
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
  company_only:=jsonb_typeof(p_setup)='object' and not(p_setup?'feeRule') and not exists(select 1 from jsonb_object_keys(p_setup) k where k not in ('version','legalEntity','billingEntity','effectiveMonth'));
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
   if p_setup->'billingEntity' is not null and p_setup->'billingEntity'<>'null'::jsonb and (jsonb_typeof(p_setup->'billingEntity') is distinct from 'string' or length(trim(p_setup->>'billingEntity')) not between 1 and 240) then raise exception 'STORE_SETUP_INVALID';end if;
   month:=((p_setup->>'effectiveMonth')||'-01')::date;
   if month<date_trunc('month',now() at time zone 'Asia/Kuala_Lumpur')::date then raise exception 'ACCOUNT_PAST_MONTH';end if;
   perform pg_advisory_xact_lock(hashtext(p_tenant),hashtext('unit:'||coalesce(p_roster_key,'')));
   select * into latest from public.account_billing_unit_versions where tenant_id=p_tenant and roster_key=p_roster_key order by version desc limit 1;
   if not found or latest.version is distinct from p_expected_version or latest.store_id is distinct from p_store_id then raise exception 'ACCOUNT_VERSION_CONFLICT';end if;
   select * into applicable from public.account_billing_unit_versions where tenant_id=p_tenant and roster_key=p_roster_key and effective_month<=month order by effective_month desc,version desc limit 1;
   if not found then raise exception 'ACCOUNT_INVALID';end if;
   setup:=jsonb_build_object('version',2,'legalEntity',trim(p_setup->>'legalEntity'),'billingEntity',p_setup->>'billingEntity','effectiveMonth',p_setup->>'effectiveMonth','clientType',applicable.client_type,'rateCard',applicable.rate_card,'feeRule',applicable.fee_rule,'inputCurrency',applicable.input_currency,'billingCurrency',coalesce(applicable.fee_rule->>'currency',applicable.currency),'fxPolicy',applicable.fx_policy)||case when applicable.fx_rate is null then '{}'::jsonb else jsonb_build_object('fxRate',applicable.fx_rate::text) end;
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

-- The caller supplies roster metadata resolved by the server from the audited roster or
-- canonical tenant store. Existing identity/mapping/card/FX snapshots are preserved.
create or replace function public.account_save_registered_names(
 p_tenant text,p_actor text,p_roster_key text,p_roster_project text,
 p_platform_name text,p_billing_name text,p_currency text,p_effective_month date,
 p_store_id text,p_expected_version bigint,p_request_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare latest public.account_billing_unit_versions;applied public.account_billing_unit_versions;saved public.account_billing_unit_versions;payload jsonb;prior jsonb;answer jsonb;selected_store text;selected_market text;selected_input text;
begin
 perform public.account_assert_admin(p_tenant,p_actor);
 payload:=jsonb_build_object('mode','registered-names','actor',lower(p_actor),'unit',p_roster_key,'project',p_roster_project,'platformName',p_platform_name,'billingName',p_billing_name,'currency',p_currency,'month',p_effective_month,'storeId',p_store_id,'expectedVersion',p_expected_version::text);
 prior:=public.account_request_prior(p_tenant,p_request_id,payload);if prior is not null then return prior;end if;
 if p_roster_key is null or p_roster_key!~'^(roster-2026-10-(my|sg)-[0-9]+|store:shopee-[a-z0-9-]+)$'
 or length(trim(coalesce(p_roster_project,''))) not between 1 and 120
 or length(trim(coalesce(p_platform_name,''))) not between 1 and 240
 or (p_billing_name is not null and length(trim(p_billing_name)) not between 1 and 240)
 or p_currency is null or p_currency not in ('MYR','SGD','THB','PHP')
 or p_expected_version is null or p_expected_version<0 or p_effective_month is null or extract(day from p_effective_month)<>1 then raise exception 'ACCOUNT_INVALID';end if;
 if p_effective_month<date_trunc('month',now() at time zone 'Asia/Kuala_Lumpur')::date then raise exception 'ACCOUNT_PAST_MONTH';end if;
 perform pg_advisory_xact_lock(hashtext(p_tenant),hashtext('unit:'||p_roster_key));
 select * into latest from public.account_billing_unit_versions where tenant_id=p_tenant and roster_key=p_roster_key order by version desc limit 1;
 if coalesce(latest.version,0)<>p_expected_version then raise exception 'ACCOUNT_VERSION_CONFLICT';end if;
 if latest.id is not null and latest.currency<>p_currency then raise exception 'ACCOUNT_INVALID';end if;
 select * into applied from public.account_billing_unit_versions where tenant_id=p_tenant and roster_key=p_roster_key and effective_month<=p_effective_month order by effective_month desc,version desc limit 1;
 selected_store:=case when applied.id is null then p_store_id else applied.store_id end;
 if applied.id is not null and p_store_id is not null and p_store_id is distinct from applied.store_id then raise exception 'ACCOUNT_INVALID';end if;
 if selected_store is not null then
  select case s.platform when 'Shopee MY' then 'MY' when 'Shopee SG' then 'SG' when 'Shopee TH' then 'TH' when 'Shopee PH' then 'PH' when 'Shopee' then 'MY' end into selected_market
  from public.stores s where s.tenant_id=p_tenant and s.id=selected_store;
  if not found or selected_market is null then raise exception 'ACCOUNT_INVALID';end if;
 end if;
 if p_roster_key like 'store:%' and selected_store is distinct from substring(p_roster_key from 7) then raise exception 'ACCOUNT_INVALID';end if;
 selected_market:=coalesce(applied.market,selected_market,case when p_roster_key like 'roster-2026-10-my-%' then 'MY' when p_roster_key like 'roster-2026-10-sg-%' then 'SG' end);
 selected_input:=coalesce(applied.input_currency,case selected_market when 'MY' then 'MYR' when 'SG' then 'SGD' when 'TH' then 'THB' when 'PH' then 'PHP' end);
 insert into public.account_billing_unit_versions(tenant_id,roster_key,roster_project,legal_entity,billing_registered_name,currency,store_id,effective_month,version,change_action,fee_rule,actor_email,request_id,request_payload,market,input_currency,client_type,rate_card,fx_policy,fx_rate)
 values(p_tenant,p_roster_key,coalesce(latest.roster_project,trim(p_roster_project)),trim(p_platform_name),trim(p_billing_name),p_currency,selected_store,p_effective_month,coalesce(latest.version,0)+1,'company',applied.fee_rule,lower(p_actor),p_request_id,payload,selected_market,selected_input,applied.client_type,applied.rate_card,applied.fx_policy,applied.fx_rate) returning * into saved;
 insert into public.account_audit_log(tenant_id,actor_email,action,record_type,record_id,before_value,after_value)
 values(p_tenant,lower(p_actor),'company','billing_unit_version',saved.id,to_jsonb(applied),to_jsonb(saved));
 answer:=jsonb_build_object('version',saved.version::text,'legalEntity',saved.legal_entity,'billingEntity',saved.billing_registered_name);
 insert into public.account_store_requests(tenant_id,request_id,request_payload,result,created_at) values(p_tenant,p_request_id,payload,answer,now());
 return answer;
end $$;
revoke all on function public.account_save_registered_names(text,text,text,text,text,text,text,date,text,bigint,uuid) from public,anon,authenticated;
grant execute on function public.account_save_registered_names(text,text,text,text,text,text,text,date,text,bigint,uuid) to service_role;

notify pgrst, 'reload schema';
