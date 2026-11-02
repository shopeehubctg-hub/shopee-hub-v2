-- Independent Stage only. All synthetic fixtures and changes are rolled back.
begin;
do $$
declare suffix text:=replace(gen_random_uuid()::text,'-','');t text;a text;u bigint;sid text;
begin
 t:='registered-names-'||suffix;a:='registered-'||suffix||'@example.invalid';sid:='shopee-names-'||suffix;
 perform set_config('names.tenant',t,true);perform set_config('names.actor',a,true);perform set_config('names.store',sid,true);
 insert into public.tenants(id,name,active) values(t,'Synthetic names test',true),('foreign-'||t,'Foreign synthetic',true);
 u:=-abs(('x'||left(suffix,12))::bit(48)::bigint)-30000000;
 insert into public.customer_users(id,email,tenant_id,role,active) values(u,a,t,'superadmin',true),(u-1,'ordinary-'||a,t,'customer',true);
 insert into public.stores(id,tenant_id,name,platform,bigseller_name) values(sid,t,'Synthetic names store','Shopee MY','Synthetic names store'),(sid||'-foreign','foreign-'||t,'Foreign names','Shopee MY','Foreign names');
end $$;
set local role service_role;
do $$
declare t text:=current_setting('names.tenant');a text:=current_setting('names.actor');sid text:=current_setting('names.store');unit text:='store:'||current_setting('names.store');month date:=date_trunc('month',now() at time zone 'Asia/Kuala_Lumpur')::date;future date;req uuid:=gen_random_uuid();answer jsonb;again jsonb;rule jsonb:='{"type":"fixed","currency":"MYR","basis":"fixed_monthly","fixedAmount":"99.00"}';setup jsonb;details jsonb:='{"projectLinks":[],"storeGroupLink":"","googleDriveLink":"","adsTopUpOwner":null}';n bigint;audit_n bigint;request_n bigint;row_v public.account_billing_unit_versions;new_store text;created jsonb;
begin
 future:=(month+interval '2 months')::date;
 if not public.account_registered_names_available() then raise exception 'Names capability missing';end if;
 if has_function_privilege('anon','public.account_save_registered_names(text,text,text,text,text,text,text,date,text,bigint,uuid)','EXECUTE') or has_function_privilege('authenticated','public.account_registered_names_available()','EXECUTE') then raise exception 'Public names RPC grant';end if;
 if has_table_privilege('service_role','public.account_billing_unit_versions','UPDATE') or has_table_privilege('service_role','public.account_billing_unit_versions','DELETE') then raise exception 'Version history is mutable';end if;
 -- First explicit names save creates only an identity company version, never a fee rule.
 answer:=public.account_save_registered_names(t,a,unit,'Synthetic names store','Platform A','Billing A','MYR',month,sid,0,req);
 if answer->>'version'<>'1' or answer->>'billingEntity'<>'Billing A' then raise exception 'Initial pair not saved';end if;
 select * into row_v from public.account_billing_unit_versions where tenant_id=t and roster_key=unit and version=1;
 if row_v.legal_entity<>'Platform A' or row_v.billing_registered_name<>'Billing A' or row_v.fee_rule is not null or row_v.rate_card is not null then raise exception 'Names fabricated commercial setup';end if;
 select count(*) into audit_n from public.account_audit_log where tenant_id=t;
 again:=public.account_save_registered_names(t,a,unit,'Synthetic names store','Platform A','Billing A','MYR',month,sid,0,req);
 if answer is distinct from again or (select count(*) from public.account_audit_log where tenant_id=t)<>audit_n then raise exception 'Request replay duplicated history';end if;
 begin perform public.account_save_registered_names(t,a,unit,'Synthetic names store','Platform A','Changed billing','MYR',month,sid,0,req);raise exception 'Changed request replay accepted';exception when others then if sqlerrm<>'ACCOUNT_REQUEST_CONFLICT' then raise;end if;end;
 begin perform public.account_save_registered_names(t,a,unit,'Synthetic names store','Platform stale','Billing stale','MYR',month,sid,0,gen_random_uuid());raise exception 'Stale pair accepted';exception when others then if sqlerrm<>'ACCOUNT_VERSION_CONFLICT' then raise;end if;end;
 begin perform public.account_save_registered_names(t,a,unit,'Synthetic names store','Platform A','','MYR',month,sid,1,gen_random_uuid());raise exception 'Billing clear accepted';exception when others then if sqlerrm<>'ACCOUNT_INVALID' then raise;end if;end;
 -- Legacy company editor changes Platform but preserves Billing.
 perform public.account_save_billing_unit_version(t,a,unit,'Synthetic names store','Platform legacy','MYR',month,'company',null,null,1,gen_random_uuid());
 if not exists(select 1 from public.account_billing_unit_versions where tenant_id=t and roster_key=unit and version=2 and legal_entity='Platform legacy' and billing_registered_name='Billing A') then raise exception 'Legacy company lost Billing';end if;
 -- Scheduled Billing is not pulled backward by a later earlier-month fee/mapping append.
 perform public.account_save_registered_names(t,a,unit,'Synthetic names store','Platform future','Billing future','MYR',future,sid,2,gen_random_uuid());
 perform public.account_save_billing_unit_version(t,a,unit,'Synthetic names store','Platform stale from caller','MYR',month,'fee_rule',null,rule,3,gen_random_uuid());
 if not exists(select 1 from public.account_billing_unit_versions where tenant_id=t and roster_key=unit and version=4 and billing_registered_name='Billing A') then raise exception 'Earlier fee imported future Billing';end if;
 perform public.account_save_billing_unit_version(t,a,unit,'Synthetic names store','Platform stale','MYR',future,'mapping',sid,null,4,gen_random_uuid());
 if not exists(select 1 from public.account_billing_unit_versions where tenant_id=t and roster_key=unit and version=5 and billing_registered_name='Billing future') then raise exception 'Legacy mapping lost future Billing';end if;
 -- Null preserves the earlier-month name and rule, while both explicit names save atomically.
 answer:=public.account_save_registered_names(t,a,unit,'Synthetic names store','Platform B',null,'MYR',month,sid,5,gen_random_uuid());
 if answer->>'billingEntity'<>'Billing A' then raise exception 'NULL cleared Billing';end if;
 select * into row_v from public.account_billing_unit_versions where tenant_id=t and roster_key=unit and version=6;
 if row_v.fee_rule is distinct from rule or row_v.legal_entity<>'Platform B' then raise exception 'Pair changed rate';end if;
 -- Store company-only v2 patch accepts Billing and stays one version/transaction.
 setup:=jsonb_build_object('version',2,'legalEntity','Platform Store','billingEntity','Billing Store','effectiveMonth',to_char(month,'YYYY-MM'));
 perform public.account_update_store_with_setup_v2(t,a,sid,'Synthetic names store','Synthetic names store','MY',setup,details,gen_random_uuid(),unit,6);
 if not exists(select 1 from public.account_billing_unit_versions where tenant_id=t and roster_key=unit and version=7 and legal_entity='Platform Store' and billing_registered_name='Billing Store' and fee_rule=rule) then raise exception 'Store pair edit lost field or rate';end if;
 -- New Store full setup normalization/creation stores both names. Legacy omission starts unknown.
 setup:=jsonb_build_object('version',2,'legalEntity','New platform','billingEntity',' New billing ','effectiveMonth',to_char(month,'YYYY-MM'),'clientType','External','rateCard',null,'feeRule',rule,'inputCurrency','MYR','billingCurrency','MYR','fxPolicy','none');
 new_store:=sid||'-new';
 created:=public.account_create_store_with_setup_v2(t,a,new_store,'Synthetic new store','Synthetic new store','MY',setup,details,gen_random_uuid());
 if not exists(select 1 from public.account_billing_unit_versions where tenant_id=t and roster_key='store:'||new_store and legal_entity='New platform' and billing_registered_name='New billing') then raise exception 'New Store lost names';end if;
 new_store:=sid||'-legacy';
 perform public.account_create_store_with_setup_v2(t,a,new_store,'Synthetic legacy store','Synthetic legacy store','MY',setup-'billingEntity',details,gen_random_uuid());
 if not exists(select 1 from public.account_billing_unit_versions where tenant_id=t and roster_key='store:'||new_store and billing_registered_name is null) then raise exception 'Legacy Store invented Billing';end if;
 -- Direct identity-only anchor carry is bounded by month, never future evidence.
 insert into public.account_billing_unit_versions(tenant_id,roster_key,roster_project,legal_entity,currency,store_id,effective_month,version,change_action,actor_email,request_id,request_payload)
 values(t,unit,'Synthetic names store','Older anchor','MYR',sid,(month-interval '1 month')::date,8,'mapping',a,gen_random_uuid(),'{}');
 if not exists(select 1 from public.account_billing_unit_versions where tenant_id=t and roster_key=unit and version=8 and billing_registered_name is null) then raise exception 'Historical anchor imported future Billing';end if;
 -- Scope, role, immutable mapping and month checks.
 begin perform public.account_save_registered_names('foreign-'||t,a,unit,'Synthetic names store','Bad','Bad','MYR',month,sid,0,gen_random_uuid());raise exception 'Foreign actor accepted';exception when others then if sqlerrm<>'ACCOUNT_ACCESS_DENIED' then raise;end if;end;
 begin perform public.account_save_registered_names(t,'ordinary-'||a,unit,'Synthetic names store','Bad','Bad','MYR',month,sid,8,gen_random_uuid());raise exception 'Ordinary actor accepted';exception when others then if sqlerrm<>'ACCOUNT_ACCESS_DENIED' then raise;end if;end;
 begin perform public.account_save_registered_names(t,a,'store:'||sid||'-foreign','Foreign names','Bad','Bad','MYR',month,sid||'-foreign',0,gen_random_uuid());raise exception 'Foreign store accepted';exception when others then if sqlerrm<>'ACCOUNT_INVALID' then raise;end if;end;
 begin perform public.account_save_registered_names(t,a,unit,'Synthetic names store','Bad','Bad','MYR',(month-interval '1 month')::date,sid,8,gen_random_uuid());raise exception 'Historical rewrite accepted';exception when others then if sqlerrm<>'ACCOUNT_PAST_MONTH' then raise;end if;end;
 -- A late directory failure rolls both names and the store display-name update back.
 select count(*) into n from public.account_billing_unit_versions where tenant_id=t;select count(*) into audit_n from public.account_audit_log where tenant_id=t;select count(*) into request_n from public.account_store_requests where tenant_id=t;
 begin perform public.account_update_store_with_setup_v2(t,a,sid,'Names should rollback','Synthetic names store','MY',jsonb_build_object('version',2,'legalEntity','Should rollback','billingEntity','Should rollback','effectiveMonth',to_char(month,'YYYY-MM')),'{"projectLinks":"invalid"}',gen_random_uuid(),unit,8);raise exception 'Late failure accepted';exception when others then if sqlerrm<>'STORE_DETAILS_INVALID' then raise;end if;end;
 if (select count(*) from public.account_billing_unit_versions where tenant_id=t)<>n or (select count(*) from public.account_audit_log where tenant_id=t)<>audit_n or (select count(*) from public.account_store_requests where tenant_id=t)<>request_n or exists(select 1 from public.stores where id=sid and display_name='Names should rollback') then raise exception 'Late error left partial names/audit/store/request';end if;
 if exists(select 1 from public.account_assessments where tenant_id=t) or exists(select 1 from public.account_invoices where tenant_id=t) or exists(select 1 from public.account_receipts where tenant_id=t) then raise exception 'Names created ledger facts';end if;
end $$;
reset role;
rollback;
