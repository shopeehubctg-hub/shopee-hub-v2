-- Non-destructive verification: fixture records exist only inside this transaction.
-- ROLLBACK restores the original database; no DELETE or archive actions are tested.
begin;
insert into public.customer_users(email,tenant_id,role,active) values('qa-account-activation@example.invalid','test-staging','superadmin',true);
set local role service_role;
do $$
declare tenant text:='test-staging';actor text:='qa-account-activation@example.invalid';m date:=date_trunc('month',now() at time zone 'Asia/Kuala_Lumpur')::date;
 rule jsonb:='{"type":"tiers","currency":"MYR","basis":"custom","basisLabel":"Shopee Sales","tiers":[{"from":"0.00","percent":"4"},{"from":"10000.00","percent":"3.5"},{"from":"200000.00","percent":"2","cap":"4000.00"}]}'::jsonb;
 card jsonb;setup jsonb;details jsonb:='{"projectLinks":[],"adsTopUpOwner":"Client","storeGroupLink":"https://example.invalid/group","googleDriveLink":"https://example.invalid/drive"}'::jsonb;
 market text;store_key text;src text;policy text;req uuid;r jsonb;prior jsonb;n integer;units jsonb;checks integer:=0;
begin
 if has_function_privilege('anon','public.account_create_store_with_setup_v2(text,text,text,text,text,text,jsonb,jsonb,uuid)','EXECUTE') or has_function_privilege('authenticated','public.account_save_rate_card(text,text,jsonb,bigint,uuid)','EXECUTE') then raise exception 'Public RPC access';end if;checks:=checks+1;
 if public.account_fee_rule_valid('{"type":"percent","basis":"net_gmv","percent":"3"}',null) then raise exception 'Missing currency accepted';end if;checks:=checks+1;
 begin perform public.account_save_rate_card(tenant,'foreign@example.invalid','{}',0,gen_random_uuid());raise exception 'Unauthorized call accepted';exception when others then if SQLERRM<>'ACCOUNT_ACCESS_DENIED' then raise;end if;end;checks:=checks+1;
 card:=jsonb_build_object('id','qa-card','name','QA Internal','clientType','Internal','currency','MYR','effectiveMonth',to_char(m,'YYYY-MM'),'rule',rule);
 req:=gen_random_uuid();r:=public.account_save_rate_card(tenant,actor,card,0,req);
 if r->>'version'<>'1' or public.account_save_rate_card(tenant,actor,card,0,req) is distinct from r then raise exception 'Card replay failed';end if;checks:=checks+1;
 begin perform public.account_save_rate_card(tenant,actor,card||'{"name":"Changed"}',0,req);raise exception 'Altered request accepted';exception when others then if SQLERRM<>'ACCOUNT_REQUEST_CONFLICT' then raise;end if;end;checks:=checks+1;
 foreach market in array array['MY','SG','TH','PH'] loop
  store_key:='shopee-qa-activation-'||lower(market);src:=case market when 'MY' then 'MYR' when 'SG' then 'SGD' when 'TH' then 'THB' else 'PHP' end;policy:=case market when 'MY' then 'none' when 'SG' then 'fixed' else 'bnm-service-average' end;
  setup:=jsonb_build_object('version',2,'legalEntity','QA Company','effectiveMonth',to_char(m,'YYYY-MM'),'clientType','Internal','rateCard',jsonb_build_object('id','qa-card','version',1),'feeRule',rule,'inputCurrency',src,'billingCurrency','MYR','fxPolicy',policy)||case when market='SG' then '{"fxRate":"3.2"}'::jsonb else '{}'::jsonb end;
  req:=gen_random_uuid();r:=public.account_create_store_with_setup_v2(tenant,actor,store_key,'QA Store '||market,'QA Source '||market,market,setup,details,req);
  if r->>'version'<>'1' or public.account_create_store_with_setup_v2(tenant,actor,store_key,'QA Store '||market,'QA Source '||market,market,setup,details,req) is distinct from r then raise exception 'Store replay failed %',market;end if;
  if not exists(select 1 from public.account_billing_unit_versions where tenant_id=tenant and roster_key='store:'||store_key and currency='MYR' and input_currency=src and client_type='Internal' and rate_card->>'id'='qa-card' and (rate_card->>'version')::integer=1 and fee_rule=rule and fx_policy=policy) then raise exception 'Setup metadata missing %',market;end if;checks:=checks+1;
 end loop;
 -- Invalid directory input fails after attempted store insertion, proving whole-call rollback.
 begin perform public.account_create_store_with_setup_v2(tenant,actor,'shopee-qa-invalid','QA Invalid','QA Invalid','PH',setup,'{"projectLinks":"invalid"}',gen_random_uuid());raise exception 'Invalid details accepted';exception when others then if SQLERRM<>'STORE_DETAILS_INVALID' then raise;end if;end;
 if exists(select 1 from public.stores where id='shopee-qa-invalid') then raise exception 'Partial store committed';end if;checks:=checks+1;
 r:=public.account_update_store_with_setup_v2(tenant,actor,'shopee-qa-activation-th','QA Store TH renamed','QA Source TH','TH',jsonb_build_object('version',2,'legalEntity','QA Company Next','effectiveMonth',to_char(m+interval '1 month','YYYY-MM')),details,gen_random_uuid(),'store:shopee-qa-activation-th',1);
 if r->>'version'<>'2' or not exists(select 1 from public.account_billing_unit_versions where tenant_id=tenant and roster_key='store:shopee-qa-activation-th' and version=1 and legal_entity='QA Company') or not exists(select 1 from public.account_billing_unit_versions where tenant_id=tenant and roster_key='store:shopee-qa-activation-th' and version=2 and legal_entity='QA Company Next' and fee_rule=rule and fx_policy='bnm-service-average') then raise exception 'Company history lost';end if;checks:=checks+1;
 units:=jsonb_build_array(jsonb_build_object('rosterKey','store:shopee-qa-activation-ph','project','QA Store PH','legalEntity','QA Company','currency','MYR','storeId','shopee-qa-activation-ph','market','PH','inputCurrency','PHP','fxPolicy','bnm-service-average','expectedVersion','1'),jsonb_build_object('rosterKey','store:shopee-qa-activation-my','project','QA Store MY','legalEntity','QA Company','currency','MYR','storeId','shopee-qa-activation-my','market','MY','inputCurrency','MYR','fxPolicy','none','expectedVersion','9'));
 begin perform public.account_assign_rate_card(tenant,actor,units,'qa-card',1,m,gen_random_uuid());raise exception 'Partial invalid batch accepted';exception when others then if SQLERRM<>'ACCOUNT_VERSION_CONFLICT' then raise;end if;end;
 if exists(select 1 from public.account_billing_unit_versions where tenant_id=tenant and roster_key='store:shopee-qa-activation-ph' and version>1) then raise exception 'Batch partially committed';end if;checks:=checks+1;
 units:=jsonb_set(units,'{1,expectedVersion}','"1"');req:=gen_random_uuid();r:=public.account_assign_rate_card(tenant,actor,units,'qa-card',1,m,req);
 if r#>>'{versions,store:shopee-qa-activation-ph}'<>'2' or public.account_assign_rate_card(tenant,actor,units,'qa-card',1,m,req) is distinct from r then raise exception 'Bulk save/replay failed';end if;checks:=checks+1;
 begin perform public.account_create_store_with_setup_v2(tenant,actor,'shopee-qa-tampered','QA Tampered','QA Tampered','PH',jsonb_set(setup,'{feeRule,tiers,0,percent}','"1"'),details,gen_random_uuid());raise exception 'Tampered rate accepted';exception when others then if SQLERRM<>'ACCOUNT_VERSION_CONFLICT' then raise;end if;end;checks:=checks+1;
 details:=jsonb_set(details,'{projectLinks}','[{"project":"QA Project","href":"https://example.invalid/project"}]');
 r:=public.account_create_store_with_setup_v2(tenant,actor,'shopee-qa-linked','QA Linked','QA Linked','PH',setup,details,gen_random_uuid());
 if not exists(select 1 from public.link_directory_projects where store_id='shopee-qa-linked' and project_name='QA Project') then raise exception 'Project link missing';end if;checks:=checks+1;
 begin perform public.account_update_store_with_setup_v2(tenant,actor,'shopee-qa-linked','QA Linked','QA Linked','PH',null,jsonb_set(details,'{projectLinks}','[]'),gen_random_uuid(),null,null);raise exception 'Unapproved link removal accepted';exception when others then if SQLERRM<>'STORE_LINK_REMOVAL_REQUIRES_APPROVAL' then raise;end if;end;
 if not exists(select 1 from public.link_directory_projects where store_id='shopee-qa-linked' and project_name='QA Project') then raise exception 'Existing link lost';end if;checks:=checks+1;
 if (select count(*) from public.account_rate_card_versions where tenant_id=tenant and card_id='qa-card')<>1 then raise exception 'Duplicate card version';end if;
 raise notice 'PASS: % database scenarios; Store/Account atomicity, all4markets, replay, tamper rejection, month history, bulk rollback, server-only grants.',checks;
end $$;
reset role;
select 'PASS: Store Account persistence verification. Transaction rolled back.' as result;
rollback;
