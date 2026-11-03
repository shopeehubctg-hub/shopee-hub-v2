-- Isolated Staging only; every synthetic identity, grant and event is rolled back.
begin;
do $$
declare suffix text:=replace(gen_random_uuid()::text,'-','');t text;a text;u bigint;s1 text;s2 text;
begin
 t:='service-test-'||suffix;a:='service-'||suffix||'@example.invalid';u:=-abs(('x'||left(suffix,12))::bit(48)::bigint)-40000000;s1:='shopee-service-'||suffix||'-a';s2:='shopee-service-'||suffix||'-b';
 perform set_config('service.tenant',t,true);perform set_config('service.actor',a,true);perform set_config('service.uid',u::text,true);perform set_config('service.a',s1,true);perform set_config('service.b',s2,true);
 insert into public.tenants(id,name,active) values(t,'Synthetic Store lifecycle',true),('foreign-'||t,'Synthetic foreign lifecycle',true);
 insert into public.customer_users(id,email,tenant_id,role,active,module_access_mode,store_access_mode,can_manage_permissions)
 values(u,a,t,'superadmin',true,'role_default','all',false),(u-1,'all-'||a,t,'customer',true,'role_default','all',false),
 (u-2,'selected-'||a,t,'customer',true,'role_default','selected',false),(u-3,'board-'||a,t,'customer',true,'custom','selected',false),
 (u-4,'delegate-'||a,t,'customer',true,'role_default','selected',true),(u-5,'inactive-'||a,t,'customer',false,'role_default','all',false);
 insert into public.stores(id,tenant_id,name,platform,bigseller_name) values(s1,t,'Synthetic A','Shopee MY','Synthetic A'),(s2,t,'Synthetic B','Shopee MY','Synthetic B'),(s1||'-foreign','foreign-'||t,'Synthetic foreign','Shopee MY','Synthetic foreign');
 insert into public.user_store_access(user_id,store_id,enabled) values(u-2,s1,true),(u-2,s2,true),(u-3,s2,true),(u-4,s1,true);
 insert into public.user_module_permissions(user_id,module_id,enabled) values(u-3,'overview',true),(u-3,'overview_leaderboard',true),(u-3,'overview_leaderboard_all_stores',true);
end $$;
set local role service_role;
do $$
declare t text:=current_setting('service.tenant');a text:=current_setting('service.actor');u bigint:=current_setting('service.uid')::bigint;s1 text:=current_setting('service.a');s2 text:=current_setting('service.b');req uuid:=gen_random_uuid();answer jsonb;again jsonb;payload jsonb;before_rows bigint;before_modules bigint;preview jsonb;v bigint;
begin
 if not(s1=any(public.permission_effective_stores(t,u-1))) or not(s1=any(public.permission_effective_stores(t,u-2))) then raise exception 'Baseline ordinary access lost';end if;
 if s1=any(public.permission_effective_stores(t,u-3)) or not(s1=any(public.permission_effective_leaderboard_stores(t,u-3))) then raise exception 'Global board scope altered';end if;
 if cardinality(public.permission_effective_stores(t,u-5))<>0 or cardinality(public.permission_effective_stores('foreign-'||t,u-1))<>0 then raise exception 'Inactive/cross-tenant scope accepted';end if;
 perform public.account_assert_store_manager(t,'delegate-'||a,s1);
 preview:=public.preview_store_service_status(t,a,s1);
 if preview->>'affectedUsers'<>'4' then raise exception 'Preview omitted normal/all/board/delegated access: %',preview;end if;
 select count(*) into before_rows from public.user_store_access where user_id between u-5 and u;
 select count(*) into before_modules from public.user_module_permissions where user_id between u-5 and u;
 answer:=public.set_store_service_status(t,a,s1,'inactive',0,req);
 if answer->>'serviceStatusVersion'<>'1' or answer->>'revokedUsers'<>'4' then raise exception 'Atomic revoke result wrong';end if;
 for v in select id from public.customer_users where tenant_id=t and role<>'superadmin' loop
  if s1=any(public.permission_effective_stores(t,v)) or s1=any(public.permission_effective_leaderboard_stores(t,v)) then raise exception 'Inactive Store remains accessible';end if;
 end loop;
 if not(s1=any(public.permission_effective_stores(t,u))) or not(s2=any(public.permission_effective_stores(t,u-1))) or not(s2=any(public.permission_effective_stores(t,u-2))) or not(s2=any(public.permission_effective_leaderboard_stores(t,u-3))) then raise exception 'SA history/other Store access damaged';end if;
 if (select count(*) from public.user_store_access where user_id between u-5 and u)<>before_rows or (select count(*) from public.user_module_permissions where user_id between u-5 and u)<>before_modules then raise exception 'Revocation removed grant/module history';end if;
 if exists(select 1 from public.user_store_access where user_id between u-5 and u-1 and store_id=s1 and enabled) then raise exception 'Explicit grants not revoked';end if;
 if (select count(*) from public.user_access_audit_log where tenant_id=t)<>4 then raise exception 'Affected permission audit missing';end if;
 again:=public.set_store_service_status(t,a,s1,'inactive',0,req);
 if answer is distinct from again or (select count(*) from public.store_service_events where tenant_id=t)<>1 then raise exception 'Status replay duplicated';end if;
 begin perform public.set_store_service_status(t,a,s1,'ended',0,req);raise exception 'Changed replay accepted';exception when others then if sqlerrm<>'STORE_STATUS_REQUEST_CONFLICT' then raise;end if;end;
 begin perform public.set_store_service_status(t,a,s1,'ended',0,gen_random_uuid());raise exception 'Stale lifecycle accepted';exception when others then if sqlerrm<>'STORE_STATUS_VERSION_CONFLICT' then raise;end if;end;
 begin perform public.set_store_service_status(t,'delegate-'||a,s1,'active',1,gen_random_uuid());raise exception 'Delegate changed Store status';exception when others then if sqlerrm<>'STORE_ACCESS_DENIED' then raise;end if;end;
 begin perform public.set_store_service_status('foreign-'||t,a,s1,'active',1,gen_random_uuid());raise exception 'Foreign actor changed Store';exception when others then if sqlerrm<>'STORE_ACCESS_DENIED' then raise;end if;end;
 begin perform public.account_assert_store_manager(t,'delegate-'||a,s1);raise exception 'Delegated write bypassed inactive';exception when others then if sqlerrm<>'STORE_ACCESS_DENIED' then raise;end if;end;
 begin insert into public.user_store_access(user_id,store_id,enabled) values(u-1,s1,true);raise exception 'Direct inactive grant accepted';exception when others then if sqlerrm<>'STORE_SERVICE_INACTIVE' then raise;end if;end;
 payload:=jsonb_build_object('displayName','Synthetic selected','role','customer','active',true,'moduleAccessMode','custom','enabledModules',jsonb_build_array('overview'),'storeAccessMode','selected','storeIds',jsonb_build_array(s1,s2),'canManagePermissions',false,'expectedVersion','1','requestId',gen_random_uuid());
 begin perform public.save_user_access(t,a,u-2,payload);raise exception 'Permission save granted inactive';exception when others then if sqlerrm<>'STORE_SERVICE_INACTIVE' then raise;end if;end;
 -- A user created while inactive must also remain blocked after reactivation.
 insert into public.customer_users(id,email,tenant_id,role,active,module_access_mode,store_access_mode) values(u-6,'new-'||a,t,'customer',true,'role_default','all');
 perform public.set_store_service_status(t,a,s1,'active',1,gen_random_uuid());
 for v in select id from public.customer_users where tenant_id=t and role<>'superadmin' loop
  if s1=any(public.permission_effective_stores(t,v)) or s1=any(public.permission_effective_leaderboard_stores(t,v)) then raise exception 'Reactivation automatically restored access';end if;
 end loop;
 begin insert into public.user_store_access(user_id,store_id,enabled,service_access_version) values(u-6,s1,true,0);raise exception 'Stale grant epoch accepted';exception when others then if sqlerrm<>'STORE_ACCESS_REGRANT_REQUIRED' then raise;end if;end;
 begin insert into public.user_store_access(user_id,store_id,enabled,service_access_version) values(u-6,s1||'-foreign',true,0);raise exception 'Cross-tenant direct grant accepted';exception when others then if sqlerrm<>'STORE_ACCESS_DENIED' then raise;end if;end;
 -- A mode-all display-name save cannot renew access; explicit selected grant can.
 payload:=jsonb_build_object('displayName','Unrelated all-mode edit','role','customer','active',true,'moduleAccessMode','custom','enabledModules',jsonb_build_array('overview'),'storeAccessMode','all','storeIds',jsonb_build_array(s1,s2),'canManagePermissions',false,'expectedVersion','1','requestId',gen_random_uuid());
 perform public.save_user_access(t,a,u-1,payload);
 if s1=any(public.permission_effective_stores(t,u-1)) then raise exception 'Unrelated all-mode edit restored Store';end if;
 -- Saving only the remaining selected store does not renew the removed one.
 payload:=payload||jsonb_build_object('displayName','Unrelated selected edit','storeAccessMode','selected','storeIds',jsonb_build_array(s2),'expectedVersion','1','requestId',gen_random_uuid());
 perform public.save_user_access(t,a,u-2,payload);
 if s1=any(public.permission_effective_stores(t,u-2)) then raise exception 'Unrelated selected edit restored Store';end if;
 payload:=payload||jsonb_build_object('displayName','Explicit regrant','storeIds',jsonb_build_array(s1,s2),'expectedVersion','2','requestId',gen_random_uuid());
 perform public.save_user_access(t,a,u-2,payload);
 if not(s1=any(public.permission_effective_stores(t,u-2))) or not exists(select 1 from public.user_store_access where user_id=u-2 and store_id=s1 and enabled and service_access_version=2) then raise exception 'Explicit active revision grant failed';end if;
 if s1=any(public.permission_effective_stores(t,u-1)) or s1=any(public.permission_effective_stores(t,u-6)) then raise exception 'Regrant widened other users';end if;
 perform public.set_store_service_status(t,a,s1,'ended',2,gen_random_uuid());
 if s1=any(public.permission_effective_stores(t,u-2)) or not(s2=any(public.permission_effective_stores(t,u-2))) then raise exception 'Ended Store/other Store scope wrong';end if;
 perform public.set_store_service_status(t,a,s1,'active',3,gen_random_uuid());
 if s1=any(public.permission_effective_stores(t,u-2)) then raise exception 'Second reactivation revived older grant';end if;
 if (select count(*) from public.stores where tenant_id=t)<>2 then raise exception 'Lifecycle changed Store identity count';end if;
 if exists(select 1 from public.feature_grant_notifications where tenant_id=t) then raise exception 'Store lifecycle fabricated module announcements';end if;
 if has_table_privilege('service_role','public.store_service_events','UPDATE') or has_table_privilege('service_role','public.store_service_events','DELETE') or has_table_privilege('service_role','public.store_service_events','TRUNCATE') then raise exception 'Store lifecycle history mutable';end if;
 if has_function_privilege('anon','public.set_store_service_status(text,text,text,text,bigint,uuid)','EXECUTE') or has_function_privilege('authenticated','public.permission_effective_leaderboard_stores(text,bigint)','EXECUTE') then raise exception 'Lifecycle public function access';end if;
 if exists(select 1 from public.account_invoices where tenant_id=t) or exists(select 1 from public.account_receipts where tenant_id=t) then raise exception 'Lifecycle manufactured financial facts';end if;
end $$;
reset role;
rollback;
