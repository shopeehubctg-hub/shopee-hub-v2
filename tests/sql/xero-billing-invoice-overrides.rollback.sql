-- Independent Staging, after the mapping migration. Every fixture is rolled back.
-- No real source data, token, user credential, source call or DELETE is used.
begin;
do $$
declare suffix text:=replace(gen_random_uuid()::text,'-','');t text;email text;u bigint;s text;c uuid:=gen_random_uuid();r uuid:=gen_random_uuid();old_r uuid:=gen_random_uuid();cat uuid:=gen_random_uuid();opt uuid:=gen_random_uuid();scope jsonb;row1 jsonb;row2 jsonb;row3 jsonb;pending_row jsonb;snapshot jsonb;unit_key text:='roster-2026-10-my-990001';store_a text;store_b text;foreign_t text;foreign_store text;
begin
 t:='xero-invoice-test-'||suffix;email:='xero-invoice-'||suffix||'@example.invalid';s:=encode(sha256(convert_to(suffix,'UTF8')),'hex');foreign_t:='foreign-'||t;
 store_a:='shopee-map-'||suffix||'-a';store_b:='shopee-map-'||suffix||'-b';foreign_store:='shopee-map-'||suffix||'-foreign';
 perform set_config('xero_inv.tenant',t,true);perform set_config('xero_inv.actor',email,true);perform set_config('xero_inv.session',s,true);perform set_config('xero_inv.connection',c::text,true);perform set_config('xero_inv.run',r::text,true);perform set_config('xero_inv.old_run',old_r::text,true);perform set_config('xero_inv.category',cat::text,true);perform set_config('xero_inv.option',opt::text,true);perform set_config('xero_inv.store_a',store_a,true);perform set_config('xero_inv.store_b',store_b,true);perform set_config('xero_inv.foreign_store',foreign_store,true);
 insert into public.tenants(id,name,active) values(t,'Synthetic Xero mapping test',true),(foreign_t,'Synthetic foreign mapping test',true);
 u:=-abs(('x'||left(suffix,12))::bit(48)::bigint)-20000000;
 insert into public.customer_users(id,email,tenant_id,role,active) values(u,email,t,'superadmin',true);
 insert into account_security.portal_auth_sessions(session_digest,tenant_id,user_id,request_id,auth_method,expires_at) values(decode(s,'hex'),t,u,gen_random_uuid(),'password',now()+interval '1 hour');
 insert into public.stores(id,tenant_id,name,platform,bigseller_name) values(store_a,t,'Synthetic A','Shopee MY','Synthetic A'),(store_b,t,'Synthetic B','Shopee MY','Synthetic B'),(foreign_store,foreign_t,'Synthetic foreign','Shopee MY','Synthetic foreign');
 scope:=jsonb_build_object('categoryId',cat,'options',jsonb_build_array(jsonb_build_object('id',opt,'project','Shopee Hub'),jsonb_build_object('id',gen_random_uuid(),'project','Shopee Hub Internal'),jsonb_build_object('id',gen_random_uuid(),'project','Tik Tok Hub'),jsonb_build_object('id',gen_random_uuid(),'project','Lazada Hub')));
 insert into public.xero_connections(id,tenant_id,environment,external_connection_id,organisation_id,organisation_name,created_by,project_scope) values(c,t,'staging',gen_random_uuid(),gen_random_uuid(),'Synthetic mapping source',email,scope);
 row1:=jsonb_build_object('invoiceId','00000000-0000-0000-0000-000000000011','invoiceNumber','SYNTHETIC-1','contactId','00000000-0000-0000-0000-000000000001','currency','MYR','state','eligible','reason',null,'project','Shopee Hub','subtotal','100.00','tax','0.00','gross','100.00','amountPaid','20.00','amountDue','80.00','amountCredited','0.00','cashReceived',null,'date','2026-10-01','dueDate',null);
 row2:=row1||jsonb_build_object('invoiceId','00000000-0000-0000-0000-000000000012','invoiceNumber','SYNTHETIC-2');
 row3:=row1||jsonb_build_object('invoiceId','00000000-0000-0000-0000-000000000013','invoiceNumber','SYNTHETIC-3','contactId','00000000-0000-0000-0000-000000000002');
 pending_row:=jsonb_build_object('invoiceId','00000000-0000-0000-0000-000000000014','invoiceNumber','SYNTHETIC-MIXED','contactId',row1->'contactId','currency','MYR','state','pending','reason','mixed_projects','project',null);
 snapshot:=jsonb_build_object('month','2026-10','today','2026-11-01','scope',scope,'report',jsonb_build_object('rows',jsonb_build_array(row1,row2,row3,pending_row),'totals',jsonb_build_array(jsonb_build_object('currency','MYR','gross','300.00','tax','0.00','amountPaid','60.00','amountDue','240.00','amountCredited','0.00','cashReceived',null)),'month','2026-10','today','2026-11-01','payments','[]'::jsonb,'invoiceCount',3,'pendingCount',1,'collections',jsonb_build_array(jsonb_build_object('currency','MYR','monthCollected','0.00','todayCollected','0.00')),'outstanding',jsonb_build_array(jsonb_build_object('currency','MYR','amountDue','240.00')),'invoices',jsonb_build_array(row1||jsonb_build_object('xeroUrl','https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID='||(row1->>'invoiceId')),row2||jsonb_build_object('xeroUrl','https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID='||(row2->>'invoiceId')),row3||jsonb_build_object('xeroUrl','https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID='||(row3->>'invoiceId')),pending_row||jsonb_build_object('xeroUrl','https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID='||(pending_row->>'invoiceId')))),
 'companies',jsonb_build_array(jsonb_build_object('contactId',row1->'contactId','companyName','Synthetic Company 1','categoryId',cat,'optionId',opt,'project','Shopee Hub'),jsonb_build_object('contactId',row3->'contactId','companyName','Synthetic Company 2','categoryId',cat,'optionId',opt,'project','Shopee Hub')));
 insert into public.xero_sync_runs(id,tenant_id,connection_id,request_id,actor_email,status,lease_id,lease_until,credential_epoch,completed_at) values(r,t,c,gen_random_uuid(),email,'succeeded',gen_random_uuid(),now()+interval '15 minutes',1,clock_timestamp()),(old_r,t,c,gen_random_uuid(),email,'succeeded',gen_random_uuid(),now()+interval '15 minutes',1,clock_timestamp()-interval '1 minute');
 insert into public.xero_sync_snapshots(run_id,tenant_id,connection_id,snapshot,created_at) values(old_r,t,c,snapshot-'companies',clock_timestamp()-interval '1 minute'),(r,t,c,snapshot,clock_timestamp());
 -- Future commercial setup must remain untouched when adding the historical identity anchor.
 insert into public.account_billing_unit_versions(tenant_id,roster_key,roster_project,legal_entity,currency,store_id,effective_month,version,change_action,fee_rule,actor_email,request_id,request_payload,market,input_currency)
 values(t,unit_key,'Future client','Future company','MYR',store_a,'2026-11-01',1,'setup','{"type":"fixed","currency":"MYR","basis":"fixed_monthly","fixedAmount":"99.00"}'::jsonb,email,gen_random_uuid(),'{}','MY','MYR');
end $$;
set local role service_role;
do $$
declare ledger_table text;has_facts boolean;t text:=current_setting('xero_inv.tenant');a text:=current_setting('xero_inv.actor');s text:=current_setting('xero_inv.session');r uuid:=current_setting('xero_inv.run')::uuid;cat text:=current_setting('xero_inv.category');opt text:=current_setting('xero_inv.option');
 seed_a jsonb:=jsonb_build_object('project','Original audited client','entity','Original audited company','currency','MYR','market','MY','storeId',current_setting('xero_inv.store_a'));
 seed_b jsonb:=jsonb_build_object('project','Second audited client','entity','Second audited company','currency','MYR','market','MY','storeId',current_setting('xero_inv.store_b'));
 group_binding jsonb;first_invoice jsonb;second_invoice jsonb;bindings jsonb;bad jsonb;answer jsonb;again jsonb;group_req uuid:=gen_random_uuid();override_req uuid:=gen_random_uuid();mapping_before bigint;unit_before bigint;audit_before bigint;request_before bigint;
begin
 if has_table_privilege('service_role','public.account_xero_mapping_versions','update') or has_table_privilege('service_role','public.account_xero_mapping_versions','delete') then raise exception 'Mapping no longer append-only';end if;
 group_binding:=jsonb_build_object('contactId','00000000-0000-0000-0000-000000000001','categoryId',cat,'optionId',opt,'rosterKey','roster-2026-10-my-990001','expectedVersion','0','targetExpectedVersion','1','targetSeed',seed_a);
 answer:=public.xero_billing_mappings_save(t,a,s,'staging',r,'2026-10-01',jsonb_build_array(group_binding),group_req);
 if answer->'mappings'->0->'invoiceId'<>'null'::jsonb or answer->'mappings'->0->>'version'<>'1' then raise exception 'Legacy group scope incompatible';end if;
 first_invoice:=group_binding||jsonb_build_object('invoiceId','00000000-0000-0000-0000-000000000011','expectedVersion','1','targetExpectedVersion','2');
 second_invoice:=first_invoice||jsonb_build_object('invoiceId','00000000-0000-0000-0000-000000000012','rosterKey','roster-2026-10-my-990002','targetExpectedVersion','0','targetSeed',seed_b);
 -- A source identity existing in the snapshot does not authorize another contact's invoice or a mixed/pending invoice.
 for bad in select jsonb_build_array(first_invoice||jsonb_build_object('invoiceId',v)) from (values('00000000-0000-0000-0000-000000000013'),('00000000-0000-0000-0000-000000000014'),('00000000-0000-0000-0000-000000000099')) x(v) loop
  begin perform public.xero_billing_mappings_save(t,a,s,'staging',r,'2026-10-01',bad,gen_random_uuid());raise exception 'Unobserved/wrong-contact/pending invoice accepted';exception when others then if sqlerrm<>'XERO_MAPPING_INVOICE_DENIED' then raise;end if;end;
 end loop;
 begin perform public.xero_billing_mappings_save(t,a,s,'staging',r,'2026-10-01',jsonb_build_array(first_invoice,first_invoice),gen_random_uuid());raise exception 'Duplicate invoice binding accepted';exception when others then if sqlerrm<>'XERO_MAPPING_DUPLICATE' then raise;end if;end;
 select count(*) into mapping_before from public.account_xero_mapping_versions where tenant_id=t;select count(*) into unit_before from public.account_billing_unit_versions where tenant_id=t;select count(*) into audit_before from public.account_audit_log where tenant_id=t;select count(*) into request_before from public.account_store_requests where tenant_id=t;
 bad:=jsonb_build_array(first_invoice||jsonb_build_object('rosterKey','roster-2026-10-my-990002','targetExpectedVersion','0','targetSeed',seed_b),second_invoice||jsonb_build_object('expectedVersion','0'));
 begin perform public.xero_billing_mappings_save(t,a,s,'staging',r,'2026-10-01',bad,gen_random_uuid());raise exception 'Inconsistent shared baseline accepted';exception when others then if sqlerrm<>'XERO_MAPPING_VERSION_CONFLICT' then raise;end if;end;
 if (select count(*) from public.account_xero_mapping_versions where tenant_id=t)<>mapping_before or (select count(*) from public.account_billing_unit_versions where tenant_id=t)<>unit_before or (select count(*) from public.account_audit_log where tenant_id=t)<>audit_before or (select count(*) from public.account_store_requests where tenant_id=t)<>request_before then raise exception 'Failed second invoice left partial writes';end if;
 bindings:=jsonb_build_array(first_invoice,second_invoice);
 answer:=public.xero_billing_mappings_save(t,a,s,'staging',r,'2026-10-01',bindings,override_req);
 if jsonb_array_length(answer->'mappings')<>2 or answer->'mappings'->0->>'version'<>'2' or answer->'mappings'->1->>'version'<>'3' then raise exception 'Two invoice scopes did not share one global baseline/version sequence';end if;
 if not exists(select 1 from public.account_xero_mapping_versions where tenant_id=t and source_invoice_id='00000000-0000-0000-0000-000000000011' and target_roster_key='roster-2026-10-my-990001' and version=2) or not exists(select 1 from public.account_xero_mapping_versions where tenant_id=t and source_invoice_id='00000000-0000-0000-0000-000000000012' and target_roster_key='roster-2026-10-my-990002' and version=3) then raise exception 'Invoice targets mixed or lost';end if;
 again:=public.xero_billing_mappings_save(t,a,s,'staging',r,'2026-10-01',bindings,override_req);if again is distinct from answer then raise exception 'Invoice replay changed';end if;
 if (select count(*) from public.account_xero_mapping_versions where tenant_id=t)<>3 then raise exception 'Invoice replay duplicated history';end if;
 begin perform public.xero_billing_mappings_save(t,a,s,'staging',r,'2026-10-01',bindings,gen_random_uuid());raise exception 'Stale global baseline accepted';exception when others then if sqlerrm<>'XERO_MAPPING_VERSION_CONFLICT' then raise;end if;end;
 -- A later group default remains a group record; it never rewrites the existing invoice override.
 group_binding:=group_binding||jsonb_build_object('expectedVersion','3','rosterKey','roster-2026-10-my-990002','targetExpectedVersion','1','targetSeed',seed_b);
 answer:=public.xero_billing_mappings_save(t,a,s,'staging',r,'2026-10-01',jsonb_build_array(group_binding),gen_random_uuid());
 if answer->'mappings'->0->>'version'<>'4' or answer->'mappings'->0->'invoiceId'<>'null'::jsonb then raise exception 'Group default lost independent scope';end if;
 first_invoice:=first_invoice||jsonb_build_object('expectedVersion','4','rosterKey','roster-2026-10-my-990002','targetExpectedVersion','1','targetSeed',seed_b);
 answer:=public.xero_billing_mappings_save(t,a,s,'staging',r,'2026-10-01',jsonb_build_array(first_invoice),gen_random_uuid());
 if answer->'mappings'->0->>'version'<>'5' then raise exception 'Global version no longer increments across scopes';end if;
 if not exists(select 1 from public.account_audit_log au join public.account_xero_mapping_versions m on m.id=au.record_id and m.tenant_id=au.tenant_id where m.tenant_id=t and m.version=5 and au.before_value->>'invoiceId'='00000000-0000-0000-0000-000000000011' and au.before_value->>'version'='2') then raise exception 'Invoice audit before-state used a different scope';end if;
 answer:=public.xero_billing_mappings_read(t,a,s,'staging','2026-10-01');
 if jsonb_array_length(answer->'mappings')<>5 or (select count(*) from jsonb_array_elements(answer->'mappings') m where m->'invoiceId'='null'::jsonb)<>2 then raise exception 'Read lost legacy/group or invoice history';end if;
 if not exists(select 1 from public.account_billing_unit_versions where tenant_id=t and roster_key='roster-2026-10-my-990001' and version=1 and effective_month='2026-11-01' and fee_rule->>'fixedAmount'='99.00') then raise exception 'Commercial setup changed';end if;
 -- Optional legacy income ledger remains absent in Production; do not create it for this test.
 foreach ledger_table in array array['account_invoices','account_receipts','account_assessments'] loop
  if to_regclass('public.'||ledger_table) is not null then
   execute format('select exists(select 1 from public.%I where tenant_id=$1)',ledger_table) into has_facts using t;
   if has_facts then raise exception 'Invoice mapping created financial facts';end if;
  end if;
 end loop;
end $$;
reset role;
rollback;
