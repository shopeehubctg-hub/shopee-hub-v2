-- Run only after the migration. Every fixture and change is rolled back.
-- No DELETE, archive, cleanup statement, existing user edit or default grant is used.
begin;
create function pg_temp.expect_permission_failure(p_tenant text,p_actor text,p_target bigint,p_body jsonb,p_error text) returns void
language plpgsql security invoker set search_path='' as $$begin
 begin
  perform public.save_user_access(p_tenant,p_actor,p_target,p_body);
 exception when others then
  if sqlerrm=p_error then return;end if;raise;
 end;
 raise exception 'Expected failure %',p_error;
end $$;

do $$
declare
 suffix text:=replace(gen_random_uuid()::text,'-','');tenant_a text;tenant_b text;
 sa bigint;delegate_id bigint;target_id bigint;manager_id bigint;peer_id bigint;foreign_id bigint;wide_store_id bigint;wide_module_id bigint;
 sa_email text;delegate_email text;store_a text;store_b text;store_c text;foreign_store text;
 body jsonb;grant_body jsonb;first_body jsonb;answer jsonb;again jsonb;n bigint;before_audit bigint;after_audit bigint;
begin
 tenant_a:='permission-test-'||suffix;tenant_b:='permission-other-'||suffix;
 sa_email:='permission-sa-'||suffix||'@example.invalid';delegate_email:='permission-delegate-'||suffix||'@example.invalid';
 store_a:='shopee-permission-'||suffix||'-a';store_b:='shopee-permission-'||suffix||'-b';store_c:='shopee-permission-'||suffix||'-c';foreign_store:='shopee-permission-'||suffix||'-foreign';
 insert into public.tenants(id,name,active) values(tenant_a,'Permission rollback test',true),(tenant_b,'Other permission rollback test',true);
 insert into public.stores(id,tenant_id,name,platform,bigseller_name) values
 (store_a,tenant_a,'Test A','Shopee MY','Test A'),(store_b,tenant_a,'Test B','Shopee MY','Test B'),(store_c,tenant_a,'Test C','Shopee MY','Test C'),(foreign_store,tenant_b,'Foreign test','Shopee MY','Foreign test');
 insert into public.customer_users(email,tenant_id,role,active,module_access_mode,store_access_mode) values(sa_email,tenant_a,'superadmin',true,'role_default','all') returning id into sa;
 insert into public.customer_users(email,tenant_id,role,active,module_access_mode,store_access_mode) values(delegate_email,tenant_a,'manager',true,'custom','selected') returning id into delegate_id;
 insert into public.customer_users(email,tenant_id,role,active,module_access_mode,store_access_mode) values('permission-target-'||suffix||'@example.invalid',tenant_a,'customer',true,'custom','selected') returning id into target_id;
 insert into public.customer_users(email,tenant_id,role,active,module_access_mode,store_access_mode) values('permission-manager-'||suffix||'@example.invalid',tenant_a,'manager',true,'custom','selected') returning id into manager_id;
 insert into public.customer_users(email,tenant_id,role,active,module_access_mode,store_access_mode,can_manage_permissions) values('permission-peer-'||suffix||'@example.invalid',tenant_a,'customer',true,'custom','selected',true) returning id into peer_id;
 insert into public.customer_users(email,tenant_id,role,active,module_access_mode,store_access_mode) values('permission-foreign-'||suffix||'@example.invalid',tenant_b,'customer',true,'custom','selected') returning id into foreign_id;
 insert into public.customer_users(email,tenant_id,role,active,module_access_mode,store_access_mode) values('permission-wide-store-'||suffix||'@example.invalid',tenant_a,'customer',true,'custom','selected') returning id into wide_store_id;
 insert into public.customer_users(email,tenant_id,role,active,module_access_mode,store_access_mode) values('permission-wide-module-'||suffix||'@example.invalid',tenant_a,'customer',true,'custom','selected') returning id into wide_module_id;
 insert into public.user_module_permissions(user_id,module_id,enabled) values
 (delegate_id,'overview',true),(delegate_id,'packages',true),(delegate_id,'health',true),
 (target_id,'overview',true),(target_id,'individual_ads',true),(wide_store_id,'overview',true),(wide_module_id,'overview',true),(wide_module_id,'advertising',true);
 insert into public.tenant_module_permissions(tenant_id,module_id,enabled) values(tenant_a,'health',false);
 insert into public.user_store_access(user_id,store_id) values(delegate_id,store_a),(delegate_id,store_b),(target_id,store_a),(target_id,store_b),(manager_id,store_a),(peer_id,store_a),(foreign_id,foreign_store),(wide_store_id,store_a),(wide_store_id,store_c),(wide_module_id,store_a);
 if (select can_manage_permissions from public.customer_users where id=delegate_id) then raise exception 'Non-SA capability must default false';end if;
 if has_function_privilege('anon','public.save_user_access(text,text,bigint,jsonb)','execute') or has_function_privilege('authenticated','public.save_user_access(text,text,bigint,jsonb)','execute') or has_table_privilege('authenticated','public.user_access_audit_log','select') then raise exception 'Client role can access privileged configuration';end if;
 if not has_function_privilege('service_role','public.save_user_access(text,text,bigint,jsonb)','execute') then raise exception 'Server role missing RPC';end if;
 if has_table_privilege('service_role','public.user_access_audit_log','update') or has_table_privilege('service_role','public.user_access_audit_log','delete') or has_table_privilege('service_role','public.user_access_audit_log','truncate') then raise exception 'Permission audit is not append-only';end if;
 execute format('grant usage on schema %I to service_role',(select nspname from pg_namespace where oid=pg_my_temp_schema()));
 execute 'grant execute on function pg_temp.expect_permission_failure(text,text,bigint,jsonb,text) to service_role';
 execute 'set local role service_role';
 body:=jsonb_build_object('displayName','Target saved','role','customer','active',false,'moduleAccessMode','custom','enabledModules',jsonb_build_array('overview','packages'),'storeAccessMode','selected','storeIds',jsonb_build_array(store_a),'canManagePermissions',false,'expectedVersion','0','requestId',gen_random_uuid()::text);
 perform pg_temp.expect_permission_failure(tenant_a,delegate_email,target_id,body,'PERMISSION_ACCESS_DENIED');
 grant_body:=jsonb_build_object('displayName','Delegated manager','role','manager','active',true,'moduleAccessMode','custom','enabledModules',jsonb_build_array('overview','packages','health'),'storeAccessMode','selected','storeIds',jsonb_build_array(store_a,store_b),'canManagePermissions',true,'expectedVersion','0','requestId',gen_random_uuid()::text);
 answer:=public.save_user_access(tenant_a,sa_email,delegate_id,grant_body);
 if answer->>'version'<>'1' or not(select can_manage_permissions from public.customer_users where id=delegate_id) then raise exception 'SA explicit grant not saved';end if;
 if 'health'=any(public.permission_effective_modules(tenant_a,delegate_id)) then raise exception 'Tenant-disabled module leaked into grantable set';end if;

 perform pg_temp.expect_permission_failure(tenant_a,sa_email,target_id,body||jsonb_build_object('enabledModules',jsonb_build_array('live_calendar'),'storeAccessMode','all','requestId',gen_random_uuid()::text),'PERMISSION_INVALID');
 perform pg_temp.expect_permission_failure(tenant_a,sa_email,target_id,body||jsonb_build_object('enabledModules',jsonb_build_array('live_calendar'),'storeIds','[]'::jsonb,'requestId',gen_random_uuid()::text),'PERMISSION_INVALID');
 first_body:=body;answer:=public.save_user_access(tenant_a,delegate_email,target_id,first_body);
 if answer->>'version'<>'1' then raise exception 'Permission version did not increment';end if;
 if (select active from public.customer_users where id=target_id) or (select display_name from public.customer_users where id=target_id)<>'Target saved' then raise exception 'Allowed ordinary user fields not saved';end if;
 if not exists(select 1 from public.user_store_access where user_id=target_id and store_id=store_b and not enabled) then raise exception 'Unselected prior store was not disabled';end if;
 if public.permission_effective_stores(tenant_a,target_id) is distinct from array[store_a] then raise exception 'Disabled store remains effective';end if;
 if not exists(select 1 from public.user_module_permissions where user_id=target_id and module_id='individual_ads' and enabled) then raise exception 'Unrelated legacy capability was overwritten';end if;
 select count(*) into before_audit from public.user_access_audit_log where tenant_id=tenant_a;
 again:=public.save_user_access(tenant_a,delegate_email,target_id,first_body);
 select count(*) into after_audit from public.user_access_audit_log where tenant_id=tenant_a;
 if again is distinct from answer or before_audit<>after_audit then raise exception 'Exact retry duplicated mutation/audit';end if;
 perform pg_temp.expect_permission_failure(tenant_a,delegate_email,target_id,first_body||jsonb_build_object('displayName','Conflicting retry'),'PERMISSION_REQUEST_CONFLICT');

 body:=first_body||jsonb_build_object('active',true,'expectedVersion','1','requestId',gen_random_uuid()::text);
 perform pg_temp.expect_permission_failure(tenant_a,delegate_email,target_id,body||jsonb_build_object('role','manager'),'PERMISSION_SCOPE');
 perform pg_temp.expect_permission_failure(tenant_a,delegate_email,target_id,body||jsonb_build_object('canManagePermissions',true),'PERMISSION_SCOPE');
 perform pg_temp.expect_permission_failure(tenant_a,delegate_email,target_id,body||jsonb_build_object('enabledModules',jsonb_build_array('overview','health')),'PERMISSION_SCOPE');
 perform pg_temp.expect_permission_failure(tenant_a,delegate_email,target_id,body||jsonb_build_object('enabledModules',jsonb_build_array('permission_settings')),'PERMISSION_INVALID');
 perform pg_temp.expect_permission_failure(tenant_a,delegate_email,target_id,body||jsonb_build_object('storeIds',jsonb_build_array(store_c)),'PERMISSION_SCOPE');
 perform pg_temp.expect_permission_failure(tenant_a,delegate_email,target_id,body||jsonb_build_object('storeIds',jsonb_build_array(foreign_store)),'PERMISSION_SCOPE');
 perform pg_temp.expect_permission_failure(tenant_a,delegate_email,target_id,body||jsonb_build_object('storeAccessMode','all'),'PERMISSION_SCOPE');
 perform pg_temp.expect_permission_failure(tenant_a,delegate_email,target_id,body||jsonb_build_object('moduleAccessMode','role_default'),'PERMISSION_SCOPE');
 perform pg_temp.expect_permission_failure(tenant_a,delegate_email,target_id,body||jsonb_build_object('expectedVersion','0'),'PERMISSION_VERSION_CONFLICT');
 perform pg_temp.expect_permission_failure(tenant_a,delegate_email,target_id,body||jsonb_build_object('email','forged@example.invalid'),'PERMISSION_INVALID');
 perform pg_temp.expect_permission_failure(tenant_a,delegate_email,target_id,body-'active','PERMISSION_INVALID');
 perform pg_temp.expect_permission_failure(tenant_a,delegate_email,delegate_id,body,'PERMISSION_PROTECTED');
 perform pg_temp.expect_permission_failure(tenant_a,delegate_email,sa,body,'PERMISSION_PROTECTED');
 perform pg_temp.expect_permission_failure(tenant_a,delegate_email,manager_id,body,'PERMISSION_PROTECTED');
 perform pg_temp.expect_permission_failure(tenant_a,delegate_email,peer_id,body,'PERMISSION_PROTECTED');
 perform pg_temp.expect_permission_failure(tenant_a,delegate_email,foreign_id,body,'PERMISSION_SCOPE');
 perform pg_temp.expect_permission_failure(tenant_a,delegate_email,wide_store_id,body,'PERMISSION_SCOPE');
 perform pg_temp.expect_permission_failure(tenant_a,delegate_email,wide_module_id,body,'PERMISSION_SCOPE');
 select permissions_version into n from public.customer_users where id=target_id;
 if n<>1 then raise exception 'Rejected requests partially saved target';end if;
 answer:=public.save_user_access(tenant_a,delegate_email,target_id,body);
 if answer->>'version'<>'2' or not(select active from public.customer_users where id=target_id) then raise exception 'Delegate could not reactivate ordinary target';end if;

 -- Fresh capability state is checked before old request replay.
 perform public.save_user_access(tenant_a,sa_email,delegate_id,grant_body||jsonb_build_object('canManagePermissions',false,'expectedVersion','1','requestId',gen_random_uuid()::text));
 perform pg_temp.expect_permission_failure(tenant_a,delegate_email,target_id,body,'PERMISSION_ACCESS_DENIED');
 perform pg_temp.expect_permission_failure(tenant_a,sa_email,sa,grant_body||jsonb_build_object('role','customer','canManagePermissions',false,'expectedVersion','0','requestId',gen_random_uuid()::text),'PERMISSION_SELF');
 execute 'reset role';
 raise notice 'Delegated Permission Settings SQL integration checks PASS; fixtures will roll back.';
end $$;
rollback;
