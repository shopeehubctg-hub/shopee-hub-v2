-- Isolated Staging only. Business snapshots have already been imported without firing audit hooks.
do $$begin if not exists(select 1 from public.tenants where id='test-staging') or not exists(select 1 from public.tenants where id='j-packaging' and name='Shopee Hub · Staging') then raise exception 'ISOLATED_STAGING_DESTINATION_REQUIRED';end if;end $$;
CREATE OR REPLACE FUNCTION public.co_fund_vouchers_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
do $$begin if not exists(select 1 from pg_trigger where tgname='co_fund_vouchers_set_updated_at' and tgrelid='public.co_fund_vouchers'::regclass) then execute 'CREATE TRIGGER co_fund_vouchers_set_updated_at BEFORE UPDATE ON public.co_fund_vouchers FOR EACH ROW EXECUTE FUNCTION co_fund_vouchers_set_updated_at()';end if;end $$;
revoke all on function public.co_fund_vouchers_set_updated_at() from public,anon,authenticated;grant execute on function public.co_fund_vouchers_set_updated_at() to service_role;
CREATE OR REPLACE FUNCTION public.audit_live_session_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  insert into public.live_session_audit
    (session_id, tenant_id, action, actor_email, previous_value, current_value)
  values
    (new.id, new.tenant_id,
      case when tg_op = 'INSERT' then 'created'
           when new.status = 'cancelled' and old.status <> 'cancelled' then 'cancelled'
           else 'updated' end,
      new.updated_by,
      case when tg_op = 'INSERT' then null else to_jsonb(old) end,
      to_jsonb(new));
  return new;
end;
$function$
;
do $$begin if not exists(select 1 from pg_trigger where tgname='live_session_audit_trigger' and tgrelid='public.live_sessions'::regclass) then execute 'CREATE TRIGGER live_session_audit_trigger AFTER INSERT OR UPDATE ON public.live_sessions FOR EACH ROW EXECUTE FUNCTION audit_live_session_change()';end if;end $$;
revoke all on function public.audit_live_session_change() from public,anon,authenticated;grant execute on function public.audit_live_session_change() to service_role;

