-- Company changes and first-time store setup preserve month-effective history.
alter table public.account_billing_unit_versions drop constraint account_billing_unit_versions_change_action_check;
alter table public.account_billing_unit_versions add constraint account_billing_unit_versions_change_action_check check(change_action in ('mapping','fee_rule','company','setup'));
create or replace function public.account_save_billing_unit_version(
  p_tenant text,p_actor text,p_roster_key text,p_roster_project text,p_entity text,p_currency text,
  p_effective_month date,p_action text,p_store_id text,p_rule jsonb,p_expected_version bigint,p_request_id uuid
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare latest public.account_billing_unit_versions; applicable public.account_billing_unit_versions;
  retry public.account_billing_unit_versions; saved public.account_billing_unit_versions;
  payload jsonb; selected_store text; selected_rule jsonb; selected_entity text; next_version bigint;
begin
  if not exists(select 1 from public.customer_users u join public.tenants t on t.id=u.tenant_id
    where u.tenant_id=p_tenant and lower(u.email)=lower(p_actor) and u.active and u.role='superadmin' and t.active)
    then raise exception 'ACCOUNT_ACCESS_DENIED';end if;
  if p_action not in ('mapping','fee_rule','company','setup') or p_action is null or p_currency not in ('MYR','SGD') or p_currency is null
    or p_roster_key !~ '^(roster-2026-10-(my|sg)-[0-9]+|store:shopee-[a-z0-9-]+)$' or p_roster_key is null
    or length(trim(p_roster_project)) not between 1 and 120 or p_roster_project is null
    or length(trim(p_entity)) not between 1 and 240 or p_entity is null or p_request_id is null
    or p_expected_version is null or p_expected_version<0 or p_effective_month is null or extract(day from p_effective_month)<>1 then raise exception 'ACCOUNT_INVALID';end if;
  if p_effective_month<date_trunc('month',now() at time zone 'Asia/Kuala_Lumpur')::date then raise exception 'ACCOUNT_PAST_MONTH';end if;
  if p_roster_key like 'store:%' and not exists(select 1 from public.stores where tenant_id=p_tenant and id=substring(p_roster_key from 7) and platform=case p_currency when 'MYR' then 'Shopee MY' else 'Shopee SG' end) then raise exception 'ACCOUNT_INVALID';end if;
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
  select store_id into selected_store from public.account_billing_unit_versions where tenant_id=p_tenant and roster_key=p_roster_key and change_action in ('mapping','setup') and effective_month<=p_effective_month order by effective_month desc,version desc limit 1;
  select fee_rule into selected_rule from public.account_billing_unit_versions where tenant_id=p_tenant and roster_key=p_roster_key and change_action in ('fee_rule','setup') and effective_month<=p_effective_month order by effective_month desc,version desc limit 1;
  if p_action='company' then
    if p_rule is not null or p_store_id is not null then raise exception 'ACCOUNT_INVALID';end if;
  elsif p_action='setup' then
    if p_store_id is null or p_roster_key<>'store:'||p_store_id or not coalesce(public.account_fee_rule_valid(p_rule,p_currency),false) then raise exception 'ACCOUNT_INVALID';end if;
    selected_store:=p_store_id;selected_rule:=p_rule;
  elsif p_action='mapping' then
    if p_rule is not null or p_store_id is null or p_store_id='shopee-skindae-sg-by-ctg4u' or not exists(select 1 from public.stores where tenant_id=p_tenant and id=p_store_id) then raise exception 'ACCOUNT_INVALID';end if;
    selected_store:=p_store_id;
  else
    if p_store_id is not null or not coalesce(public.account_fee_rule_valid(p_rule,p_currency),false) then raise exception 'ACCOUNT_INVALID';end if;
    selected_rule:=p_rule;
  end if;
  if p_action not in ('company','setup') then
    select legal_entity into selected_entity from public.account_billing_unit_versions where tenant_id=p_tenant and roster_key=p_roster_key and change_action in ('company','setup') and effective_month<=p_effective_month order by effective_month desc,version desc limit 1;
    p_entity:=coalesce(selected_entity,p_entity);
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
