create or replace function public.permission_effective_modules(p_tenant text,p_user_id bigint) returns text[]
language sql security invoker set search_path='' as $$
 with member as(select * from public.customer_users where id=p_user_id and tenant_id=p_tenant),
 modules(id) as(select unnest(array['overview','design','calculator','packages','advertising','orders','health','protection','live_calendar','actions','overview_leaderboard','overview_leaderboard_all_stores','overview_store_sales'])),
 base as(
  select m.id from member u cross join modules m where m.id not like 'overview_%' and(
   u.role='superadmin'
   or exists(select 1 from public.user_module_permissions p where p.user_id=u.id and p.module_id=m.id and p.enabled and p.additive_grant)
   or (m.id<>'health' and u.module_access_mode='custom' and exists(select 1 from public.user_module_permissions p where p.user_id=u.id and p.module_id=m.id and p.enabled and not p.additive_grant))
   or (m.id<>'health' and u.module_access_mode='role_default' and case when m.id='live_calendar' then exists(select 1 from public.tenant_module_permissions t where t.tenant_id=p_tenant and t.module_id=m.id and t.enabled) else not exists(select 1 from public.tenant_module_permissions t where t.tenant_id=p_tenant and t.module_id=m.id and not t.enabled) end)
  )
 ), sections as(
  select m.id from member u cross join modules m where m.id like 'overview_%' and(
   u.role='superadmin' or(
    exists(select 1 from base where id='overview')
    and not exists(select 1 from public.tenant_module_permissions t
      where t.tenant_id=p_tenant and t.module_id='overview' and not t.enabled)
    and case when m.id='overview_leaderboard_all_stores' then
      u.module_access_mode='custom' and exists(select 1 from public.user_module_permissions p where p.user_id=u.id and p.module_id=m.id and p.enabled and not p.additive_grant)
      and exists(select 1 from public.user_module_permissions p where p.user_id=u.id and p.module_id='overview_leaderboard' and p.enabled and (p.additive_grant or u.module_access_mode='custom'))
    else exists(select 1 from public.user_module_permissions p where p.user_id=u.id and p.module_id=m.id and p.enabled and (p.additive_grant or u.module_access_mode='custom')) end
   )
  )
 ) select coalesce(array_agg(id order by id),array[]::text[]) from(select id from base union all select id from sections)x
$$;

create or replace function public.change_selected_feature_access(
  p_tenant text, p_actor text, p_module text, p_action text, p_users jsonb, p_request_id uuid
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  actor public.customer_users;
  target public.customer_users;
  prior public.user_access_audit_log;
  item jsonb;
  payload jsonb;
  result jsonb;
  previous_rows jsonb;
  before_modules text[];
  after_modules text[];
  removed_modules text[];
  added_modules text[];
  expected_modules text[];
  module text;
  changed int := 0;
  unchanged int := 0;
  skipped int := 0;
  converted int := 0;
  after_mode text;
  managed_modules constant text[] := array['overview','design','calculator','packages','advertising',
    'orders','health','protection','live_calendar','actions','overview_leaderboard',
    'overview_leaderboard_all_stores','overview_store_sales'];
begin
  if p_tenant is null or p_actor is null or p_request_id is null
    or p_action is null or p_action not in ('grant', 'revoke')
    or p_module is null or p_module not in ('overview','design','calculator','packages','advertising','orders','health','protection','live_calendar','actions','overview_leaderboard','overview_leaderboard_all_stores','overview_store_sales')
    or jsonb_typeof(p_users) is distinct from 'array'
  then raise exception 'PERMISSION_INVALID'; end if;
  if jsonb_array_length(p_users) not between 1 and 1000
    or exists (select 1 from jsonb_array_elements(p_users) x where
      coalesce(x->>'id','') !~ '^[1-9][0-9]{0,15}$' or coalesce(x->>'version','') !~ '^[0-9]{1,16}$')
    or jsonb_array_length(p_users) <> (select count(distinct x->>'id') from jsonb_array_elements(p_users) x)
  then raise exception 'PERMISSION_INVALID'; end if;

  perform pg_advisory_xact_lock(hashtext(p_tenant), hashtext('user-access-write'));
  if not exists (select 1 from public.tenants where id=p_tenant and active)
  then raise exception 'PERMISSION_ACCESS_DENIED'; end if;
  select * into actor from public.customer_users where tenant_id=p_tenant and email=lower(p_actor) for share;
  if not found or not actor.active or actor.role <> 'superadmin'
  then raise exception 'PERMISSION_ACCESS_DENIED'; end if;

  payload := jsonb_build_object('operation','change_selected_feature_access','module',p_module,
    'action',p_action,'actor',actor.id,'users',p_users);
  select * into prior from public.user_access_audit_log where tenant_id=p_tenant and request_id=p_request_id;
  if found then
    if prior.request_payload is distinct from payload then raise exception 'PERMISSION_REQUEST_CONFLICT'; end if;
    return prior.result;
  end if;

  removed_modules := case when p_module='overview'
    then array['overview','overview_leaderboard','overview_leaderboard_all_stores','overview_store_sales']
    when p_module='overview_leaderboard' then array[p_module,'overview_leaderboard_all_stores']
    else array[p_module] end;
  for item in select x from jsonb_array_elements(p_users) x order by (x->>'id')::bigint loop
    select * into target from public.customer_users where tenant_id=p_tenant and id=(item->>'id')::bigint for update;
    if not found or not target.active or target.role='superadmin' then raise exception 'PERMISSION_SCOPE'; end if;
    if target.permissions_version <> (item->>'version')::bigint then raise exception 'PERMISSION_VERSION_CONFLICT'; end if;

    before_modules := public.permission_effective_modules(p_tenant,target.id);
    if (p_module=any(before_modules)) = (p_action='grant')
      and not (p_action='revoke' and p_module in ('overview_leaderboard','overview_leaderboard_all_stores','overview_store_sales') and exists(
        select 1 from public.user_module_permissions where user_id=target.id and enabled
          and (module_id=p_module or (p_module='overview_leaderboard' and module_id='overview_leaderboard_all_stores'))
      ))
    then
      unchanged := unchanged+1;
      continue;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('module',module_id,'enabled',enabled,'additive',additive_grant)
      order by module_id),'[]'::jsonb) into previous_rows
    from public.user_module_permissions where user_id=target.id;

    after_mode := target.module_access_mode;
    if p_action='grant' then
      if p_module='overview_leaderboard_all_stores'
        and (target.module_access_mode<>'custom' or not ('overview_leaderboard'=any(before_modules)))
      then skipped := skipped+1; continue; end if;
      if (p_module in ('live_calendar','overview_store_sales') and target.store_access_mode <> 'selected')
        or (p_module in ('live_calendar','overview_store_sales','overview_leaderboard') and target.store_access_mode='selected'
          and cardinality(public.permission_effective_stores(p_tenant,target.id))=0)
      then skipped := skipped+1; continue; end if;
      added_modules := case when p_module in ('overview_leaderboard','overview_store_sales') and not ('overview'=any(before_modules))
        then array['overview',p_module] else array[p_module] end;
      foreach module in array added_modules loop
        insert into public.user_module_permissions(user_id,module_id,enabled,additive_grant,updated_at)
          values(target.id,module,true,module<>'overview_leaderboard_all_stores',now())
          on conflict(user_id,module_id) do update set enabled=true,additive_grant=excluded.additive_grant,updated_at=excluded.updated_at;
      end loop;
      expected_modules := before_modules || added_modules;
    else
      update public.user_module_permissions set enabled=false,additive_grant=false,updated_at=now()
        where user_id=target.id and enabled
          and (module_id=p_module or (p_module='overview_leaderboard' and module_id='overview_leaderboard_all_stores'));
      if p_module=any(public.permission_effective_modules(p_tenant,target.id)) then
        update public.user_module_permissions set enabled=false,updated_at=now()
          where user_id=target.id and enabled and not additive_grant and module_id=any(managed_modules) and not(module_id=any(before_modules));
        foreach module in array before_modules loop
          if module=any(removed_modules) then continue; end if;
          insert into public.user_module_permissions(user_id,module_id,enabled,additive_grant,updated_at)
            values(target.id,module,true,false,now())
            on conflict(user_id,module_id) do update set enabled=true,updated_at=excluded.updated_at;
        end loop;
        update public.customer_users set module_access_mode='custom' where id=target.id and tenant_id=p_tenant;
        after_mode := 'custom';
        converted := converted + 1;
      end if;
      expected_modules := array(select m from unnest(before_modules) m where not(m=any(removed_modules)));
    end if;

    after_modules := public.permission_effective_modules(p_tenant,target.id);
    if not (after_modules <@ expected_modules and expected_modules <@ after_modules)
    then raise exception 'PERMISSION_SCOPE'; end if;
    if p_action='revoke' then
      update public.feature_grant_notifications set acknowledged_at=now()
        where tenant_id=p_tenant and user_id=target.id and acknowledged_at is null
          and (module_id=any(before_modules) or module_id=any(removed_modules))
          and not(module_id=any(after_modules));
    end if;
    update public.customer_users set permissions_version=permissions_version+1 where id=target.id and tenant_id=p_tenant;
    insert into public.user_access_audit_log(tenant_id,actor_user_id,target_user_id,actor_email,request_id,request_payload,before_value,after_value,result)
    values(p_tenant,actor.id,target.id,actor.email,gen_random_uuid(),
      jsonb_build_object('operation','change_selected_feature_access_member','rootRequestId',p_request_id),
      jsonb_build_object('enabledModules',before_modules,'mode',target.module_access_mode,'moduleRows',previous_rows,'permissionsVersion',target.permissions_version),
      jsonb_build_object('enabledModules',after_modules,'mode',after_mode,'permissionsVersion',target.permissions_version+1),
      jsonb_build_object('id',target.id));
    changed := changed+1;
  end loop;

  result := jsonb_build_object('changed',changed,'unchanged',unchanged,'skipped',skipped,'converted',converted);
  insert into public.user_access_audit_log(tenant_id,actor_user_id,target_user_id,actor_email,request_id,request_payload,before_value,after_value,result)
  values(p_tenant,actor.id,actor.id,actor.email,p_request_id,payload,'{}'::jsonb,'{}'::jsonb,result);
  return result;
end $$;

revoke all on function public.change_selected_feature_access(text,text,text,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.change_selected_feature_access(text,text,text,text,jsonb,uuid) to service_role;
