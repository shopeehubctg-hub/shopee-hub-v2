-- Immutable, month-effective user selections. No invoice/receipt/fee values are seeded.
create function public.account_fee_rule_valid(p_rule jsonb,p_currency text) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare tier jsonb; previous numeric:=-1; amount numeric; percent numeric; typ text; basis text; field text;
begin
  if jsonb_typeof(p_rule) is distinct from 'object' or p_rule->>'currency' is distinct from p_currency then return false; end if;
  typ:=p_rule->>'type';basis:=p_rule->>'basis';
  if typ not in ('fixed','percent','tiers') or typ is null or basis not in ('fixed_monthly','merchandise_subtotal','net_gmv','statement_amount','custom') or basis is null then return false;end if;
  if basis='custom' and (jsonb_typeof(p_rule->'basisLabel') is distinct from 'string' or coalesce(length(trim(p_rule->>'basisLabel')),0) not between 1 and 120) then return false;end if;
  foreach field in array array['minimum','cap'] loop
    if p_rule?field and (jsonb_typeof(p_rule->field) is distinct from 'string' or (p_rule->>field)!~'^[0-9]{1,16}(\.[0-9]{1,2})?$') then return false;end if;
  end loop;
  if p_rule?'minimum' and p_rule?'cap' and (p_rule->>'minimum')::numeric>(p_rule->>'cap')::numeric then return false;end if;
  if typ='fixed' then
    return coalesce(basis='fixed_monthly' and jsonb_typeof(p_rule->'fixedAmount')='string' and (p_rule->>'fixedAmount')~'^[0-9]{1,16}(\.[0-9]{1,2})?$',false);
  end if;
  if basis='fixed_monthly' then return false;end if;
  if typ='percent' then
    return coalesce(jsonb_typeof(p_rule->'percent')='string' and (p_rule->>'percent')~'^[0-9]{1,3}(\.[0-9]{1,6})?$' and (p_rule->>'percent')::numeric<=100,false);
  end if;
  if jsonb_typeof(p_rule->'tiers') is distinct from 'array' or jsonb_array_length(p_rule->'tiers') not between 1 and 20 then return false;end if;
  for tier in select value from jsonb_array_elements(p_rule->'tiers') loop
    if jsonb_typeof(tier) is distinct from 'object' or jsonb_typeof(tier->'from') is distinct from 'string' or (tier->>'from')!~'^[0-9]{1,16}(\.[0-9]{1,2})?$' or jsonb_typeof(tier->'percent') is distinct from 'string' or (tier->>'percent')!~'^[0-9]{1,3}(\.[0-9]{1,6})?$' then return false;end if;
    amount:=(tier->>'from')::numeric;percent:=(tier->>'percent')::numeric;
    if (previous=-1 and amount<>0) or amount<=previous or percent>100 then return false;end if;previous:=amount;
  end loop;
  return true;
exception when others then return false;
end $$;
revoke all on function public.account_fee_rule_valid(jsonb,text) from public,anon,authenticated;
grant execute on function public.account_fee_rule_valid(jsonb,text) to service_role;
create table public.account_billing_unit_versions (
  id uuid primary key default gen_random_uuid(), tenant_id text not null references public.tenants(id),
  roster_key text not null, roster_project text not null, legal_entity text not null,
  currency text not null check(currency in ('MYR','SGD')), store_id text,
  effective_month date not null check(extract(day from effective_month)=1),
  version bigint not null check(version>0), change_action text not null check(change_action in ('mapping','fee_rule')), fee_rule jsonb,
  actor_email text not null, request_id uuid not null, request_payload jsonb not null,
  created_at timestamptz not null default now(),
  foreign key(tenant_id,store_id) references public.stores(tenant_id,id),
  unique(tenant_id,roster_key,version), unique(tenant_id,request_id),
  check(fee_rule is null or coalesce(public.account_fee_rule_valid(fee_rule,currency),false))
);
create index account_unit_month_idx on public.account_billing_unit_versions(tenant_id,roster_key,effective_month desc,version desc);
alter table public.account_billing_unit_versions enable row level security;
revoke all on public.account_billing_unit_versions from public,anon,authenticated;
grant select,insert on public.account_billing_unit_versions to service_role;
grant insert on public.account_audit_log to service_role;
-- No UPDATE or DELETE permission: every adjustment adds a version. Audit is append only.
create function public.account_save_billing_unit_version(
  p_tenant text,p_actor text,p_roster_key text,p_roster_project text,p_entity text,p_currency text,
  p_effective_month date,p_action text,p_store_id text,p_rule jsonb,p_expected_version bigint,p_request_id uuid
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare latest public.account_billing_unit_versions; applicable public.account_billing_unit_versions;
  retry public.account_billing_unit_versions; saved public.account_billing_unit_versions;
  payload jsonb; selected_store text; selected_rule jsonb; next_version bigint;
begin
  if not exists(select 1 from public.customer_users u join public.tenants t on t.id=u.tenant_id
    where u.tenant_id=p_tenant and lower(u.email)=lower(p_actor) and u.active and u.role='superadmin' and t.active)
    then raise exception 'ACCOUNT_ACCESS_DENIED';end if;
  if p_action not in ('mapping','fee_rule') or p_action is null or p_currency not in ('MYR','SGD') or p_currency is null
    or p_roster_key !~ '^roster-2026-10-(my|sg)-[0-9]+$' or p_roster_key is null
    or length(trim(p_roster_project)) not between 1 and 120 or p_roster_project is null
    or length(trim(p_entity)) not between 1 and 240 or p_entity is null or p_request_id is null
    or p_expected_version is null or p_expected_version<0 or p_effective_month is null or extract(day from p_effective_month)<>1 then raise exception 'ACCOUNT_INVALID';end if;
  if p_effective_month<date_trunc('month',now() at time zone 'Asia/Kuala_Lumpur')::date then raise exception 'ACCOUNT_PAST_MONTH';end if;
  perform pg_advisory_xact_lock(hashtext(p_tenant),hashtext(p_roster_key));
  payload:=jsonb_build_object('actor',lower(p_actor),'unit',p_roster_key,'project',p_roster_project,'entity',p_entity,'currency',p_currency,'month',p_effective_month,'action',p_action,'store',p_store_id,'rule',p_rule,'expectedVersion',p_expected_version::text);
  select * into retry from public.account_billing_unit_versions where tenant_id=p_tenant and request_id=p_request_id;
  if found then
    if retry.request_payload is distinct from payload then raise exception 'ACCOUNT_REQUEST_CONFLICT';end if;
    return jsonb_build_object('version',retry.version::text);
  end if;
  select * into latest from public.account_billing_unit_versions where tenant_id=p_tenant and roster_key=p_roster_key order by version desc limit 1;
  if coalesce(latest.version,0)<>p_expected_version then raise exception 'ACCOUNT_VERSION_CONFLICT';end if;
  if latest.id is not null and latest.currency<>p_currency then raise exception 'ACCOUNT_INVALID';end if;
  select * into applicable from public.account_billing_unit_versions where tenant_id=p_tenant and roster_key=p_roster_key and effective_month<=p_effective_month order by effective_month desc,version desc limit 1;
  select store_id into selected_store from public.account_billing_unit_versions where tenant_id=p_tenant and roster_key=p_roster_key and change_action='mapping' and effective_month<=p_effective_month order by effective_month desc,version desc limit 1;
  select fee_rule into selected_rule from public.account_billing_unit_versions where tenant_id=p_tenant and roster_key=p_roster_key and change_action='fee_rule' and effective_month<=p_effective_month order by effective_month desc,version desc limit 1;
  if p_action='mapping' then
    if p_rule is not null or p_store_id is null or p_store_id='shopee-skindae-sg-by-ctg4u' or not exists(select 1 from public.stores where tenant_id=p_tenant and id=p_store_id) then raise exception 'ACCOUNT_INVALID';end if;
    selected_store:=p_store_id;
  else
    if p_store_id is not null or not coalesce(public.account_fee_rule_valid(p_rule,p_currency),false) then raise exception 'ACCOUNT_INVALID';end if;
    selected_rule:=p_rule;
  end if;
  next_version:=coalesce(latest.version,0)+1;
  insert into public.account_billing_unit_versions(tenant_id,roster_key,roster_project,legal_entity,currency,store_id,effective_month,version,change_action,fee_rule,actor_email,request_id,request_payload)
    values(p_tenant,p_roster_key,p_roster_project,p_entity,p_currency,selected_store,p_effective_month,next_version,p_action,selected_rule,lower(p_actor),p_request_id,payload) returning * into saved;
  insert into public.account_audit_log(tenant_id,actor_email,action,record_type,record_id,before_value,after_value)
    values(p_tenant,lower(p_actor),p_action,'billing_unit_version',saved.id,to_jsonb(applicable),to_jsonb(saved));
  return jsonb_build_object('version',saved.version::text);
end $$;
revoke all on function public.account_save_billing_unit_version(text,text,text,text,text,text,date,text,text,jsonb,bigint,uuid) from public,anon,authenticated;
grant execute on function public.account_save_billing_unit_version(text,text,text,text,text,text,date,text,text,jsonb,bigint,uuid) to service_role;
