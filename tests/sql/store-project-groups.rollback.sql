-- Independent Staging only. Synthetic state is transaction-local; no existing row is removed.
begin;
do $$
declare suffix text:=replace(gen_random_uuid()::text,'-','');t text;a text;u bigint;prefix text;
begin
 t:='project-test-'||suffix;a:='project-'||suffix||'@example.invalid';prefix:='shopee-project-'||suffix;u:=-abs(('x'||left(suffix,12))::bit(48)::bigint)-90000000;
 perform set_config('project.tenant',t,true);perform set_config('project.actor',a,true);perform set_config('project.prefix',prefix,true);perform set_config('project.uid',u::text,true);
 insert into public.tenants(id,name,active) values(t,'Synthetic multi-market Project',true),('foreign-'||t,'Synthetic foreign Project',true);
 insert into public.customer_users(id,email,tenant_id,role,active,module_access_mode,store_access_mode,can_manage_permissions)
 values(u,a,t,'superadmin',true,'role_default','all',false),(u-1,'selected-'||a,t,'customer',true,'role_default','selected',false),
  (u-2,'all-'||a,t,'customer',true,'role_default','all',false),(u-3,'delegate-'||a,t,'customer',true,'role_default','selected',true),
  (u-4,'inactive-'||a,t,'superadmin',false,'role_default','all',false);
 insert into public.stores(id,tenant_id,name,platform,bigseller_name) values
 (prefix||'-my',t,'Synthetic MY '||suffix,'Shopee MY','Synthetic MY '||suffix),
 (prefix||'-my-two',t,'Synthetic MY two '||suffix,'Shopee MY','Synthetic MY two '||suffix),
 (prefix||'-sg',t,'Synthetic SG '||suffix,'Shopee SG','Synthetic SG '||suffix),
 (prefix||'-foreign','foreign-'||t,'Synthetic foreign '||suffix,'Shopee MY','Synthetic foreign '||suffix);
 insert into public.user_store_access(user_id,store_id,enabled) values(u-1,prefix||'-my',true),(u-3,prefix||'-my',true);
end $$;
set local role service_role;
do $$
declare t text:=current_setting('project.tenant');a text:=current_setting('project.actor');prefix text:=current_setting('project.prefix');u bigint:=current_setting('project.uid')::bigint;
 my_id text:=prefix||'-my';sg_id text:=prefix||'-sg';project_uuid uuid;req uuid:=gen_random_uuid();answer jsonb;again jsonb;spec jsonb;candidate jsonb;public_view jsonb;v bigint;
 rows_before bigint;units_before bigint;audit_before bigint;requests_before bigint;project_before jsonb;ledger_table text;has_facts boolean;
 rule jsonb:='{"type":"fixed","currency":"MYR","basis":"fixed_monthly","fixedAmount":"19.99"}';setup jsonb;details jsonb:='{"projectLinks":[],"storeGroupLink":"","googleDriveLink":"","adsTopUpOwner":null}';new_th jsonb;new_ph jsonb;
begin
 spec:=jsonb_build_object('name','Synthetic multi-country','markets',jsonb_build_array(
  jsonb_build_object('market','MY','enabled',true,'storeIds',jsonb_build_array(my_id,prefix||'-my-two')),
  jsonb_build_object('market','SG','enabled',true,'storeIds',jsonb_build_array(sg_id)),
  jsonb_build_object('market','TH','enabled',true,'storeIds','[]'::jsonb)),'newStores','[]'::jsonb);
 answer:=public.save_store_project(t,a,null,spec,0,req);project_uuid:=(answer->>'id')::uuid;v:=(answer->>'version')::bigint;
 if v<>1 or (select count(*) from public.stores where tenant_id=t and project_id=project_uuid)<>3 then raise exception 'Initial grouping/multiple same-country stores failed';end if;
 begin update public.stores set project_id=project_uuid where id=prefix||'-foreign';raise exception 'Cross-tenant Project FK accepted';exception when foreign_key_violation then null;end;
 if exists(select 1 from public.account_billing_unit_versions where tenant_id=t) then raise exception 'Existing Store grouping fabricated Account configuration';end if;
 select count(*) into audit_before from public.account_audit_log where tenant_id=t;
 again:=public.save_store_project(t,a,null,spec,0,req);
 if answer is distinct from again or (select count(*) from public.account_audit_log where tenant_id=t)<>audit_before then raise exception 'Project replay duplicated history';end if;
 begin perform public.save_store_project(t,a,null,jsonb_set(spec,'{name}','"Changed replay"'),0,req);raise exception 'Changed replay accepted';exception when others then if sqlerrm<>'ACCOUNT_REQUEST_CONFLICT' then raise;end if;end;
 begin perform public.save_store_project(t,a,project_uuid,spec,0,gen_random_uuid());raise exception 'Stale Project version accepted';exception when others then if sqlerrm<>'STORE_PROJECT_VERSION_CONFLICT' then raise;end if;end;
 public_view:=public.read_store_projects(t,'selected-'||a,false);
 if position(sg_id in public_view::text)>0 or position(prefix||'-my-two' in public_view::text)>0 or position('"TH"' in public_view::text)>0 or position(my_id in public_view::text)=0 then raise exception 'Project read broadened selected-user country scope';end if;
 begin perform public.read_store_projects(t,'selected-'||a,true);raise exception 'Ordinary admin read accepted';exception when others then if sqlerrm<>'STORE_PROJECT_ACCESS_DENIED' then raise;end if;end;
 begin perform public.save_store_project(t,'delegate-'||a,project_uuid,spec,v,gen_random_uuid());raise exception 'Delegate grouped stores';exception when others then if sqlerrm<>'STORE_PROJECT_ACCESS_DENIED' then raise;end if;end;
 begin perform public.save_store_project(t,'inactive-'||a,project_uuid,spec,v,gen_random_uuid());raise exception 'Inactive admin grouped stores';exception when others then if sqlerrm<>'STORE_PROJECT_ACCESS_DENIED' then raise;end if;end;
 begin perform public.save_store_project('foreign-'||t,a,null,spec,0,gen_random_uuid());raise exception 'Foreign actor grouped stores';exception when others then if sqlerrm<>'STORE_PROJECT_ACCESS_DENIED' then raise;end if;end;
 candidate:=jsonb_build_object('name','Foreign scope attempt','markets',jsonb_build_array(jsonb_build_object('market','MY','enabled',true,'storeIds',jsonb_build_array(prefix||'-foreign'))),'newStores','[]'::jsonb);
 begin perform public.save_store_project(t,a,null,candidate,0,gen_random_uuid());raise exception 'Foreign Store grouped';exception when others then if sqlerrm<>'STORE_PROJECT_STORE_SCOPE' then raise;end if;end;
 candidate:=jsonb_build_object('name','Move attempt','markets',jsonb_build_array(jsonb_build_object('market','SG','enabled',true,'storeIds',jsonb_build_array(sg_id))),'newStores','[]'::jsonb);
 begin perform public.save_store_project(t,a,null,candidate,0,gen_random_uuid());raise exception 'Store moved to competing Project';exception when others then if sqlerrm<>'STORE_PROJECT_STORE_ALREADY_GROUPED' then raise;end if;end;
 candidate:=jsonb_set(spec,'{markets,0,storeIds}',jsonb_build_array(my_id));
 begin perform public.save_store_project(t,a,project_uuid,candidate,v,gen_random_uuid());raise exception 'Existing membership removed';exception when others then if sqlerrm<>'STORE_PROJECT_MEMBERS_REQUIRED' then raise;end if;end;
 candidate:=jsonb_set(spec,'{markets,1,enabled}','false');
 begin perform public.save_store_project(t,a,project_uuid,candidate,v,gen_random_uuid());raise exception 'Active country disabled without confirmation';exception when others then if sqlerrm<>'STORE_PROJECT_STATUS_CONFIRMATION_REQUIRED' then raise;end if;end;
 perform public.set_store_service_status(t,a,sg_id,'inactive',0,gen_random_uuid());
 answer:=public.save_store_project(t,a,project_uuid,candidate,v,gen_random_uuid());v:=(answer->>'version')::bigint;spec:=candidate;
 public_view:=public.read_store_projects(t,a,false);
 if not(public_view->'excludedStoreIds'?sg_id) or position(sg_id in (public_view->'projects')::text)>0 then raise exception 'Disabled country reappeared as selector fallback';end if;
 if (select s.project_id from public.stores s where s.tenant_id=t and s.id=sg_id) is distinct from project_uuid then raise exception 'Country stop removed membership history';end if;
 -- Re-activation alone neither enables the Project country nor regrants old users.
 perform public.set_store_service_status(t,a,sg_id,'active',1,gen_random_uuid());
 if sg_id=any(public.permission_effective_stores(t,u-2)) or not(public.read_store_projects(t,a,false)->'excludedStoreIds'?sg_id) then raise exception 'Country activation implicitly restored access/configuration';end if;
 -- Two newly entered storefronts and their distinct Account settings save in the same outer transaction.
 setup:=jsonb_build_object('version',2,'legalEntity','Synthetic Platform','billingEntity','Synthetic Billing','effectiveMonth',to_char(now() at time zone 'Asia/Kuala_Lumpur','YYYY-MM'),'clientType','External','rateCard',null,'feeRule',rule,'inputCurrency','THB','billingCurrency','MYR','fxPolicy','bnm-service-average');
 new_th:=jsonb_build_object('id',prefix||'-th','name','Synthetic TH '||prefix,'sourceName','Synthetic TH '||prefix,'market','TH','setup',setup,'details',details,'requestId',gen_random_uuid());
 new_ph:=jsonb_build_object('id',prefix||'-ph','name','Synthetic PH '||prefix,'sourceName','Synthetic PH '||prefix,'market','PH','setup',setup||jsonb_build_object('inputCurrency','PHP','feeRule',jsonb_set(rule,'{fixedAmount}','"29.99"')),'details',details,'requestId',gen_random_uuid());
 -- The explicit subsequent Save re-enables SG after its separate lifecycle confirmation.
 candidate:=jsonb_set(spec,'{markets,1,enabled}','true');
 candidate:=jsonb_set(candidate,'{markets,2,storeIds}',jsonb_build_array(prefix||'-th'));
 candidate:=jsonb_set(candidate,'{markets}',(candidate->'markets')||jsonb_build_array(jsonb_build_object('market','PH','enabled',true,'storeIds',jsonb_build_array(prefix||'-ph'))));
 candidate:=jsonb_set(candidate,'{newStores}',jsonb_build_array(new_th,new_ph));
 -- Direct service calls must reject malformed/mismatched new storefront data as well as the API.
 begin perform public.save_store_project(t,a,project_uuid,jsonb_set(candidate,'{newStores,0,setup}','null'),v,gen_random_uuid());raise exception 'NULL country setup accepted';exception when others then if sqlerrm<>'STORE_PROJECT_INVALID' then raise;end if;end;
 begin perform public.save_store_project(t,a,project_uuid,jsonb_set(candidate,'{newStores,0,market}','"PH"'),v,gen_random_uuid());raise exception 'Wrong country storefront accepted';exception when others then if sqlerrm<>'STORE_PROJECT_INVALID' then raise;end if;end;
 begin perform public.save_store_project(t,a,project_uuid,jsonb_set(candidate,'{newStores,0,name}','null'),v,gen_random_uuid());raise exception 'NULL country name accepted';exception when others then if sqlerrm<>'STORE_PROJECT_INVALID' then raise;end if;end;
 begin perform public.save_store_project(t,a,project_uuid,jsonb_set(candidate,'{newStores,0,setup,inputCurrency}','"SGD"'),v,gen_random_uuid());raise exception 'Wrong source currency accepted';exception when others then if sqlerrm<>'STORE_SETUP_INVALID' then raise;end if;end;
 select count(*) into rows_before from public.stores where tenant_id=t;select count(*) into units_before from public.account_billing_unit_versions where tenant_id=t;
 select count(*) into audit_before from public.account_audit_log where tenant_id=t;select count(*) into requests_before from public.account_store_requests where tenant_id=t;
 select to_jsonb(p) into project_before from public.store_projects p where p.id=project_uuid;
 begin perform public.save_store_project(t,a,project_uuid,jsonb_set(candidate,'{newStores,1,details,projectLinks}','"invalid"'),v,gen_random_uuid());raise exception 'Late country setup failure accepted';exception when others then if sqlerrm<>'STORE_DETAILS_INVALID' then raise;end if;end;
 if (select count(*) from public.stores where tenant_id=t)<>rows_before or (select count(*) from public.account_billing_unit_versions where tenant_id=t)<>units_before or (select count(*) from public.account_audit_log where tenant_id=t)<>audit_before or (select count(*) from public.account_store_requests where tenant_id=t)<>requests_before or (select to_jsonb(p) from public.store_projects p where p.id=project_uuid) is distinct from project_before then raise exception 'Late failure left partial Project/Store/Account/audit/request';end if;
 req:=gen_random_uuid();answer:=public.save_store_project(t,a,project_uuid,candidate,v,req);v:=(answer->>'version')::bigint;
 if (select count(*) from public.stores where tenant_id=t and project_id=project_uuid)<>5 or (select count(*) from public.account_billing_unit_versions where tenant_id=t)<>2 then raise exception 'Atomic country creation incomplete';end if;
 if not exists(select 1 from public.account_billing_unit_versions where tenant_id=t and store_id=prefix||'-th' and input_currency='THB' and fx_policy='bnm-service-average' and fee_rule->>'fixedAmount'='19.99') or not exists(select 1 from public.account_billing_unit_versions where tenant_id=t and store_id=prefix||'-ph' and input_currency='PHP' and fee_rule->>'fixedAmount'='29.99') then raise exception 'Per-country fee/FX settings leaked or changed';end if;
 if prefix||'-th'=any(public.permission_effective_stores(t,u-2)) or prefix||'-ph'=any(public.permission_effective_stores(t,u-2)) or exists(select 1 from public.user_store_access where user_id in(u-1,u-2,u-3) and store_id in(prefix||'-th',prefix||'-ph')) then raise exception 'New country automatically granted ordinary access';end if;
 again:=public.save_store_project(t,a,project_uuid,candidate,v-1,req);if answer is distinct from again or (select count(*) from public.account_billing_unit_versions where tenant_id=t)<>2 then raise exception 'New country replay duplicated setup';end if;
 foreach ledger_table in array array['account_assessments','account_invoices','account_receipts'] loop
  if to_regclass('public.'||ledger_table) is not null then
   execute format('select exists(select 1 from public.%I where tenant_id=$1)',ledger_table) into has_facts using t;
   if has_facts then raise exception 'Project/country setup fabricated financial facts';end if;
  end if;
 end loop;
 if has_table_privilege('service_role','public.store_projects','DELETE') or has_table_privilege('service_role','public.store_projects','TRUNCATE') or has_function_privilege('authenticated','public.save_store_project(text,text,uuid,jsonb,bigint,uuid)','EXECUTE') or has_function_privilege('anon','public.read_store_projects(text,text,boolean)','EXECUTE') then raise exception 'Project ACL widened';end if;
end $$;
reset role;
rollback;
