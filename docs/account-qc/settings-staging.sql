-- Isolated shopee-hub-staging ubjfuveoqbvouryldqfu only. All synthetic records rolled back.
begin;
insert into public.customer_users(email,tenant_id,role,active) values('account-qc@test.invalid','test-staging','superadmin',true);
set local role service_role;
do $$
declare current_month date:=date_trunc('month',now() at time zone 'Asia/Kuala_Lumpur')::date;
  next_month date:=(date_trunc('month',now() at time zone 'Asia/Kuala_Lumpur')+interval '1 month')::date;
  result jsonb; fixed jsonb:='{"type":"fixed","currency":"MYR","basis":"fixed_monthly","fixedAmount":"100.00"}';
  before_count bigint; after_count bigint;
begin
  select count(*) into before_count from public.account_audit_log where tenant_id='test-staging';
  result:=public.account_save_billing_unit_version('test-staging','account-qc@test.invalid','roster-2026-10-my-99999','TEST Project','TEST Entity','MYR',next_month,'mapping','test-kata-my',null,0,'10000000-0000-4000-8000-000000000001');
  if result->>'version'<>'1' then raise exception 'QC expected mapping version1';end if;
  result:=public.account_save_billing_unit_version('test-staging','account-qc@test.invalid','roster-2026-10-my-99999','TEST Project','TEST Entity','MYR',next_month,'mapping','test-kata-my',null,0,'10000000-0000-4000-8000-000000000001');
  if result->>'version'<>'1' then raise exception 'QC idempotency failure';end if;
  result:=public.account_save_billing_unit_version('test-staging','account-qc@test.invalid','roster-2026-10-my-99999','TEST Project','TEST Entity','MYR',current_month,'fee_rule',null,fixed,1,'10000000-0000-4000-8000-000000000002');
  if result->>'version'<>'2' then raise exception 'QC expected rule version2';end if;
  result:=public.account_save_billing_unit_version('test-staging','account-qc@test.invalid','roster-2026-10-my-99999','TEST Project','TEST Entity','MYR',next_month,'mapping','test-control-my',null,2,'10000000-0000-4000-8000-000000000003');
  if result->>'version'<>'3' or (select fee_rule from public.account_billing_unit_versions where tenant_id='test-staging' and roster_key='roster-2026-10-my-99999' and version=3) is distinct from fixed then raise exception 'QC earlier rule lost by later mapping';end if;
  if (select store_id from public.account_billing_unit_versions where tenant_id='test-staging' and roster_key='roster-2026-10-my-99999' and version=1)<>'test-kata-my' then raise exception 'QC old version rewritten';end if;
  begin perform public.account_save_billing_unit_version('test-staging','account-qc@test.invalid','roster-2026-10-my-99999','TEST Project','TEST Entity','MYR',current_month,'fee_rule',null,fixed,1,'10000000-0000-4000-8000-000000000004');raise exception 'QC stale version accepted';exception when others then if sqlerrm<>'ACCOUNT_VERSION_CONFLICT' then raise;end if;end;
  begin perform public.account_save_billing_unit_version('test-staging','account-qc@test.invalid','roster-2026-10-my-99999','TEST Project','TEST Entity','MYR',next_month,'mapping','test-control-my',null,0,'10000000-0000-4000-8000-000000000001');raise exception 'QC changed retry accepted';exception when others then if sqlerrm<>'ACCOUNT_REQUEST_CONFLICT' then raise;end if;end;
  begin perform public.account_save_billing_unit_version('test-staging','not-an-admin@test.invalid','roster-2026-10-my-99999','TEST Project','TEST Entity','MYR',current_month,'fee_rule',null,fixed,3,'10000000-0000-4000-8000-000000000005');raise exception 'QC nonadmin accepted';exception when others then if sqlerrm<>'ACCOUNT_ACCESS_DENIED' then raise;end if;end;
  begin perform public.account_save_billing_unit_version('test-staging','account-qc@test.invalid','roster-2026-10-my-99999','TEST Project','TEST Entity','MYR',current_month,'mapping','foreign-store-id',null,3,'10000000-0000-4000-8000-000000000006');raise exception 'QC foreign store accepted';exception when others then if sqlerrm<>'ACCOUNT_INVALID' then raise;end if;end;
  begin perform public.account_save_billing_unit_version('test-staging','account-qc@test.invalid','roster-2026-10-my-99999','TEST Project','TEST Entity','MYR',current_month,'fee_rule',null,'{"type":"percent","currency":"MYR","basis":"custom","percent":"3"}',3,'10000000-0000-4000-8000-000000000007');raise exception 'QC custom missing label accepted';exception when others then if sqlerrm<>'ACCOUNT_INVALID' then raise;end if;end;
  if public.account_fee_rule_valid('{"type":"fixed","currency":"MYR","basis":"fixed_monthly"}','MYR') is distinct from false or public.account_fee_rule_valid('{"type":"percent","currency":"MYR","basis":"net_gmv","percent":null}','MYR') is distinct from false or public.account_fee_rule_valid('{"currency":"MYR","basis":"fixed_monthly","fixedAmount":"100"}','MYR') is distinct from false then raise exception 'QC missing field passed validator';end if;
  begin update public.account_billing_unit_versions set fee_rule=null where tenant_id='test-staging' and roster_key='roster-2026-10-my-99999';raise exception 'QC old version mutable';exception when insufficient_privilege then null;end;
  select count(*) into after_count from public.account_audit_log where tenant_id='test-staging';
  if after_count-before_count<>3 then raise exception 'QC atomic audit or retry count mismatch';end if;
end $$;
rollback;
