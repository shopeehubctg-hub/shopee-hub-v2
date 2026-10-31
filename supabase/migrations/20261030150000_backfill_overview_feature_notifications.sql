begin;

create or replace function public.permission_effective_modules(p_tenant text,p_user_id bigint) returns text[]
language sql security invoker set search_path='' as $$
 with member as(select * from public.customer_users where id=p_user_id and tenant_id=p_tenant),
 modules(id) as(select unnest(array['overview','design','calculator','packages','advertising','orders','health','protection','live_calendar','actions','overview_leaderboard','overview_leaderboard_all_stores','overview_store_sales'])),
 base as(
  select m.id from member u cross join modules m where m.id not like 'overview_%' and(
   u.role='superadmin'
   or exists(select 1 from public.user_module_permissions p where p.user_id=u.id and p.module_id=m.id and p.enabled and p.additive_grant)
   or (u.module_access_mode='custom' and exists(select 1 from public.user_module_permissions p where p.user_id=u.id and p.module_id=m.id and p.enabled and not p.additive_grant))
   or (u.module_access_mode='role_default' and case when m.id='live_calendar' then exists(select 1 from public.tenant_module_permissions t where t.tenant_id=p_tenant and t.module_id=m.id and t.enabled) else not exists(select 1 from public.tenant_module_permissions t where t.tenant_id=p_tenant and t.module_id=m.id and not t.enabled) end)
  )
 ), sections as(
  select m.id from member u cross join modules m where m.id like 'overview_%' and(
   u.role='superadmin' or(
    exists(select 1 from base where id='overview')
    and case when m.id='overview_leaderboard_all_stores' then
      u.module_access_mode='custom' and exists(select 1 from public.user_module_permissions p where p.user_id=u.id and p.module_id=m.id and p.enabled and not p.additive_grant)
      and exists(select 1 from public.user_module_permissions p where p.user_id=u.id and p.module_id='overview_leaderboard' and p.enabled)
    else exists(select 1 from public.user_module_permissions p where p.user_id=u.id and p.module_id=m.id and p.enabled and (p.additive_grant or u.module_access_mode='custom')) end
   )
  )
 ) select coalesce(array_agg(id order by id),array[]::text[]) from(select id from base union all select id from sections)x
$$;

-- Repair only successful grants made after the feature-notification release.
-- This migration intentionally sorts after the notification table migration.
-- The original audit remains immutable and is reused as the notification's
-- provenance; conflicts keep this operation idempotent.
insert into public.feature_grant_notifications(tenant_id,user_id,module_id,audit_id,granted_at)
select a.tenant_id,a.target_user_id,m.module_id,a.id,a.created_at
from public.user_access_audit_log a
cross join lateral jsonb_array_elements_text(coalesce(a.request_payload->'payload'->'enabledModules','[]'::jsonb)) m(module_id)
where a.created_at >= timestamptz '2026-10-30 04:48:00+00'
and m.module_id in('overview_leaderboard','overview_store_sales')
and not exists(select 1 from jsonb_array_elements_text(coalesce(a.before_value->'enabledModules','[]'::jsonb)) before_module where before_module=m.module_id)
and m.module_id=any(public.permission_effective_modules(a.tenant_id,a.target_user_id))
on conflict do nothing;

commit;
