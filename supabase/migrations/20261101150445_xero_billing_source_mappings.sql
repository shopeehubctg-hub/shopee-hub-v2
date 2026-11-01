-- Independent Staging only until separately authorized for Production.
-- Append source-to-canonical-unit associations; never seed financial facts or rewrite history.
begin;
create table public.account_xero_mapping_versions (
 id uuid primary key default gen_random_uuid(),tenant_id text not null,
 connection_id uuid not null,contact_id uuid not null,category_id uuid not null,option_id uuid not null,
 effective_invoice_month date not null check(extract(day from effective_invoice_month)=1),
 version bigint not null check(version>0),target_roster_key text not null,target_unit_version bigint not null,
 source_run_id uuid not null,actor_email text not null,request_id uuid not null,created_at timestamptz not null default now(),
 unique(tenant_id,connection_id,contact_id,category_id,option_id,version),
 foreign key(tenant_id,connection_id) references public.xero_connections(tenant_id,id),
 foreign key(tenant_id,source_run_id) references public.xero_sync_runs(tenant_id,id),
 foreign key(tenant_id,target_roster_key,target_unit_version) references public.account_billing_unit_versions(tenant_id,roster_key,version)
);
create index account_xero_mapping_month_idx on public.account_xero_mapping_versions(tenant_id,connection_id,contact_id,category_id,option_id,effective_invoice_month desc,version desc);
create index account_xero_mapping_target_idx on public.account_xero_mapping_versions(tenant_id,target_roster_key,target_unit_version);
create index account_xero_mapping_run_idx on public.account_xero_mapping_versions(tenant_id,source_run_id);
alter table public.account_xero_mapping_versions enable row level security;
revoke all on public.account_xero_mapping_versions from public,anon,authenticated,service_role;
grant select,insert on public.account_xero_mapping_versions to service_role;

create or replace function xero_private.snapshot_valid(v jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare r jsonb;x jsonb;k text;pair record;ids text[]:=array[]::text[];payment_ids text[]:=array[]::text[];n integer;pending integer:=0;eligible integer:=0;
 projects text[]:=array['Shopee Hub','Shopee Hub Internal','Tik Tok Hub','Lazada Hub'];
 uuid_pattern text:='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
 if v is null or jsonb_typeof(v)<>'object' or octet_length(v::text)>8000000 or not(v ?& array['month','today','scope','report']) or v-array['month','today','scope','report','companies']<>'{}'::jsonb or coalesce(v->>'month','') !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' or coalesce(v->>'today','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' or not xero_private.scope_valid(v->'scope') then return false;end if;
 perform (v->>'today')::date;

 if v ? 'companies' then
  if jsonb_typeof(v->'companies')<>'array' or jsonb_array_length(v->'companies')>2000 then return false;end if;
  for x in select value from jsonb_array_elements(v->'companies') loop
   if jsonb_typeof(x)<>'object' or not(x ?& array['contactId','companyName','categoryId','optionId','project']) or x-array['contactId','companyName','categoryId','optionId','project']<>'{}'::jsonb or coalesce(x->>'contactId','') !~* uuid_pattern or coalesce(x->>'categoryId','') !~* uuid_pattern or coalesce(x->>'optionId','') !~* uuid_pattern or jsonb_typeof(x->'companyName')<>'string' or length(trim(x->>'companyName')) not between 1 and 240 or (x->>'companyName') ~ '[[:cntrl:]]' then return false;end if;
   if x->>'categoryId' is distinct from v->'scope'->>'categoryId' or not exists(select 1 from jsonb_array_elements(v->'scope'->'options') o where o->>'id'=x->>'optionId' and o->>'project'=x->>'project') then return false;end if;
   if (lower(x->>'contactId')||':'||lower(x->>'optionId'))=any(ids) then return false;end if;
   ids:=array_append(ids,lower(x->>'contactId')||':'||lower(x->>'optionId'));
   if not exists(select 1 from jsonb_array_elements(v->'report'->'rows') q where q->>'state'='eligible' and lower(q->>'contactId')=lower(x->>'contactId') and q->>'project'=x->>'project') then return false;end if;
  end loop;
 end if;
 ids:=array[]::text[];
 r:=v->'report';
 if jsonb_typeof(r)<>'object' or not(r ?& array['rows','totals','month','today','payments','invoiceCount','pendingCount','collections','outstanding','invoices']) or r-array['rows','totals','month','today','payments','invoiceCount','pendingCount','collections','outstanding','invoices']<>'{}'::jsonb or r->'month' is distinct from v->'month' or r->'today' is distinct from v->'today' then return false;end if;
 foreach k in array array['rows','totals','payments','collections','outstanding','invoices'] loop
  if jsonb_typeof(r->k)<>'array' or jsonb_array_length(r->k)>4000 then return false;end if;
 end loop;
 for x in select value from jsonb_array_elements(r->'rows') loop
  if jsonb_typeof(x)<>'object' or not(x ?& array['invoiceId','invoiceNumber','contactId','currency','state','reason','project']) or coalesce(x->>'invoiceId','') !~* uuid_pattern or (x->>'invoiceId')=any(ids) or coalesce(x->>'currency','') !~ '^[A-Z]{3}$' then return false;end if;
  ids:=array_append(ids,x->>'invoiceId');
  if x->'invoiceNumber'<>'null'::jsonb and (jsonb_typeof(x->'invoiceNumber')<>'string' or length(x->>'invoiceNumber')>240) then return false;end if;
  if x->'contactId'<>'null'::jsonb and coalesce(x->>'contactId','') !~* uuid_pattern then return false;end if;
  if x->>'state'='pending' then
   pending:=pending+1;
   if x-array['invoiceId','invoiceNumber','contactId','currency','state','reason','project']<>'{}'::jsonb or x->'project'<>'null'::jsonb or coalesce(x->>'reason','') not in ('mixed_projects','missing_tracking','multiple_projects') then return false;end if;
  elsif x->>'state'='eligible' then
   eligible:=eligible+1;
   if x-array['invoiceId','invoiceNumber','contactId','currency','state','reason','project','subtotal','tax','gross','amountPaid','amountDue','amountCredited','cashReceived','date','dueDate']<>'{}'::jsonb or not(x ?& array['subtotal','tax','gross','amountPaid','amountDue','amountCredited','cashReceived','date','dueDate']) or x->'reason'<>'null'::jsonb or not(coalesce(x->>'project','')=any(projects)) then return false;end if;
   foreach k in array array['subtotal','tax','gross','amountPaid','amountDue','amountCredited','cashReceived'] loop
    if not xero_private.money_valid(x->k,k='cashReceived') then return false;end if;
   end loop;
   if (x->>'subtotal')::numeric+(x->>'tax')::numeric<>(x->>'gross')::numeric or (x->>'amountPaid')::numeric+(x->>'amountDue')::numeric+(x->>'amountCredited')::numeric<>(x->>'gross')::numeric or (x->>'cashReceived')::numeric>(x->>'amountPaid')::numeric then return false;end if;
   foreach k in array array['date','dueDate'] loop
    if x->k<>'null'::jsonb and (jsonb_typeof(x->k)<>'string' or coalesce(x->>k,'') !~ '^(20[0-9]{2}-[0-9]{2}-[0-9]{2}(T[0-9:.+Z-]+)?|/Date\([0-9]+([+-][0-9]+)?\)/)$') then return false;end if;
   end loop;
  else return false;end if;
 end loop;
 if r->>'invoiceCount' is distinct from eligible::text or r->>'pendingCount' is distinct from pending::text then return false;end if;
 -- The duplicate presentation list may only add a generated Xero deep-link.
 if jsonb_array_length(r->'invoices')<>jsonb_array_length(r->'rows') then return false;end if;
 n:=0;
 for x in select value from jsonb_array_elements(r->'invoices') loop
  if (x-'xeroUrl') is distinct from (r->'rows'->n) or x->>'xeroUrl' is distinct from ('https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID='||(x->>'invoiceId')) then return false;end if;n:=n+1;
 end loop;
 for x in select value from jsonb_array_elements(r->'payments') loop
  if jsonb_typeof(x)<>'object' or not(x ?& array['paymentId','invoiceId','invoiceNumber','project','currency','amount','date']) or x-array['paymentId','invoiceId','invoiceNumber','project','currency','amount','date']<>'{}'::jsonb or coalesce(x->>'paymentId','') !~* uuid_pattern or coalesce(x->>'invoiceId','') !~* uuid_pattern or (x->>'paymentId')=any(payment_ids) or not(coalesce(x->>'project','')=any(projects)) or coalesce(x->>'currency','') !~ '^[A-Z]{3}$' or not xero_private.money_valid(x->'amount') or coalesce(x->>'date','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' then return false;end if;
  if x->'invoiceNumber'<>'null'::jsonb and (jsonb_typeof(x->'invoiceNumber')<>'string' or length(x->>'invoiceNumber')>240) then return false;end if;
  perform (x->>'date')::date;
  if left(x->>'date',7)<>v->>'month' or x->>'date'>v->>'today' then return false;end if;
  payment_ids:=array_append(payment_ids,x->>'paymentId');
 end loop;
 foreach k in array array['totals','collections','outstanding'] loop
  ids:=array[]::text[];
  for x in select value from jsonb_array_elements(r->k) loop
   if jsonb_typeof(x)<>'object' or coalesce(x->>'currency','') !~ '^[A-Z]{3}$' or (x->>'currency')=any(ids) then return false;end if;
   ids:=array_append(ids,x->>'currency');
   if k='totals' and (not(x ?& array['currency','gross','tax','amountPaid','amountDue','amountCredited','cashReceived']) or x-array['currency','gross','tax','amountPaid','amountDue','amountCredited','cashReceived']<>'{}'::jsonb) then return false;end if;
   if k='collections' and (not(x ?& array['currency','monthCollected','todayCollected']) or x-array['currency','monthCollected','todayCollected']<>'{}'::jsonb) then return false;end if;
   if k='outstanding' and (not(x ?& array['currency','amountDue']) or x-array['currency','amountDue']<>'{}'::jsonb) then return false;end if;
   for pair in select * from jsonb_each(x-'currency') loop
    if not xero_private.money_valid(pair.value,pair.key in ('cashReceived','monthCollected','todayCollected')) then return false;end if;
   end loop;
  end loop;
 end loop;
 return true;
exception when others then return false;end $$;

create function public.xero_billing_mappings_read(p_tenant text,p_actor text,p_session_digest text,p_environment text,p_invoice_month date,p_stepup_digest text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare answer jsonb;
begin
 perform xero_private.assert_actor(p_tenant,p_actor,p_session_digest,p_stepup_digest);
 if p_invoice_month is null or extract(day from p_invoice_month)<>1 then raise exception 'XERO_MAPPING_INVALID';end if;
 if (select count(*) from public.account_xero_mapping_versions m join public.xero_connections c on c.tenant_id=m.tenant_id and c.id=m.connection_id where c.tenant_id=p_tenant and c.environment=p_environment)>10000 then raise exception 'XERO_MAPPING_LIMIT';end if;
 -- One source read snapshot: requested-month data and mapping history cannot come from different runs.
 with c as(select * from public.xero_connections where tenant_id=p_tenant and environment=p_environment),
 source as(select ss.snapshot,r.id,r.completed_at from public.xero_sync_snapshots ss join public.xero_sync_runs r on r.tenant_id=ss.tenant_id and r.id=ss.run_id and r.connection_id=ss.connection_id join c on c.tenant_id=ss.tenant_id and c.id=ss.connection_id where r.status='succeeded' and ss.snapshot->>'month'=to_char(p_invoice_month,'YYYY-MM') order by ss.created_at desc,ss.run_id desc limit 1)
 select jsonb_build_object('sourceRunId',(select id from source),'lastSyncedAt',(select completed_at from source),'snapshot',(select snapshot from source),'companies',coalesce((select snapshot->'companies' from source),'[]'::jsonb),'mappings',coalesce((select jsonb_agg(jsonb_build_object('contactId',m.contact_id,'categoryId',m.category_id,'optionId',m.option_id,'rosterKey',m.target_roster_key,'version',m.version::text,'targetUnitVersion',m.target_unit_version::text,'effectiveMonth',to_char(m.effective_invoice_month,'YYYY-MM')) order by m.created_at,m.version) from public.account_xero_mapping_versions m join c on c.id=m.connection_id and c.tenant_id=m.tenant_id),'[]'::jsonb)) into answer;
 if jsonb_array_length(answer->'mappings')>10000 then raise exception 'XERO_MAPPING_LIMIT';end if;
 return answer;
end $$;

create function public.xero_billing_mappings_save(p_tenant text,p_actor text,p_session_digest text,p_environment text,p_source_run_id uuid,p_invoice_month date,p_bindings jsonb,p_request_id uuid,p_stepup_digest text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.xero_connections%rowtype;source jsonb;latest_source uuid;binding jsonb;seed jsonb;unit_key text;source_key text;uuid_pattern text:='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
 contact uuid;category uuid;opt uuid;expected bigint;unit_expected bigint;unit_latest public.account_billing_unit_versions%rowtype;unit_applied public.account_billing_unit_versions%rowtype;prior_mapping public.account_xero_mapping_versions%rowtype;saved public.account_xero_mapping_versions%rowtype;
 unit_initial jsonb:='{}'::jsonb;unit_resolved jsonb:='{}'::jsonb;unit_seeds jsonb:='{}'::jsonb;payload jsonb;prior jsonb;result jsonb;results jsonb:='[]'::jsonb;anchor_request uuid;store_platform text;target_market text;anchor_payload jsonb;
begin
 perform xero_private.assert_actor(p_tenant,p_actor,p_session_digest,p_stepup_digest);
 if p_invoice_month is null or extract(day from p_invoice_month)<>1 or p_request_id is null or p_source_run_id is null or jsonb_typeof(p_bindings) is distinct from 'array' or jsonb_array_length(p_bindings) not between 1 and 100 then raise exception 'XERO_MAPPING_INVALID';end if;
 select * into c from public.xero_connections where tenant_id=p_tenant and environment=p_environment for update;
 if not found or c.status<>'connected' or c.project_scope is null then raise exception 'XERO_MAPPING_SOURCE_REQUIRED';end if;
 payload:=jsonb_build_object('mode','xero-billing-mappings','actor',lower(p_actor),'environment',p_environment,'connectionId',c.id,'sourceRunId',p_source_run_id,'invoiceMonth',p_invoice_month,'bindings',p_bindings);
 prior:=public.account_request_prior(p_tenant,p_request_id,payload);if prior is not null then return prior;end if;
 select ss.snapshot,ss.run_id into source,latest_source from public.xero_sync_snapshots ss join public.xero_sync_runs r on r.tenant_id=ss.tenant_id and r.id=ss.run_id and r.connection_id=ss.connection_id where ss.tenant_id=p_tenant and ss.connection_id=c.id and r.status='succeeded' and ss.snapshot->>'month'=to_char(p_invoice_month,'YYYY-MM') order by ss.created_at desc,ss.run_id desc limit 1;
 if latest_source is distinct from p_source_run_id or jsonb_typeof(source->'companies') is distinct from 'array' or not xero_private.snapshot_valid(source) then raise exception 'XERO_MAPPING_SOURCE_STALE';end if;
 if exists(select 1 from jsonb_array_elements(p_bindings) b where jsonb_typeof(b)<>'object' or not(b ?& array['contactId','categoryId','optionId','rosterKey','expectedVersion','targetExpectedVersion']) or b-array['contactId','categoryId','optionId','rosterKey','expectedVersion','targetExpectedVersion','targetSeed']<>'{}'::jsonb or coalesce(b->>'contactId','') !~* uuid_pattern or coalesce(b->>'categoryId','') !~* uuid_pattern or coalesce(b->>'optionId','') !~* uuid_pattern or coalesce(b->>'expectedVersion','') !~ '^(0|[1-9][0-9]{0,18})$' or coalesce(b->>'targetExpectedVersion','') !~ '^(0|[1-9][0-9]{0,18})$' or coalesce(b->>'rosterKey','') !~ '^(roster-2026-10-(my|sg)-[0-9]+|store:shopee-[a-z0-9]+(-[a-z0-9]+)*)$') then raise exception 'XERO_MAPPING_INVALID';end if;
 if exists(select 1 from jsonb_array_elements(p_bindings) b group by (b->>'contactId')::uuid,(b->>'categoryId')::uuid,(b->>'optionId')::uuid having count(*)>1) then raise exception 'XERO_MAPPING_DUPLICATE';end if;
 -- Consistent target-lock order also coordinates with existing Account/Store RPCs.
 for unit_key in select distinct b->>'rosterKey' from jsonb_array_elements(p_bindings) b order by 1 loop
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_tenant),pg_catalog.hashtext('unit:'||unit_key));
 end loop;
 for binding in select b from jsonb_array_elements(p_bindings) b order by b->>'contactId',b->>'categoryId',b->>'optionId' loop
  contact:=(binding->>'contactId')::uuid;category:=(binding->>'categoryId')::uuid;opt:=(binding->>'optionId')::uuid;unit_key:=binding->>'rosterKey';expected:=(binding->>'expectedVersion')::bigint;unit_expected:=(binding->>'targetExpectedVersion')::bigint;
  if category is distinct from (c.project_scope->>'categoryId')::uuid or not exists(select 1 from jsonb_array_elements(c.project_scope->'options') o where (o->>'id')::uuid=opt) or not exists(select 1 from jsonb_array_elements(source->'companies') company where (company->>'contactId')::uuid=contact and (company->>'categoryId')::uuid=category and (company->>'optionId')::uuid=opt) then raise exception 'XERO_MAPPING_IDENTITY_DENIED';end if;
  select * into prior_mapping from public.account_xero_mapping_versions where tenant_id=p_tenant and connection_id=c.id and contact_id=contact and category_id=category and option_id=opt order by version desc limit 1;
  if coalesce(prior_mapping.version,0)<>expected then raise exception 'XERO_MAPPING_VERSION_CONFLICT';end if;
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
  insert into public.account_xero_mapping_versions(tenant_id,connection_id,contact_id,category_id,option_id,effective_invoice_month,version,target_roster_key,target_unit_version,source_run_id,actor_email,request_id)
  values(p_tenant,c.id,contact,category,opt,p_invoice_month,coalesce(prior_mapping.version,0)+1,unit_key,unit_applied.version,p_source_run_id,lower(p_actor),p_request_id) returning * into saved;
  insert into public.account_audit_log(tenant_id,actor_email,action,record_type,record_id,before_value,after_value) values(p_tenant,lower(p_actor),'xero.billing_mapping','xero_billing_mapping',saved.id,case when prior_mapping.id is null then null else jsonb_build_object('rosterKey',prior_mapping.target_roster_key,'version',prior_mapping.version::text) end,jsonb_build_object('contactId',saved.contact_id,'categoryId',saved.category_id,'optionId',saved.option_id,'rosterKey',saved.target_roster_key,'version',saved.version::text,'effectiveMonth',saved.effective_invoice_month,'sourceRunId',saved.source_run_id,'targetUnitVersion',saved.target_unit_version::text));
  results:=results||jsonb_build_array(jsonb_build_object('contactId',saved.contact_id,'categoryId',saved.category_id,'optionId',saved.option_id,'rosterKey',saved.target_roster_key,'version',saved.version::text,'effectiveMonth',to_char(saved.effective_invoice_month,'YYYY-MM'),'targetUnitVersion',saved.target_unit_version::text));
 end loop;
 result:=jsonb_build_object('mappings',results,'unitVersions',unit_resolved);
 insert into public.account_store_requests(tenant_id,request_id,request_payload,result) values(p_tenant,p_request_id,payload,result);
 return result;
end $$;
revoke all on function public.xero_billing_mappings_read(text,text,text,text,date,text),public.xero_billing_mappings_save(text,text,text,text,uuid,date,jsonb,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.xero_billing_mappings_read(text,text,text,text,date,text),public.xero_billing_mappings_save(text,text,text,text,uuid,date,jsonb,uuid,text) to service_role;
commit;
