-- Run only against an explicitly selected database after BOTH release migrations.
-- Fixtures use a unique tenant and are rolled back; no existing business row changes.
begin;
do $test$
declare
 t text:='feature-readiness-'||replace(gen_random_uuid()::text,'-','');
 other_t text:='feature-readiness-other-'||replace(gen_random_uuid()::text,'-','');
 owner_email text;other_email text;actor_id bigint;target_id bigint;default_id bigint;
 fixture_store_id text;other_store text;body jsonb;answer jsonb;again jsonb;original_body jsonb;
 root_request uuid:=gen_random_uuid();version_before bigint;notices_before bigint;
 ids bigint[];ack_before timestamptz;health_id uuid;read_count bigint;
begin
 owner_email:=t||'@example.invalid';other_email:=other_t||'@example.invalid';
 fixture_store_id:='shopee-'||t;other_store:='shopee-'||other_t;
 insert into public.tenants(id,name,active) values(t,'Rollback-only feature readiness',true),(other_t,'Other rollback-only tenant',true);
 insert into public.stores(id,tenant_id,name,platform,bigseller_name)
 values(fixture_store_id,t,'Rollback store','Shopee MY','Rollback store'),(other_store,other_t,'Other rollback store','Shopee MY','Other rollback store');
 insert into public.customer_users(email,tenant_id,role,active,module_access_mode,store_access_mode)
 values(owner_email,t,'superadmin',true,'role_default','all') returning id into actor_id;
 insert into public.customer_users(email,tenant_id,role,active,module_access_mode,store_access_mode)
 values(t||'-customer@example.invalid',t,'customer',true,'custom','selected') returning id into target_id;
 insert into public.customer_users(email,tenant_id,role,active,module_access_mode,store_access_mode)
 values(t||'-default@example.invalid',t,'customer',true,'role_default','selected') returning id into default_id;
 insert into public.customer_users(email,tenant_id,role,active,module_access_mode,store_access_mode)
 values(other_email,other_t,'superadmin',true,'role_default','all');
 insert into public.user_store_access(user_id,store_id,enabled) values(target_id,fixture_store_id,true),(default_id,fixture_store_id,true);
 insert into public.user_module_permissions(user_id,module_id,enabled) values(target_id,'overview',true);
 insert into public.tenant_module_permissions(tenant_id,module_id,enabled) values(t,'packages',false),(t,'overview',false);

 -- Owner-created test facts only. The server role must be read-only afterward.
 insert into public.bigseller_store_daily(tenant_id,store_id,bigseller_store_name,marketplace,report_date,currency,gross_revenue,canceled_orders,canceled_sales)
 values(t,fixture_store_id,'Rollback store','Shopee','2026-10-01','MYR',123.45,0,0);
 insert into public.store_health_snapshots(check_date,store_name,platform,penalty_points,nfr,lsr,fhr,response_rate,rating,failing)
 values('2026-10-01',t,'Shopee',0,0,0,100,100,5,'[]'::jsonb) returning id into health_id;
 if not exists(select 1 from pg_class where oid='public.store_health_snapshots'::regclass and relrowsecurity) then raise exception 'Health RLS missing';end if;
 if has_table_privilege('anon','public.store_health_snapshots','SELECT')
 or has_table_privilege('authenticated','public.store_health_snapshots','SELECT')
 or has_table_privilege('service_role','public.store_health_snapshots','INSERT')
 or has_table_privilege('service_role','public.store_health_snapshots','UPDATE')
 or has_table_privilege('service_role','public.store_health_snapshots','DELETE')
 or has_table_privilege('service_role','public.store_health_snapshots','TRUNCATE') then raise exception 'Health source role is not read-only';end if;
 if not has_table_privilege('service_role','public.bigseller_store_daily','SELECT') then raise exception 'Sales source SELECT missing';end if;
 if has_table_privilege('service_role','public.feature_grant_notifications','DELETE')
 or has_table_privilege('service_role','public.feature_grant_notifications','TRUNCATE')
 or has_column_privilege('service_role','public.feature_grant_notifications','module_id','UPDATE')
 or not has_column_privilege('service_role','public.feature_grant_notifications','acknowledged_at','UPDATE') then raise exception 'Notification ACL is not limited to acknowledgement';end if;
 if not exists(
   select 1 from pg_constraint
   where conrelid='public.user_module_permissions'::regclass
   and conname='user_module_permissions_module_check'
   and pg_get_constraintdef(oid) like '%overview_leaderboard%'
   and pg_get_constraintdef(oid) like '%overview_store_sales%'
   and pg_get_constraintdef(oid) like '%individual_ads%'
 ) then raise exception 'Module constraint is not aligned with the permission vocabulary';end if;

 execute 'set local role service_role';
 select count(*) into read_count from public.bigseller_store_daily s where s.tenant_id=t and s.store_id=fixture_store_id;
 if read_count<>1 then raise exception 'Service cannot read scoped sales fixture';end if;
 select count(*) into read_count from public.store_health_snapshots where id=health_id;
 if read_count<>1 then raise exception 'Service cannot read health fixture';end if;

 -- A user's explicit custom access overrides role defaults, including a tenant
 -- default that hides Overview from newly-created role-default accounts.
 body:=jsonb_build_object('displayName','Rollback customer','role','customer','active',true,
 'moduleAccessMode','custom','enabledModules',jsonb_build_array('overview','overview_leaderboard','overview_store_sales'),
 'storeAccessMode','selected','storeIds',jsonb_build_array(fixture_store_id),'canManagePermissions',false,
 'expectedVersion','0','requestId',gen_random_uuid()::text);
 original_body:=body;
 answer:=public.save_user_access(t,owner_email,target_id,body);
 if answer->>'version'<>'1' or not('overview_store_sales'=any(public.permission_effective_modules(t,target_id)))
 or not('overview_leaderboard'=any(public.permission_effective_modules(t,target_id))) then raise exception 'Subsection save contract failed';end if;
 if public.permission_effective_stores(t,target_id) is distinct from array[fixture_store_id] then raise exception 'Save expanded store scope';end if;
 select count(*) into notices_before from public.feature_grant_notifications where tenant_id=t and user_id=target_id;
 if notices_before<>2 then raise exception 'Real new capabilities did not emit two notices';end if;
 again:=public.save_user_access(t,owner_email,target_id,original_body);
 if again is distinct from answer or (select count(*) from public.feature_grant_notifications where tenant_id=t and user_id=target_id)<>notices_before then raise exception 'Save replay duplicated audit or notices';end if;

 begin
  perform public.save_user_access(t,owner_email,target_id,body||jsonb_build_object('displayName','Conflicting replay'));
  raise exception 'Changed replay accepted';
 exception when others then if sqlerrm<>'PERMISSION_REQUEST_CONFLICT' then raise;end if;end;
 begin
  perform public.save_user_access(t,owner_email,target_id,body||jsonb_build_object('expectedVersion','0','requestId',gen_random_uuid()::text));
  raise exception 'Stale save accepted';
 exception when others then if sqlerrm<>'PERMISSION_VERSION_CONFLICT' then raise;end if;end;
 begin
  perform public.save_user_access(t,owner_email,target_id,body||jsonb_build_object('enabledModules',jsonb_build_array('overview_store_sales'),'expectedVersion','1','requestId',gen_random_uuid()::text));
  raise exception 'Missing prerequisite accepted';
 exception when others then if sqlerrm<>'PERMISSION_INVALID' then raise;end if;end;
 begin
  perform public.save_user_access(t,owner_email,target_id,body||jsonb_build_object('storeIds',jsonb_build_array(other_store),'expectedVersion','1','requestId',gen_random_uuid()::text));
  raise exception 'Cross-tenant store accepted';
 exception when others then if sqlerrm<>'PERMISSION_SCOPE' then raise;end if;end;

 -- Manual all-participants grant remains explicit, and never comes from bulk release.
 body:=body||jsonb_build_object('enabledModules',jsonb_build_array('overview','overview_leaderboard','overview_leaderboard_all_stores','overview_store_sales'),'expectedVersion','1','requestId',gen_random_uuid()::text);
 perform public.save_user_access(t,owner_email,target_id,body);
 if not('overview_leaderboard_all_stores'=any(public.permission_effective_modules(t,target_id))) then raise exception 'Explicit all-participants scope did not persist';end if;
 begin
  perform public.grant_feature_to_all(t,owner_email,'overview_leaderboard_all_stores',gen_random_uuid());
  raise exception 'Cross-store capability accepted by bulk';
 exception when others then if sqlerrm<>'PERMISSION_INVALID' then raise;end if;end;
 begin
  perform public.grant_feature_to_all(t,owner_email,'health',gen_random_uuid());
  raise exception 'SA-only health accepted by bulk';
 exception when others then if sqlerrm<>'PERMISSION_INVALID' then raise;end if;end;

 answer:=public.grant_feature_to_all(t,owner_email,'packages',root_request);
 if (answer->>'granted')::integer<>2 then raise exception 'Expected two actual additive grants';end if;
 if not('packages'=any(public.permission_effective_modules(t,default_id))) then raise exception 'Default additive grant missing';end if;
 if (select module_access_mode from public.customer_users where id=default_id)<>'role_default' then raise exception 'Bulk replaced default mode';end if;
 again:=public.grant_feature_to_all(t,owner_email,'packages',root_request);
 if again is distinct from answer then raise exception 'Bulk replay changed receipt';end if;

 -- A later normal custom save must retain selected additive access, and allow revocation.
 body:=body||jsonb_build_object('enabledModules',jsonb_build_array('overview','overview_leaderboard','overview_leaderboard_all_stores','overview_store_sales','packages'),'expectedVersion','3','requestId',gen_random_uuid()::text);
 perform public.save_user_access(t,owner_email,target_id,body);
 if not('packages'=any(public.permission_effective_modules(t,target_id))) then raise exception 'Normal save lost additive access';end if;
 body:=body||jsonb_build_object('enabledModules',jsonb_build_array('overview','overview_leaderboard','overview_leaderboard_all_stores','overview_store_sales'),'expectedVersion','4','requestId',gen_random_uuid()::text);
 perform public.save_user_access(t,owner_email,target_id,body);
 if exists(select 1 from public.user_module_permissions where user_id=target_id and module_id='packages' and (enabled or additive_grant)) then raise exception 'Custom revocation left an additive bypass';end if;
 if (select permissions_version from public.customer_users where id=target_id)<>5 then raise exception 'Rejected writes advanced permission version';end if;

 -- A role-default member can be saved without forcing custom mode or dropping grants.
 body:=jsonb_build_object('displayName','Default saved','role','customer','active',true,
 'moduleAccessMode','role_default','enabledModules',jsonb_build_array('overview'),
 'storeAccessMode','selected','storeIds',jsonb_build_array(fixture_store_id),'canManagePermissions',false,
 'expectedVersion','1','requestId',gen_random_uuid()::text);
 perform public.save_user_access(t,owner_email,default_id,body);
 if not('packages'=any(public.permission_effective_modules(t,default_id))) then raise exception 'Default save lost additive grant';end if;

 select array_agg(id order by id) into ids from public.feature_grant_notifications where tenant_id=t and user_id=default_id and acknowledged_at is null;
 perform public.ack_feature_grant_notifications(t,default_id,ids);
 select max(acknowledged_at) into ack_before from public.feature_grant_notifications where tenant_id=t and user_id=default_id;
 perform public.ack_feature_grant_notifications(t,default_id,ids);
 if (select max(acknowledged_at) from public.feature_grant_notifications where tenant_id=t and user_id=default_id) is distinct from ack_before then raise exception 'Repeated acknowledgement changed timestamp';end if;
 execute 'reset role';
 raise notice 'Production feature readiness checks PASS; all fixtures roll back.';
end $test$;
rollback;
