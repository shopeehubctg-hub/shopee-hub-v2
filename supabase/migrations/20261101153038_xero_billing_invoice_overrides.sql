-- Independent Staging extension: retain the global source-group version sequence.
-- No constraint replacement, record rewrite, removal, ledger write or new entity.
begin;
alter table public.account_xero_mapping_versions add column source_invoice_id uuid;
-- Existing source-group/version indexes bound this lookup; no redundant per-invoice index is needed.

create or replace function public.xero_billing_mappings_read(p_tenant text,p_actor text,p_session_digest text,p_environment text,p_invoice_month date,p_stepup_digest text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare answer jsonb;
begin
 perform xero_private.assert_actor(p_tenant,p_actor,p_session_digest,p_stepup_digest);
 if p_invoice_month is null or extract(day from p_invoice_month)<>1 then raise exception 'XERO_MAPPING_INVALID';end if;
 if (select count(*) from public.account_xero_mapping_versions m join public.xero_connections c on c.tenant_id=m.tenant_id and c.id=m.connection_id where c.tenant_id=p_tenant and c.environment=p_environment)>10000 then raise exception 'XERO_MAPPING_LIMIT';end if;
 -- One source read snapshot: requested-month data and mapping history cannot come from different runs.
 with c as(select * from public.xero_connections where tenant_id=p_tenant and environment=p_environment),
 source as(select ss.snapshot,r.id,r.completed_at from public.xero_sync_snapshots ss join public.xero_sync_runs r on r.tenant_id=ss.tenant_id and r.id=ss.run_id and r.connection_id=ss.connection_id join c on c.tenant_id=ss.tenant_id and c.id=ss.connection_id where r.status='succeeded' and ss.snapshot->>'month'=to_char(p_invoice_month,'YYYY-MM') order by ss.created_at desc,ss.run_id desc limit 1)
 select jsonb_build_object('sourceRunId',(select id from source),'lastSyncedAt',(select completed_at from source),'snapshot',(select snapshot from source),'companies',coalesce((select snapshot->'companies' from source),'[]'::jsonb),'mappings',coalesce((select jsonb_agg(jsonb_build_object('contactId',m.contact_id,'invoiceId',m.source_invoice_id,'categoryId',m.category_id,'optionId',m.option_id,'rosterKey',m.target_roster_key,'version',m.version::text,'targetUnitVersion',m.target_unit_version::text,'effectiveMonth',to_char(m.effective_invoice_month,'YYYY-MM')) order by m.created_at,m.version) from public.account_xero_mapping_versions m join c on c.id=m.connection_id and c.tenant_id=m.tenant_id),'[]'::jsonb)) into answer;
 if jsonb_array_length(answer->'mappings')>10000 then raise exception 'XERO_MAPPING_LIMIT';end if;
 return answer;
end $$;

create or replace function public.xero_billing_mappings_save(p_tenant text,p_actor text,p_session_digest text,p_environment text,p_source_run_id uuid,p_invoice_month date,p_bindings jsonb,p_request_id uuid,p_stepup_digest text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.xero_connections%rowtype;source jsonb;latest_source uuid;binding jsonb;seed jsonb;unit_key text;source_key text;uuid_pattern text:='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
 contact uuid;category uuid;opt uuid;invoice uuid;group_version bigint;expected bigint;unit_expected bigint;unit_latest public.account_billing_unit_versions%rowtype;unit_applied public.account_billing_unit_versions%rowtype;prior_mapping public.account_xero_mapping_versions%rowtype;saved public.account_xero_mapping_versions%rowtype;
 source_initial jsonb:='{}'::jsonb;source_next jsonb:='{}'::jsonb;unit_initial jsonb:='{}'::jsonb;unit_resolved jsonb:='{}'::jsonb;unit_seeds jsonb:='{}'::jsonb;payload jsonb;prior jsonb;result jsonb;results jsonb:='[]'::jsonb;anchor_request uuid;store_platform text;target_market text;anchor_payload jsonb;
begin
 perform xero_private.assert_actor(p_tenant,p_actor,p_session_digest,p_stepup_digest);
 if p_invoice_month is null or extract(day from p_invoice_month)<>1 or p_request_id is null or p_source_run_id is null or jsonb_typeof(p_bindings) is distinct from 'array' or jsonb_array_length(p_bindings) not between 1 and 100 then raise exception 'XERO_MAPPING_INVALID';end if;
 select * into c from public.xero_connections where tenant_id=p_tenant and environment=p_environment for update;
 if not found or c.status<>'connected' or c.project_scope is null then raise exception 'XERO_MAPPING_SOURCE_REQUIRED';end if;
 payload:=jsonb_build_object('mode','xero-billing-mappings','actor',lower(p_actor),'environment',p_environment,'connectionId',c.id,'sourceRunId',p_source_run_id,'invoiceMonth',p_invoice_month,'bindings',p_bindings);
 prior:=public.account_request_prior(p_tenant,p_request_id,payload);if prior is not null then return prior;end if;
 select ss.snapshot,ss.run_id into source,latest_source from public.xero_sync_snapshots ss join public.xero_sync_runs r on r.tenant_id=ss.tenant_id and r.id=ss.run_id and r.connection_id=ss.connection_id where ss.tenant_id=p_tenant and ss.connection_id=c.id and r.status='succeeded' and ss.snapshot->>'month'=to_char(p_invoice_month,'YYYY-MM') order by ss.created_at desc,ss.run_id desc limit 1;
 if latest_source is distinct from p_source_run_id or jsonb_typeof(source->'companies') is distinct from 'array' or not xero_private.snapshot_valid(source) then raise exception 'XERO_MAPPING_SOURCE_STALE';end if;
 if exists(select 1 from jsonb_array_elements(p_bindings) b where jsonb_typeof(b)<>'object' or not(b ?& array['contactId','categoryId','optionId','rosterKey','expectedVersion','targetExpectedVersion']) or b-array['contactId','categoryId','optionId','invoiceId','rosterKey','expectedVersion','targetExpectedVersion','targetSeed']<>'{}'::jsonb or coalesce(b->>'contactId','') !~* uuid_pattern or coalesce(b->>'categoryId','') !~* uuid_pattern or coalesce(b->>'optionId','') !~* uuid_pattern or (b ? 'invoiceId' and b->'invoiceId'<>'null'::jsonb and coalesce(b->>'invoiceId','') !~* uuid_pattern) or coalesce(b->>'expectedVersion','') !~ '^(0|[1-9][0-9]{0,18})$' or coalesce(b->>'targetExpectedVersion','') !~ '^(0|[1-9][0-9]{0,18})$' or coalesce(b->>'rosterKey','') !~ '^(roster-2026-10-(my|sg)-[0-9]+|store:shopee-[a-z0-9]+(-[a-z0-9]+)*)$') then raise exception 'XERO_MAPPING_INVALID';end if;
 if exists(select 1 from jsonb_array_elements(p_bindings) b group by (b->>'contactId')::uuid,(b->>'categoryId')::uuid,(b->>'optionId')::uuid,(b->>'invoiceId')::uuid having count(*)>1) then raise exception 'XERO_MAPPING_DUPLICATE';end if;
 -- Consistent target-lock order also coordinates with existing Account/Store RPCs.
 for unit_key in select distinct b->>'rosterKey' from jsonb_array_elements(p_bindings) b order by 1 loop
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_tenant),pg_catalog.hashtext('unit:'||unit_key));
 end loop;
 for binding in select b from jsonb_array_elements(p_bindings) b order by b->>'contactId',b->>'categoryId',b->>'optionId',coalesce(b->>'invoiceId','') loop
  contact:=(binding->>'contactId')::uuid;category:=(binding->>'categoryId')::uuid;opt:=(binding->>'optionId')::uuid;invoice:=(binding->>'invoiceId')::uuid;unit_key:=binding->>'rosterKey';expected:=(binding->>'expectedVersion')::bigint;unit_expected:=(binding->>'targetExpectedVersion')::bigint;
  if category is distinct from (c.project_scope->>'categoryId')::uuid or not exists(select 1 from jsonb_array_elements(c.project_scope->'options') o where (o->>'id')::uuid=opt) or not exists(select 1 from jsonb_array_elements(source->'companies') company where (company->>'contactId')::uuid=contact and (company->>'categoryId')::uuid=category and (company->>'optionId')::uuid=opt) then raise exception 'XERO_MAPPING_IDENTITY_DENIED';end if;
  if invoice is not null and not exists(select 1 from jsonb_array_elements(source->'report'->'rows') row_data where row_data->>'state'='eligible' and (row_data->>'invoiceId')::uuid=invoice and (row_data->>'contactId')::uuid=contact and exists(select 1 from jsonb_array_elements(c.project_scope->'options') o where (o->>'id')::uuid=opt and o->>'project'=row_data->>'project')) then raise exception 'XERO_MAPPING_INVOICE_DENIED';end if;
  source_key:=contact::text||':'||category::text||':'||opt::text;
  if source_initial ? source_key then
   if (source_initial->>source_key)::bigint<>expected then raise exception 'XERO_MAPPING_VERSION_CONFLICT';end if;
  else
   select coalesce(max(version),0) into group_version from public.account_xero_mapping_versions where tenant_id=p_tenant and connection_id=c.id and contact_id=contact and category_id=category and option_id=opt;
   if group_version<>expected then raise exception 'XERO_MAPPING_VERSION_CONFLICT';end if;
   source_initial:=source_initial||jsonb_build_object(source_key,group_version::text);source_next:=source_next||jsonb_build_object(source_key,group_version::text);
  end if;
  group_version:=(source_next->>source_key)::bigint+1;
  -- Audit the prior value in THIS scope; another invoice's latest version is not its before-state.
  select * into prior_mapping from public.account_xero_mapping_versions where tenant_id=p_tenant and connection_id=c.id and contact_id=contact and category_id=category and option_id=opt and source_invoice_id is not distinct from invoice order by version desc limit 1;
  if unit_initial ? unit_key then
   if (unit_initial->>unit_key)::bigint<>unit_expected or unit_seeds->unit_key is distinct from coalesce(binding->'targetSeed','null'::jsonb) then raise exception 'XERO_MAPPING_TARGET_CONFLICT';end if;
   select * into unit_applied from public.account_billing_unit_versions where tenant_id=p_tenant and roster_key=unit_key and version=(unit_resolved->>unit_key)::bigint;
  else
   select * into unit_latest from public.account_billing_unit_versions where tenant_id=p_tenant and roster_key=unit_key order by version desc limit 1;
   if coalesce(unit_latest.version,0)<>unit_expected then raise exception 'ACCOUNT_VERSION_CONFLICT';end if;
   unit_initial:=unit_initial||jsonb_build_object(unit_key,unit_expected::text);unit_seeds:=unit_seeds||jsonb_build_object(unit_key,coalesce(binding->'targetSeed','null'::jsonb));
   select * into unit_applied from public.account_billing_unit_versions where tenant_id=p_tenant and roster_key=unit_key and effective_month<=p_invoice_month order by effective_month desc,version desc limit 1;
   if unit_applied.id is null then
    -- Identity-only materialization of a server-reviewed catalog target, never a fabricated fee.
    seed:=binding->'targetSeed';
    if jsonb_typeof(seed) is distinct from 'object' or not(seed ?& array['project','entity','currency','market','storeId']) or seed-array['project','entity','currency','market','storeId']<>'{}'::jsonb or length(trim(coalesce(seed->>'project',''))) not between 1 and 120 or length(trim(coalesce(seed->>'entity',''))) not between 1 and 240 or coalesce(seed->>'currency','') not in ('MYR','SGD','THB','PHP') or coalesce(seed->>'market','') not in ('MY','SG','TH','PH') then raise exception 'XERO_MAPPING_TARGET_REQUIRED';end if;
    if (unit_key like 'roster-2026-10-my-%' and seed->>'market'<>'MY') or (unit_key like 'roster-2026-10-sg-%' and seed->>'market'<>'SG') then raise exception 'XERO_MAPPING_TARGET_CONFLICT';end if;
    if unit_latest.id is not null and (unit_latest.currency is distinct from seed->>'currency') then raise exception 'XERO_MAPPING_TARGET_CONFLICT';end if;
    select platform into store_platform from public.stores where tenant_id=p_tenant and id=seed->>'storeId';
    if not found or seed->>'storeId'='shopee-skindae-sg-by-ctg4u' or (unit_key like 'store:%' and substring(unit_key from 7) is distinct from seed->>'storeId') or (store_platform in ('Shopee MY','Shopee SG','Shopee TH','Shopee PH') and store_platform<>'Shopee '||(seed->>'market')) then raise exception 'XERO_MAPPING_STORE_DENIED';end if;
    anchor_request:=(substring(xero_private.fingerprint(jsonb_build_array('xero-unit-anchor',p_request_id,unit_key)),1,32))::uuid;
    anchor_payload:=jsonb_build_object('mode','xero-identity-anchor','parentRequestId',p_request_id,'sourceRunId',p_source_run_id,'unit',unit_key,'month',p_invoice_month,'identity',seed);
    insert into public.account_billing_unit_versions(tenant_id,roster_key,roster_project,legal_entity,currency,store_id,effective_month,version,change_action,fee_rule,actor_email,request_id,request_payload,market,input_currency)
    values(p_tenant,unit_key,trim(seed->>'project'),trim(seed->>'entity'),seed->>'currency',seed->>'storeId',p_invoice_month,coalesce(unit_latest.version,0)+1,'mapping',null,lower(p_actor),anchor_request,anchor_payload,seed->>'market',case seed->>'market' when 'MY' then 'MYR' when 'SG' then 'SGD' when 'TH' then 'THB' when 'PH' then 'PHP' end) returning * into unit_applied;
    insert into public.account_audit_log(tenant_id,actor_email,action,record_type,record_id,after_value) values(p_tenant,lower(p_actor),'xero.unit_anchor','billing_unit_version',unit_applied.id,jsonb_build_object('rosterKey',unit_key,'version',unit_applied.version::text,'effectiveMonth',p_invoice_month,'storeId',unit_applied.store_id,'identityOnly',true,'parentRequestId',p_request_id));
   end if;
   if unit_applied.store_id is null or unit_applied.store_id='shopee-skindae-sg-by-ctg4u' or not exists(select 1 from public.stores where tenant_id=p_tenant and id=unit_applied.store_id) then raise exception 'XERO_MAPPING_STORE_REQUIRED';end if;
   unit_resolved:=unit_resolved||jsonb_build_object(unit_key,unit_applied.version::text);
  end if;
  insert into public.account_xero_mapping_versions(tenant_id,connection_id,contact_id,category_id,option_id,source_invoice_id,effective_invoice_month,version,target_roster_key,target_unit_version,source_run_id,actor_email,request_id)
  values(p_tenant,c.id,contact,category,opt,invoice,p_invoice_month,group_version,unit_key,unit_applied.version,p_source_run_id,lower(p_actor),p_request_id) returning * into saved;
  insert into public.account_audit_log(tenant_id,actor_email,action,record_type,record_id,before_value,after_value) values(p_tenant,lower(p_actor),'xero.billing_mapping','xero_billing_mapping',saved.id,case when prior_mapping.id is null then null else jsonb_build_object('rosterKey',prior_mapping.target_roster_key,'version',prior_mapping.version::text,'invoiceId',prior_mapping.source_invoice_id) end,jsonb_build_object('contactId',saved.contact_id,'invoiceId',saved.source_invoice_id,'categoryId',saved.category_id,'optionId',saved.option_id,'rosterKey',saved.target_roster_key,'version',saved.version::text,'effectiveMonth',saved.effective_invoice_month,'sourceRunId',saved.source_run_id,'targetUnitVersion',saved.target_unit_version::text));
  source_next:=source_next||jsonb_build_object(source_key,group_version::text);
  results:=results||jsonb_build_array(jsonb_build_object('contactId',saved.contact_id,'invoiceId',saved.source_invoice_id,'categoryId',saved.category_id,'optionId',saved.option_id,'rosterKey',saved.target_roster_key,'version',saved.version::text,'effectiveMonth',to_char(saved.effective_invoice_month,'YYYY-MM'),'targetUnitVersion',saved.target_unit_version::text));
 end loop;
 result:=jsonb_build_object('mappings',results,'unitVersions',unit_resolved);
 insert into public.account_store_requests(tenant_id,request_id,request_payload,result) values(p_tenant,p_request_id,payload,result);
 return result;
end $$;
revoke all on function public.xero_billing_mappings_read(text,text,text,text,date,text),public.xero_billing_mappings_save(text,text,text,text,uuid,date,jsonb,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.xero_billing_mappings_read(text,text,text,text,date,text),public.xero_billing_mappings_save(text,text,text,text,uuid,date,jsonb,uuid,text) to service_role;
commit;
