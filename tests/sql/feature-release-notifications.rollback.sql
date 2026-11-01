begin;
do $$
declare t text:='feature-release-qc';sa bigint;u_default bigint;u_custom bigint;r jsonb;r2 jsonb;r3 jsonb;rid uuid:=gen_random_uuid();notice_ids bigint[];
begin
 insert into public.tenants(id,name,active) values(t,'Feature release QC',true);
 insert into public.customer_users(email,tenant_id,display_name,active,role,module_access_mode,store_access_mode,permissions_version) values
 ('feature-owner-qc@example.invalid',t,'Owner',true,'superadmin','role_default','all',0) returning id into sa;
 insert into public.customer_users(email,tenant_id,display_name,active,role,module_access_mode,store_access_mode,permissions_version) values
 ('feature-default-qc@example.invalid',t,'Default',true,'customer','role_default','all',0) returning id into u_default;
 insert into public.customer_users(email,tenant_id,display_name,active,role,module_access_mode,store_access_mode,permissions_version) values
 ('feature-custom-qc@example.invalid',t,'Custom',true,'customer','custom','all',0) returning id into u_custom;
 insert into public.tenant_module_permissions(tenant_id,module_id,enabled) values(t,'packages',false);
 insert into public.user_module_permissions(user_id,module_id,enabled) values(u_custom,'packages',true);

 r:=public.grant_feature_to_all(t,'feature-owner-qc@example.invalid','packages',rid);
 if (r->>'granted')::int<>1 or (r->>'alreadyEnabled')::int<>1 then raise exception 'unexpected bulk result %',r;end if;
 if not('packages'=any(public.permission_effective_modules(t,u_default))) then raise exception 'role default additive missing';end if;
 if not('packages'=any(public.permission_effective_modules(t,u_custom))) then raise exception 'custom access changed';end if;
 if (select count(*) from public.feature_grant_notifications where tenant_id=t and user_id=u_default and module_id='packages')<>1 then raise exception 'notification missing';end if;
 r2:=public.grant_feature_to_all(t,'feature-owner-qc@example.invalid','packages',rid);
 if r2 is distinct from r then raise exception 'request replay changed';end if;
 if (select count(*) from public.feature_grant_notifications where tenant_id=t)<>1 then raise exception 'replay duplicated notice';end if;
 r3:=public.grant_feature_to_all(t,'feature-owner-qc@example.invalid','overview_store_sales',gen_random_uuid());
 if (r3->>'skipped')::int<>2 or (r3->>'granted')::int<>0 then raise exception 'all-store Store Sales grant was not blocked %',r3;end if;
 select array_agg(id) into notice_ids from public.feature_grant_notifications where tenant_id=t and user_id=u_default;
 perform public.ack_feature_grant_notifications(t,u_default,notice_ids);
 if exists(select 1 from public.feature_grant_notifications where tenant_id=t and user_id=u_default and acknowledged_at is null) then raise exception 'ack failed';end if;
 if has_function_privilege('anon','public.grant_feature_to_all(text,text,text,uuid)','execute') or has_table_privilege('authenticated','public.feature_grant_notifications','select') then raise exception 'client role can access feature grants';end if;
end $$;
rollback;
