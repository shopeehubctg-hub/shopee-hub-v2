-- Minimal Account setup activation. Reuses existing store/directory identities.
-- No income ledger, invoices, receipts, store assignments or business values are seeded.
create table if not exists public.account_audit_log (
 id uuid primary key default gen_random_uuid(),tenant_id text not null references public.tenants(id),
 actor_email text not null,action text not null,record_type text not null,record_id uuid not null,
 before_value jsonb,after_value jsonb,created_at timestamptz not null default now()
);
create table if not exists public.account_store_requests (
 tenant_id text not null references public.tenants(id),request_id uuid not null,
 request_payload jsonb not null,result jsonb not null,created_at timestamptz not null default now(),
 primary key(tenant_id,request_id)
);
create table if not exists public.account_rate_card_versions (
 id uuid primary key default gen_random_uuid(),tenant_id text not null references public.tenants(id),
 card_id text not null,version bigint not null check(version>0),name text not null,
 client_type text not null check(client_type in ('Internal','External')),
 currency text not null check(currency in ('MYR','SGD')),effective_month date not null check(extract(day from effective_month)=1),
 fee_rule jsonb not null,archived_at timestamptz,created_at timestamptz not null default now(),
 request_id uuid not null,request_payload jsonb not null,
 unique(tenant_id,card_id,version),unique(tenant_id,request_id)
);
create table if not exists public.account_billing_unit_versions (
 id uuid primary key default gen_random_uuid(),tenant_id text not null references public.tenants(id),
 roster_key text not null,roster_project text not null,legal_entity text not null,currency text not null,store_id text,
 effective_month date not null check(extract(day from effective_month)=1),version bigint not null check(version>0),
 change_action text not null,fee_rule jsonb,actor_email text not null,request_id uuid not null,request_payload jsonb not null,
 created_at timestamptz not null default now(),foreign key(tenant_id,store_id) references public.stores(tenant_id,id),
 unique(tenant_id,roster_key,version),unique(tenant_id,request_id)
);
alter table public.account_billing_unit_versions
 add column if not exists market text,
 add column if not exists input_currency text,
 add column if not exists client_type text,
 add column if not exists rate_card jsonb,
 add column if not exists fx_policy text,
 add column if not exists fx_rate numeric(18,8);
alter table public.account_billing_unit_versions
 add column if not exists rate_card_id text generated always as (rate_card->>'id') stored,
 add column if not exists rate_card_version bigint generated always as ((rate_card->>'version')::bigint) stored;

create or replace function public.account_fee_rule_valid(p_rule jsonb,p_currency text) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare tier jsonb; previous numeric:=-1; amount numeric; percent numeric; typ text; basis text; field text;
begin
 if jsonb_typeof(p_rule) is distinct from 'object' or p_rule->>'currency' is distinct from p_currency or p_currency is null or p_currency not in ('MYR','SGD') then return false;end if;
 typ:=p_rule->>'type';basis:=p_rule->>'basis';
 if typ is null or typ not in ('fixed','percent','tiers') or basis is null or basis not in ('fixed_monthly','merchandise_subtotal','net_gmv','statement_amount','custom') then return false;end if;
 if basis='custom' and (jsonb_typeof(p_rule->'basisLabel') is distinct from 'string' or coalesce(length(trim(p_rule->>'basisLabel')),0) not between 1 and 120) then return false;end if;
 foreach field in array array['minimum','cap'] loop
  if p_rule?field and (jsonb_typeof(p_rule->field) is distinct from 'string' or (p_rule->>field)!~'^[0-9]{1,16}(\.[0-9]{1,2})?$') then return false;end if;
 end loop;
 if p_rule?'minimum' and p_rule?'cap' and (p_rule->>'minimum')::numeric>(p_rule->>'cap')::numeric then return false;end if;
 if typ='fixed' then return coalesce(basis='fixed_monthly' and jsonb_typeof(p_rule->'fixedAmount')='string' and (p_rule->>'fixedAmount')~'^[0-9]{1,16}(\.[0-9]{1,2})?$',false);end if;
 if basis='fixed_monthly' then return false;end if;
 if typ='percent' then return coalesce(jsonb_typeof(p_rule->'percent')='string' and (p_rule->>'percent')~'^[0-9]{1,3}(\.[0-9]{1,6})?$' and (p_rule->>'percent')::numeric<=100,false);end if;
 if jsonb_typeof(p_rule->'tiers') is distinct from 'array' or jsonb_array_length(p_rule->'tiers') not between 1 and 20 then return false;end if;
 for tier in select value from jsonb_array_elements(p_rule->'tiers') loop
  if jsonb_typeof(tier) is distinct from 'object' or jsonb_typeof(tier->'from') is distinct from 'string' or (tier->>'from')!~'^[0-9]{1,16}(\.[0-9]{1,2})?$' or jsonb_typeof(tier->'percent') is distinct from 'string' or (tier->>'percent')!~'^[0-9]{1,3}(\.[0-9]{1,6})?$' then return false;end if;
  amount:=(tier->>'from')::numeric;percent:=(tier->>'percent')::numeric;
  if (previous=-1 and amount<>0) or amount<=previous or percent>100 then return false;end if;previous:=amount;
  if tier?'cap' and (jsonb_typeof(tier->'cap') is distinct from 'string' or (tier->>'cap')!~'^[0-9]{1,16}(\.[0-9]{1,2})?$') then return false;end if;
  if tier?'cap' and p_rule?'minimum' and (p_rule->>'minimum')::numeric>(tier->>'cap')::numeric then return false;end if;
 end loop;return true;
exception when others then return false;
end $$;
alter table public.account_billing_unit_versions drop constraint if exists account_billing_unit_versions_currency_check;
alter table public.account_billing_unit_versions add constraint account_billing_unit_versions_currency_check check(currency in ('MYR','SGD','THB','PHP'));
alter table public.account_billing_unit_versions drop constraint if exists account_billing_unit_versions_change_action_check;
alter table public.account_billing_unit_versions add constraint account_billing_unit_versions_change_action_check check(change_action in ('mapping','fee_rule','company','setup'));
alter table public.account_billing_unit_versions drop constraint if exists account_billing_unit_versions_check;
alter table public.account_billing_unit_versions add constraint account_billing_unit_versions_check check(fee_rule is null or coalesce(public.account_fee_rule_valid(fee_rule,fee_rule->>'currency'),false));
alter table public.account_billing_unit_versions drop constraint if exists account_unit_setup_metadata_check;
alter table public.account_billing_unit_versions add constraint account_unit_setup_metadata_check check(
 (market is null or market in ('MY','SG','TH','PH')) and (input_currency is null or input_currency in ('MYR','SGD','THB','PHP'))
 and (client_type is null or client_type in ('Internal','External')) and (fx_policy is null or fx_policy in ('none','fixed','bnm-service-average'))
 and (fx_rate is null or (fx_policy='fixed' and fx_rate>0))
 and (rate_card is null or (jsonb_typeof(rate_card)='object' and rate_card_id is not null and rate_card_version>0)));
alter table public.account_billing_unit_versions drop constraint if exists account_unit_rate_card_fk;
alter table public.account_billing_unit_versions add constraint account_unit_rate_card_fk foreign key(tenant_id,rate_card_id,rate_card_version) references public.account_rate_card_versions(tenant_id,card_id,version);
alter table public.account_rate_card_versions drop constraint if exists account_rate_card_rule_check;
alter table public.account_rate_card_versions add constraint account_rate_card_rule_check check(coalesce(public.account_fee_rule_valid(fee_rule,currency),false));
create index if not exists account_unit_month_idx on public.account_billing_unit_versions(tenant_id,roster_key,effective_month desc,version desc);
create index if not exists account_unit_store_idx on public.account_billing_unit_versions(tenant_id,store_id);
create index if not exists account_unit_card_idx on public.account_billing_unit_versions(tenant_id,rate_card_id,rate_card_version);
create index if not exists account_card_month_idx on public.account_rate_card_versions(tenant_id,card_id,effective_month desc,version desc);
create index if not exists account_audit_tenant_created_idx on public.account_audit_log(tenant_id,created_at desc);

-- RLS is defense in depth. Only authenticated server-side service-role calls have grants.
do $$declare t text;begin foreach t in array array['account_billing_unit_versions','account_rate_card_versions','account_store_requests','account_audit_log'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('revoke update,delete,truncate on public.%I from service_role',t);
 execute format('grant select,insert on public.%I to service_role',t);
end loop;end $$;

create or replace function public.account_assert_admin(p_tenant text,p_actor text) returns void
language plpgsql stable security invoker set search_path='' as $$begin
 if p_tenant is null or p_actor is null or not exists(select 1 from public.customer_users u join public.tenants t on t.id=u.tenant_id where u.tenant_id=p_tenant and lower(u.email)=lower(p_actor) and u.active and u.role='superadmin' and t.active) then raise exception 'ACCOUNT_ACCESS_DENIED';end if;
end $$;
create or replace function public.account_request_prior(p_tenant text,p_request_id uuid,p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$declare prior public.account_store_requests;begin
 if p_request_id is null then raise exception 'ACCOUNT_INVALID';end if;
 perform pg_advisory_xact_lock(hashtext(p_tenant),hashtext('request:'||p_request_id::text));
 select * into prior from public.account_store_requests where tenant_id=p_tenant and request_id=p_request_id;
 if found then if prior.request_payload is distinct from p_payload then raise exception 'ACCOUNT_REQUEST_CONFLICT';end if;return prior.result;end if;
 return null;
end $$;

create or replace function public.account_save_rate_card(p_tenant text,p_actor text,p_card jsonb,p_expected_version bigint,p_request_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare prior jsonb;payload jsonb;latest public.account_rate_card_versions;saved public.account_rate_card_versions;month date;result jsonb;
begin
 perform public.account_assert_admin(p_tenant,p_actor);
 payload:=jsonb_build_object('mode','card-save','actor',lower(p_actor),'card',p_card,'expectedVersion',p_expected_version::text);
 prior:=public.account_request_prior(p_tenant,p_request_id,payload);if prior is not null then return prior;end if;
 if jsonb_typeof(p_card) is distinct from 'object' or coalesce(p_card->>'id','')!~'^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$' or length(trim(coalesce(p_card->>'name',''))) not between 1 and 120 or coalesce(p_card->>'clientType','') not in ('Internal','External') or coalesce(p_card->>'currency','') not in ('MYR','SGD') or coalesce(p_card->>'effectiveMonth','')!~'^20[0-9]{2}-(0[1-9]|1[0-2])$' or p_expected_version is null or p_expected_version<0 or not public.account_fee_rule_valid(p_card->'rule',p_card->>'currency') then raise exception 'ACCOUNT_INVALID';end if;
 month:=((p_card->>'effectiveMonth')||'-01')::date;
 if month<date_trunc('month',now() at time zone 'Asia/Kuala_Lumpur')::date then raise exception 'ACCOUNT_PAST_MONTH';end if;
 perform pg_advisory_xact_lock(hashtext(p_tenant),hashtext('card:'||(p_card->>'id')));
 select * into latest from public.account_rate_card_versions where tenant_id=p_tenant and card_id=p_card->>'id' order by version desc limit 1;
 if coalesce(latest.version,0)<>p_expected_version then raise exception 'ACCOUNT_VERSION_CONFLICT';end if;
 if exists(select 1 from public.account_rate_card_versions where tenant_id=p_tenant and card_id=p_card->>'id' and archived_at is not null) then raise exception 'ACCOUNT_CARD_ARCHIVED';end if;
 if latest.id is not null and (latest.currency<>p_card->>'currency' or latest.client_type<>p_card->>'clientType') then raise exception 'ACCOUNT_INVALID';end if;
 insert into public.account_rate_card_versions(tenant_id,card_id,version,name,client_type,currency,effective_month,fee_rule,request_id,request_payload)
 values(p_tenant,p_card->>'id',coalesce(latest.version,0)+1,trim(p_card->>'name'),p_card->>'clientType',p_card->>'currency',month,p_card->'rule',p_request_id,payload) returning * into saved;
 insert into public.account_audit_log(tenant_id,actor_email,action,record_type,record_id,before_value,after_value) values(p_tenant,lower(p_actor),'save_rate_card','rate_card_version',saved.id,to_jsonb(latest),to_jsonb(saved));
 result:=jsonb_build_object('id',saved.card_id,'version',saved.version::text);
 insert into public.account_store_requests(tenant_id,request_id,request_payload,result,created_at) values(p_tenant,p_request_id,payload,result,now());return result;
end $$;

create or replace function public.account_archive_rate_card(p_tenant text,p_actor text,p_card_id text,p_expected_version bigint,p_request_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare prior jsonb;payload jsonb;latest public.account_rate_card_versions;saved public.account_rate_card_versions;result jsonb;
begin
 perform public.account_assert_admin(p_tenant,p_actor);
 payload:=jsonb_build_object('mode','card-archive','actor',lower(p_actor),'cardId',p_card_id,'expectedVersion',p_expected_version::text);
 prior:=public.account_request_prior(p_tenant,p_request_id,payload);if prior is not null then return prior;end if;
 perform pg_advisory_xact_lock(hashtext(p_tenant),hashtext('card:'||coalesce(p_card_id,'')));
 select * into latest from public.account_rate_card_versions where tenant_id=p_tenant and card_id=p_card_id order by version desc limit 1;
 if not found then raise exception 'ACCOUNT_CARD_NOT_FOUND';end if;
 if latest.version is distinct from p_expected_version then raise exception 'ACCOUNT_VERSION_CONFLICT';end if;
 if latest.archived_at is not null then result:=jsonb_build_object('id',latest.card_id,'version',latest.version::text);
 else
  insert into public.account_rate_card_versions(tenant_id,card_id,version,name,client_type,currency,effective_month,fee_rule,archived_at,request_id,request_payload)
  values(p_tenant,latest.card_id,latest.version+1,latest.name,latest.client_type,latest.currency,latest.effective_month,latest.fee_rule,now(),p_request_id,payload) returning * into saved;
  insert into public.account_audit_log(tenant_id,actor_email,action,record_type,record_id,before_value,after_value) values(p_tenant,lower(p_actor),'archive_rate_card','rate_card_version',saved.id,to_jsonb(latest),to_jsonb(saved));
  result:=jsonb_build_object('id',saved.card_id,'version',saved.version::text);
 end if;
 insert into public.account_store_requests(tenant_id,request_id,request_payload,result,created_at) values(p_tenant,p_request_id,payload,result,now());return result;
end $$;

-- Normalize a complete Store setup using the authoritative exact card version.
create or replace function public.account_normalize_store_setup(p_tenant text,p_market text,p_setup jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare src text;month date;card public.account_rate_card_versions;rule jsonb;card_ref jsonb:=null;policy text;rate text;
begin
 src:=case p_market when 'MY' then 'MYR' when 'SG' then 'SGD' when 'TH' then 'THB' when 'PH' then 'PHP' end;
 if src is null or jsonb_typeof(p_setup) is distinct from 'object' or p_setup->>'version' is distinct from '2' or length(trim(coalesce(p_setup->>'legalEntity',''))) not between 1 and 240 or coalesce(p_setup->>'effectiveMonth','')!~'^20[0-9]{2}-(0[1-9]|1[0-2])$' or coalesce(p_setup->>'clientType','') not in ('Internal','External') or p_setup->>'inputCurrency' is distinct from src or p_setup->>'billingCurrency' is distinct from 'MYR' then raise exception 'STORE_SETUP_INVALID';end if;
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
 return jsonb_build_object('version',2,'legalEntity',trim(p_setup->>'legalEntity'),'effectiveMonth',p_setup->>'effectiveMonth','clientType',p_setup->>'clientType','rateCard',card_ref,'feeRule',rule,'inputCurrency',src,'billingCurrency','MYR','fxPolicy',policy)||case when rate is null then '{}'::jsonb else jsonb_build_object('fxRate',rate) end;
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
 month:=((p_setup->>'effectiveMonth')||'-01')::date;
 insert into public.account_billing_unit_versions(tenant_id,roster_key,roster_project,legal_entity,currency,store_id,effective_month,version,change_action,fee_rule,actor_email,request_id,request_payload,market,input_currency,client_type,rate_card,fx_policy,fx_rate)
 values(p_tenant,p_roster_key,trim(p_project),trim(p_setup->>'legalEntity'),p_currency,p_store_id,month,coalesce(latest.version,0)+1,p_action,p_setup->'feeRule',lower(p_actor),p_request_id,p_setup,p_market,p_setup->>'inputCurrency',p_setup->>'clientType',nullif(p_setup->'rateCard','null'::jsonb),p_setup->>'fxPolicy',(p_setup->>'fxRate')::numeric) returning * into saved;
 insert into public.account_audit_log(tenant_id,actor_email,action,record_type,record_id,before_value,after_value) values(p_tenant,lower(p_actor),p_action,'billing_unit_version',saved.id,to_jsonb(latest),to_jsonb(saved));
 return saved.version;
end $$;

create or replace function public.account_write_store_directory(
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
  if exists(select 1 from public.link_directory_projects existing where existing.store_id=p_store_id and not exists(select 1 from jsonb_array_elements(p_details->'projectLinks') submitted where trim(submitted->>'project')=existing.project_name)) then raise exception 'STORE_LINK_REMOVAL_REQUIRES_APPROVAL';end if;
  insert into public.link_directory_stores(store_id,tenant_id,store_name,ads_top_up_owner,store_group_link,google_drive_link,source_sheet_id,source_tab)
    values(p_store_id,p_tenant,p_store_name,owner,group_link,store_drive,null,'Dashboard')
    on conflict(store_id) do update set ads_top_up_owner=excluded.ads_top_up_owner,
      store_group_link=excluded.store_group_link,google_drive_link=excluded.google_drive_link
    where public.link_directory_stores.tenant_id=p_tenant;
  if not found then raise exception 'STORE_ACCESS_DENIED'; end if;
  for item in select value from jsonb_array_elements(p_details->'projectLinks') loop
    insert into public.link_directory_projects(store_id,project_name,project_group_link,google_drive_link)
      values(p_store_id,trim(item->>'project'),trim(item->>'href'),nullif(trim(coalesce(item->>'driveLink','')),''))
      on conflict(store_id,project_name) do update set project_group_link=excluded.project_group_link,google_drive_link=excluded.google_drive_link;
  end loop;
end $$;
revoke all on function public.account_write_store_directory(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.account_write_store_directory(text,text,text,jsonb) to service_role;

create or replace function public.account_create_store_with_setup_v2(p_tenant text,p_actor text,p_store_id text,p_name text,p_source_name text,p_market text,p_setup jsonb,p_details jsonb,p_request_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare payload jsonb;prior jsonb;setup jsonb;version bigint;result jsonb;
begin
 perform public.account_assert_admin(p_tenant,p_actor);
 payload:=jsonb_build_object('mode','store-create-v2','actor',lower(p_actor),'id',p_store_id,'name',p_name,'source',p_source_name,'market',p_market,'setup',p_setup,'details',p_details);
 prior:=public.account_request_prior(p_tenant,p_request_id,payload);if prior is not null then return prior;end if;
 if p_store_id is null or p_store_id!~'^shopee-[a-z0-9]+(-[a-z0-9]+)*$' or length(trim(coalesce(p_name,''))) not between 1 and 120 or length(trim(coalesce(p_source_name,''))) not between 1 and 120 then raise exception 'STORE_SETUP_INVALID';end if;
 setup:=public.account_normalize_store_setup(p_tenant,p_market,p_setup);
 perform pg_advisory_xact_lock(hashtext(p_tenant),hashtext('store-registry'));
 if exists(select 1 from public.stores where tenant_id=p_tenant and (lower(regexp_replace(trim(coalesce(display_name,name)),'[[:space:]]+',' ','g')) in (lower(regexp_replace(trim(p_name),'[[:space:]]+',' ','g')),lower(regexp_replace(trim(p_source_name),'[[:space:]]+',' ','g'))) or lower(regexp_replace(trim(bigseller_name),'[[:space:]]+',' ','g')) in (lower(regexp_replace(trim(p_name),'[[:space:]]+',' ','g')),lower(regexp_replace(trim(p_source_name),'[[:space:]]+',' ','g'))))) then raise exception 'STORE_DUPLICATE';end if;
 if exists(select 1 from public.stores where id=p_store_id) then raise exception 'STORE_DUPLICATE';end if;
 insert into public.stores(id,tenant_id,name,platform,bigseller_name) values(p_store_id,p_tenant,trim(p_name),'Shopee '||p_market,trim(p_source_name));
 perform public.account_write_store_directory(p_tenant,p_store_id,trim(p_name),p_details);
 version:=public.account_append_unit_setup(p_tenant,p_actor,'store:'||p_store_id,trim(p_name),'MYR',p_store_id,p_market,setup,'setup',0,p_request_id);
 result:=jsonb_build_object('id',p_store_id,'version',version::text);
 insert into public.account_store_requests(tenant_id,request_id,request_payload,result,created_at) values(p_tenant,p_request_id,payload,result,now());return result;
end $$;

create or replace function public.account_update_store_with_setup_v2(p_tenant text,p_actor text,p_store_id text,p_name text,p_source_name text,p_market text,p_setup jsonb,p_details jsonb,p_request_id uuid,p_roster_key text,p_expected_version bigint) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare payload jsonb;prior jsonb;setup jsonb;version bigint:=null;result jsonb;target public.stores;latest public.account_billing_unit_versions;applicable public.account_billing_unit_versions;company_only boolean;month date;
begin
 perform public.account_assert_admin(p_tenant,p_actor);
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

create or replace function public.account_assign_rate_card(p_tenant text,p_actor text,p_units jsonb,p_card_id text,p_card_version bigint,p_effective_month date,p_request_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare payload jsonb;prior jsonb;unit jsonb;setup jsonb;card public.account_rate_card_versions;version bigint;versions jsonb:='{}'::jsonb;result jsonb;seen text[]:=array[]::text[];unit_request uuid;existing public.account_billing_unit_versions;
begin
 perform public.account_assert_admin(p_tenant,p_actor);
 payload:=jsonb_build_object('mode','assign-card','actor',lower(p_actor),'units',p_units,'cardId',p_card_id,'cardVersion',p_card_version::text,'month',p_effective_month);
 prior:=public.account_request_prior(p_tenant,p_request_id,payload);if prior is not null then return prior;end if;
 if jsonb_typeof(p_units) is distinct from 'array' or jsonb_array_length(p_units) not between 1 and 200 or p_effective_month is null or extract(day from p_effective_month)<>1 then raise exception 'ACCOUNT_INVALID';end if;
 if p_effective_month<date_trunc('month',now() at time zone 'Asia/Kuala_Lumpur')::date then raise exception 'ACCOUNT_PAST_MONTH';end if;
 perform pg_advisory_xact_lock(hashtext(p_tenant),hashtext('card:'||coalesce(p_card_id,'')));
 if exists(select 1 from public.account_rate_card_versions where tenant_id=p_tenant and card_id=p_card_id and archived_at is not null) then raise exception 'ACCOUNT_CARD_ARCHIVED';end if;
 select * into card from public.account_rate_card_versions where tenant_id=p_tenant and card_id=p_card_id and effective_month<=p_effective_month order by effective_month desc,version desc limit 1;
 if not found then raise exception 'ACCOUNT_CARD_NOT_FOUND';end if;
 if card.version is distinct from p_card_version then raise exception 'ACCOUNT_VERSION_CONFLICT';end if;
 for unit in select value from jsonb_array_elements(p_units) order by value->>'rosterKey' loop
  if jsonb_typeof(unit) is distinct from 'object' or coalesce(unit->>'rosterKey','')=any(seen) or coalesce(unit->>'expectedVersion','')!~'^[0-9]{1,18}$' then raise exception 'ACCOUNT_INVALID';end if;
  seen:=array_append(seen,unit->>'rosterKey');
  if card.currency<>'MYR' then raise exception 'ACCOUNT_INVALID';end if;
  -- Keep the source currency/policy explicit; fixed MYR fee still stores the policy for later percent cards.
  setup:=jsonb_build_object('version',2,'legalEntity',unit->>'legalEntity','effectiveMonth',to_char(p_effective_month,'YYYY-MM'),'clientType',card.client_type,'rateCard',jsonb_build_object('id',card.card_id,'version',card.version,'name',card.name),'feeRule',card.fee_rule,'inputCurrency',unit->>'inputCurrency','billingCurrency','MYR','fxPolicy',unit->>'fxPolicy')||case when unit->>'fxRate' is null then '{}'::jsonb else jsonb_build_object('fxRate',unit->>'fxRate') end;
  setup:=public.account_normalize_store_setup(p_tenant,unit->>'market',setup);
  if unit->>'storeId' is not null and not exists(select 1 from public.stores where tenant_id=p_tenant and id=unit->>'storeId') then raise exception 'ACCOUNT_INVALID';end if;
  perform pg_advisory_xact_lock(hashtext(p_tenant),hashtext('unit:'||(unit->>'rosterKey')));
  select * into existing from public.account_billing_unit_versions where tenant_id=p_tenant and roster_key=unit->>'rosterKey' and effective_month<=p_effective_month order by effective_month desc,version desc limit 1;
  if existing.client_type is not null and existing.client_type<>card.client_type then raise exception 'ACCOUNT_INVALID';end if;
  unit_request:=md5(p_request_id::text||':'||(unit->>'rosterKey'))::uuid;
  version:=public.account_append_unit_setup(p_tenant,p_actor,unit->>'rosterKey',unit->>'project',unit->>'currency',unit->>'storeId',unit->>'market',setup,'fee_rule',(unit->>'expectedVersion')::bigint,unit_request);
  versions:=versions||jsonb_build_object(unit->>'rosterKey',version::text);
 end loop;
 result:=jsonb_build_object('versions',versions);
 insert into public.account_store_requests(tenant_id,request_id,request_payload,result,created_at) values(p_tenant,p_request_id,payload,result,now());return result;
end $$;

-- Existing company/mapping editors retain their RPC shape. All changes append versions.
create or replace function public.account_save_billing_unit_version(p_tenant text,p_actor text,p_roster_key text,p_roster_project text,p_entity text,p_currency text,p_effective_month date,p_action text,p_store_id text,p_rule jsonb,p_expected_version bigint,p_request_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare latest public.account_billing_unit_versions;applicable public.account_billing_unit_versions;saved public.account_billing_unit_versions;payload jsonb;prior jsonb;selected_store text;selected_rule jsonb;selected_entity text;result jsonb;
begin
 perform public.account_assert_admin(p_tenant,p_actor);
 payload:=jsonb_build_object('mode','unit-save','actor',lower(p_actor),'unit',p_roster_key,'project',p_roster_project,'entity',p_entity,'currency',p_currency,'month',p_effective_month,'action',p_action,'store',p_store_id,'rule',p_rule,'expectedVersion',p_expected_version::text);
 prior:=public.account_request_prior(p_tenant,p_request_id,payload);if prior is not null then return prior;end if;
 if p_action is null or p_action not in ('mapping','fee_rule','company') or p_currency is null or p_currency not in ('MYR','SGD','THB','PHP') or p_roster_key is null or p_roster_key!~'^(roster-2026-10-(my|sg)-[0-9]+|store:shopee-[a-z0-9-]+)$' or length(trim(coalesce(p_roster_project,''))) not between 1 and 120 or length(trim(coalesce(p_entity,''))) not between 1 and 240 or p_expected_version is null or p_expected_version<0 or p_effective_month is null or extract(day from p_effective_month)<>1 then raise exception 'ACCOUNT_INVALID';end if;
 if p_effective_month<date_trunc('month',now() at time zone 'Asia/Kuala_Lumpur')::date then raise exception 'ACCOUNT_PAST_MONTH';end if;
 perform pg_advisory_xact_lock(hashtext(p_tenant),hashtext('unit:'||p_roster_key));
 select * into latest from public.account_billing_unit_versions where tenant_id=p_tenant and roster_key=p_roster_key order by version desc limit 1;
 if coalesce(latest.version,0)<>p_expected_version then raise exception 'ACCOUNT_VERSION_CONFLICT';end if;
 if latest.id is not null and latest.currency<>p_currency then raise exception 'ACCOUNT_INVALID';end if;
 select * into applicable from public.account_billing_unit_versions where tenant_id=p_tenant and roster_key=p_roster_key and effective_month<=p_effective_month order by effective_month desc,version desc limit 1;
 selected_store:=applicable.store_id;selected_rule:=applicable.fee_rule;selected_entity:=coalesce(applicable.legal_entity,p_entity);
 if p_action='mapping' then
  if p_rule is not null or p_store_id is null or p_store_id='shopee-skindae-sg-by-ctg4u' or not exists(select 1 from public.stores where tenant_id=p_tenant and id=p_store_id) then raise exception 'ACCOUNT_INVALID';end if;
  if applicable.market is not null and exists(select 1 from public.stores where tenant_id=p_tenant and id=p_store_id and platform in ('Shopee MY','Shopee SG','Shopee TH','Shopee PH') and platform<>'Shopee '||applicable.market) then raise exception 'ACCOUNT_INVALID';end if;
  selected_store:=p_store_id;
 elsif p_action='company' then
  if p_rule is not null or p_store_id is not null then raise exception 'ACCOUNT_INVALID';end if;selected_entity:=p_entity;
 else
  if p_store_id is not null or not coalesce(public.account_fee_rule_valid(p_rule,p_rule->>'currency'),false) then raise exception 'ACCOUNT_INVALID';end if;selected_rule:=p_rule;
 end if;
 if p_roster_key like 'store:%' and (selected_store is distinct from substring(p_roster_key from 7) or not exists(select 1 from public.stores where tenant_id=p_tenant and id=selected_store)) then raise exception 'ACCOUNT_INVALID';end if;
 insert into public.account_billing_unit_versions(tenant_id,roster_key,roster_project,legal_entity,currency,store_id,effective_month,version,change_action,fee_rule,actor_email,request_id,request_payload,market,input_currency,client_type,rate_card,fx_policy,fx_rate)
 values(p_tenant,p_roster_key,trim(p_roster_project),trim(selected_entity),p_currency,selected_store,p_effective_month,coalesce(latest.version,0)+1,p_action,selected_rule,lower(p_actor),p_request_id,payload,applicable.market,applicable.input_currency,applicable.client_type,case when p_action='fee_rule' then null else applicable.rate_card end,applicable.fx_policy,applicable.fx_rate) returning * into saved;
 insert into public.account_audit_log(tenant_id,actor_email,action,record_type,record_id,before_value,after_value) values(p_tenant,lower(p_actor),p_action,'billing_unit_version',saved.id,to_jsonb(applicable),to_jsonb(saved));
 result:=jsonb_build_object('version',saved.version::text);
 insert into public.account_store_requests(tenant_id,request_id,request_payload,result,created_at) values(p_tenant,p_request_id,payload,result,now());return result;
end $$;

create or replace function public.account_store_setup_v2_available() returns boolean language sql stable security invoker set search_path='' as $$select true$$;

-- RPCs are server-only. The server derives actor+tenant from the active session;
-- every mutating entry point also checks active Super Admin membership in SQL.
revoke all on function public.account_fee_rule_valid(jsonb,text) from public,anon,authenticated;
revoke all on function public.account_assert_admin(text,text) from public,anon,authenticated;
revoke all on function public.account_request_prior(text,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.account_save_rate_card(text,text,jsonb,bigint,uuid) from public,anon,authenticated;
revoke all on function public.account_archive_rate_card(text,text,text,bigint,uuid) from public,anon,authenticated;
revoke all on function public.account_normalize_store_setup(text,text,jsonb) from public,anon,authenticated;
revoke all on function public.account_append_unit_setup(text,text,text,text,text,text,text,jsonb,text,bigint,uuid) from public,anon,authenticated;
revoke all on function public.account_create_store_with_setup_v2(text,text,text,text,text,text,jsonb,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.account_update_store_with_setup_v2(text,text,text,text,text,text,jsonb,jsonb,uuid,text,bigint) from public,anon,authenticated;
revoke all on function public.account_assign_rate_card(text,text,jsonb,text,bigint,date,uuid) from public,anon,authenticated;
revoke all on function public.account_save_billing_unit_version(text,text,text,text,text,text,date,text,text,jsonb,bigint,uuid) from public,anon,authenticated;
revoke all on function public.account_store_setup_v2_available() from public,anon,authenticated;
grant execute on function public.account_fee_rule_valid(jsonb,text),public.account_assert_admin(text,text),public.account_request_prior(text,uuid,jsonb),public.account_save_rate_card(text,text,jsonb,bigint,uuid),public.account_archive_rate_card(text,text,text,bigint,uuid),public.account_normalize_store_setup(text,text,jsonb),public.account_append_unit_setup(text,text,text,text,text,text,text,jsonb,text,bigint,uuid),public.account_create_store_with_setup_v2(text,text,text,text,text,text,jsonb,jsonb,uuid),public.account_update_store_with_setup_v2(text,text,text,text,text,text,jsonb,jsonb,uuid,text,bigint),public.account_assign_rate_card(text,text,jsonb,text,bigint,date,uuid),public.account_save_billing_unit_version(text,text,text,text,text,text,date,text,text,jsonb,bigint,uuid),public.account_store_setup_v2_available() to service_role;
grant select on public.tenants,public.customer_users,public.stores to service_role;
grant insert,update on public.stores to service_role;
grant select,insert,update on public.link_directory_stores to service_role;
grant select,insert,update on public.link_directory_projects to service_role;
do $$declare seq text;begin
 seq:=pg_get_serial_sequence('public.link_directory_projects','id');if seq is not null then execute format('grant usage,select on sequence %s to service_role',seq);end if;
end $$;

-- Only the seven valid, user-confirmed templates for the existing tenant.
-- Empty Fixed/Tier placeholders are deliberately excluded. No store receives an assignment.
with templates(card_id,name,client_type,fee_rule) as (values
 ('external-5','External 5%','External','{"type":"percent","currency":"MYR","basis":"custom","basisLabel":"Billing amount (preview)","percent":"5"}'::jsonb),
 ('external-9.7','External 9.7%','External','{"type":"percent","currency":"MYR","basis":"custom","basisLabel":"Billing amount (preview)","percent":"9.7"}'::jsonb),
 ('external-10','External 10%','External','{"type":"percent","currency":"MYR","basis":"custom","basisLabel":"Billing amount (preview)","percent":"10"}'::jsonb),
 ('external-11','External 11%','External','{"type":"percent","currency":"MYR","basis":"custom","basisLabel":"Billing amount (preview)","percent":"11"}'::jsonb),
 ('berlanco-tier','Berlanco Tier','External','{"type":"tiers","currency":"MYR","basis":"custom","basisLabel":"Billing amount (preview)","tiers":[{"from":"0.00","percent":"9"},{"from":"150000.00","percent":"8"},{"from":"300000.00","percent":"7"}]}'::jsonb),
 ('internal-new','Internal NEW','Internal','{"type":"tiers","currency":"MYR","basis":"custom","basisLabel":"Shopee Sales","tiers":[{"from":"0.00","percent":"4"},{"from":"10000.00","percent":"3.5"},{"from":"100000.00","percent":"3"},{"from":"150000.00","percent":"2.5"},{"from":"200000.00","percent":"2","cap":"4000.00"}]}'::jsonb),
 ('internal-3','Internal 3%','Internal','{"type":"percent","currency":"MYR","basis":"custom","basisLabel":"Billing amount (preview)","percent":"3"}'::jsonb)
)
insert into public.account_rate_card_versions(tenant_id,card_id,version,name,client_type,currency,effective_month,fee_rule,request_id,request_payload)
select t.id,c.card_id,1,c.name,c.client_type,'MYR','2026-10-01',c.fee_rule,md5('initial-rate-card:'||t.id||':'||c.card_id)::uuid,jsonb_build_object('mode','initial-user-confirmed-template')
from public.tenants t cross join templates c where t.id='j-packaging' and not exists(select 1 from public.account_rate_card_versions old where old.tenant_id=t.id and old.card_id=c.card_id)
on conflict(tenant_id,card_id,version) do nothing;

notify pgrst,'reload schema';

