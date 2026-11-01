-- Xero is a read-only EXTERNAL SOURCE, not assessed Account ledger income.
-- Initial application is authorized only on independent Stage ubjfuveoqbvouryldqfu.
-- No source credentials, source invoices or connection are seeded. No existing row is removed.
begin;
create schema xero_private;
revoke all on schema xero_private from public,anon,authenticated;
grant usage on schema xero_private to service_role;

create table public.xero_connections (
 id uuid primary key default gen_random_uuid(),tenant_id text not null references public.tenants(id),
 environment text not null check(environment in ('staging','production')),
 external_connection_id uuid not null,organisation_id uuid not null,organisation_name text not null check(length(organisation_name) between 1 and 240),
 status text not null default 'connected' check(status in ('connected','reconnect_required')),
 credential_epoch bigint not null default 1 check(credential_epoch>0),project_scope jsonb,
 created_by text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 last_synced_at timestamptz,last_error text,retry_at timestamptz,
 unique(tenant_id,id),unique(tenant_id,environment),unique(environment,organisation_id)
);
create table xero_private.connection_tokens (
 tenant_id text not null,connection_id uuid primary key,encrypted_tokens text not null,
 token_version bigint not null default 1 check(token_version>0),scopes text[] not null,token_expires_at timestamptz not null,
 refresh_lease_id uuid,refresh_lease_until timestamptz,last_refresh_lease_id uuid,last_refresh_fingerprint text,
 updated_at timestamptz not null default now(),foreign key(tenant_id,connection_id) references public.xero_connections(tenant_id,id)
);
create table xero_private.oauth_states (
 id uuid primary key default gen_random_uuid(),tenant_id text not null references public.tenants(id),actor_email text not null,
 session_digest text not null check(session_digest ~ '^[0-9a-f]{64}$'),state_digest text not null check(state_digest ~ '^[0-9a-f]{64}$'),
 environment text not null check(environment in ('staging','production')),organisation_id uuid not null,
 created_at timestamptz not null default now(),expires_at timestamptz not null,consumed_at timestamptz,connected_at timestamptz,
 save_fingerprint text,connection_id uuid,connection_epoch bigint not null default 0,unique(tenant_id,environment,state_digest),
 foreign key(tenant_id,connection_id) references public.xero_connections(tenant_id,id)
);
create table public.xero_sync_runs (
 id uuid primary key default gen_random_uuid(),tenant_id text not null,connection_id uuid not null,
 request_id uuid not null,actor_email text not null,status text not null default 'running' check(status in ('running','succeeded','failed')),
 lease_id uuid not null,lease_until timestamptz not null,credential_epoch bigint not null,
 started_at timestamptz not null default now(),completed_at timestamptz,watermark timestamptz,error_code text,
 snapshot_fingerprint text,unique(tenant_id,id),unique(tenant_id,request_id),
 foreign key(tenant_id,connection_id) references public.xero_connections(tenant_id,id)
);
create index xero_sync_runs_connection_latest on public.xero_sync_runs(tenant_id,connection_id,started_at desc);
create table public.xero_sync_snapshots (
 run_id uuid primary key,tenant_id text not null,connection_id uuid not null,
 snapshot jsonb not null,created_at timestamptz not null default now(),
 foreign key(tenant_id,run_id) references public.xero_sync_runs(tenant_id,id),
 foreign key(tenant_id,connection_id) references public.xero_connections(tenant_id,id)
);
create index xero_sync_snapshots_connection_latest on public.xero_sync_snapshots(tenant_id,connection_id,created_at desc);
alter table public.xero_connections enable row level security;
alter table public.xero_sync_runs enable row level security;
alter table public.xero_sync_snapshots enable row level security;
alter table xero_private.connection_tokens enable row level security;
alter table xero_private.oauth_states enable row level security;
-- Explicitly reset default privileges, including Supabase's service_role defaults.
revoke all on public.xero_connections,public.xero_sync_runs,public.xero_sync_snapshots,xero_private.connection_tokens,xero_private.oauth_states from public,anon,authenticated,service_role;
grant select,insert on public.xero_connections,public.xero_sync_runs,public.xero_sync_snapshots,xero_private.connection_tokens,xero_private.oauth_states to service_role;
grant update(external_connection_id,organisation_name,status,credential_epoch,project_scope,updated_at,last_synced_at,last_error,retry_at) on public.xero_connections to service_role;
grant update(encrypted_tokens,token_version,scopes,token_expires_at,refresh_lease_id,refresh_lease_until,last_refresh_lease_id,last_refresh_fingerprint,updated_at) on xero_private.connection_tokens to service_role;
grant update(consumed_at,connected_at,save_fingerprint,connection_id) on xero_private.oauth_states to service_role;
grant update(status,completed_at,watermark,error_code,snapshot_fingerprint) on public.xero_sync_runs to service_role;

create function xero_private.assert_actor(p_tenant text,p_actor text,p_session_digest text,p_stepup_digest text) returns bigint
language plpgsql security invoker set search_path='' as $$
declare u bigint;
begin
 if p_actor is null or p_session_digest is null or p_session_digest !~ '^[0-9a-f]{64}$' then raise exception 'XERO_ACCESS_DENIED';end if;
 select id into u from public.customer_users where tenant_id=p_tenant and email=lower(p_actor) and active and role='superadmin';
 if u is null then raise exception 'XERO_ACCESS_DENIED';end if;
 perform account_security.assert_member(p_tenant,u,true);
 perform account_security.assert_primary(p_tenant,u,pg_catalog.decode(p_session_digest,'hex'));
 if p_stepup_digest is not null and (p_stepup_digest !~ '^[0-9a-f]{64}$' or not public.account_session_valid(p_tenant,u,pg_catalog.decode(p_session_digest,'hex'),pg_catalog.decode(p_stepup_digest,'hex'))) then raise exception 'XERO_ACCESS_DENIED';end if;
 return u;
end $$;
create function xero_private.fingerprint(p_value jsonb) returns text language sql immutable security invoker set search_path='' as $$select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_value::text,'UTF8')),'hex')$$;
create function xero_private.envelope_valid(p_value text,p_scopes text[],p_expiry timestamptz) returns boolean
language sql stable security invoker set search_path='' as $$select coalesce(p_value ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$' and length(p_value)<=32768 and p_scopes @> array['offline_access','accounting.invoices.read','accounting.payments.read','accounting.settings.read']::text[] and p_scopes <@ array['offline_access','accounting.invoices.read','accounting.payments.read','accounting.settings.read']::text[] and p_expiry>now() and p_expiry<=now()+interval '2 hours',false)$$;
create function xero_private.scope_valid(v jsonb) returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare o jsonb;n integer;names text[];ids text[];
begin
 if jsonb_typeof(v)<>'object' or v-array['categoryId','options']<>'{}'::jsonb or coalesce(v->>'categoryId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or jsonb_typeof(v->'options')<>'array' or jsonb_array_length(v->'options')<>4 then return false;end if;
 for o in select value from jsonb_array_elements(v->'options') loop
  if jsonb_typeof(o)<>'object' or o-array['id','project']<>'{}'::jsonb or coalesce(o->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or coalesce(o->>'project','') not in ('Shopee Hub','Shopee Hub Internal','Tik Tok Hub','Lazada Hub') then return false;end if;
 end loop;
 select count(distinct value->>'id'),array_agg(distinct value->>'project') into n,names from jsonb_array_elements(v->'options');
 return n=4 and cardinality(names)=4;
exception when others then return false;end $$;
create function xero_private.money_valid(v jsonb,p_nullable boolean default false) returns boolean language sql immutable security invoker set search_path='' as $$select coalesce((p_nullable and v='null'::jsonb) or (jsonb_typeof(v)='string' and (v#>>'{}') ~ '^[0-9]{1,24}(\.[0-9]{1,2})?$'),false)$$;

create function public.xero_oauth_begin(p_tenant text,p_actor text,p_session_digest text,p_environment text,p_organisation_id uuid,p_state_digest text,p_expires_at timestamptz,p_stepup_digest text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r xero_private.oauth_states%rowtype;epoch bigint;
begin
 perform xero_private.assert_actor(p_tenant,p_actor,p_session_digest,p_stepup_digest);
 if p_environment is null or p_environment not in ('staging','production') or p_organisation_id is null or p_state_digest is null or p_state_digest !~ '^[0-9a-f]{64}$' or p_expires_at is null or p_expires_at<=clock_timestamp() or p_expires_at>clock_timestamp()+interval '10 minutes' then raise exception 'XERO_INVALID_STATE';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('xero-connect:'||p_tenant||':'||p_environment,0));
 select credential_epoch into epoch from public.xero_connections where tenant_id=p_tenant and environment=p_environment;
 insert into xero_private.oauth_states(tenant_id,actor_email,session_digest,state_digest,environment,organisation_id,expires_at,connection_epoch)
 values(p_tenant,lower(p_actor),p_session_digest,p_state_digest,p_environment,p_organisation_id,p_expires_at,coalesce(epoch,0)) returning * into r;
 return jsonb_build_object('stateId',r.id,'expiresAt',r.expires_at);
end $$;
create function public.xero_oauth_consume(p_tenant text,p_actor text,p_session_digest text,p_environment text,p_organisation_id uuid,p_state_digest text,p_stepup_digest text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r xero_private.oauth_states%rowtype;
begin
 perform xero_private.assert_actor(p_tenant,p_actor,p_session_digest,p_stepup_digest);
 select * into r from xero_private.oauth_states where tenant_id=p_tenant and environment=p_environment and state_digest=p_state_digest for update;
 if not found or r.actor_email<>lower(p_actor) or r.session_digest<>p_session_digest or r.organisation_id is distinct from p_organisation_id or r.consumed_at is not null or r.expires_at<=clock_timestamp() then raise exception 'XERO_INVALID_STATE';end if;
 update xero_private.oauth_states set consumed_at=clock_timestamp() where id=r.id;
 return jsonb_build_object('stateId',r.id);
end $$;
create function xero_private.connection_metadata(c public.xero_connections) returns jsonb language sql stable security invoker set search_path='' as $$select jsonb_build_object('id',c.id,'organisationId',c.organisation_id,'organisationName',c.organisation_name,'environment',c.environment,'status',c.status,'lastSyncedAt',c.last_synced_at,'lastError',c.last_error,'retryAt',c.retry_at,'projectScope',c.project_scope)$$;
create function public.xero_connection_save(p_tenant text,p_actor text,p_session_digest text,p_state_id uuid,p_connection_id uuid,p_organisation_id uuid,p_organisation_name text,p_environment text,p_encrypted_tokens text,p_scopes text[],p_token_expires_at timestamptz,p_stepup_digest text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s xero_private.oauth_states%rowtype;c public.xero_connections%rowtype;fp text;
begin
 perform xero_private.assert_actor(p_tenant,p_actor,p_session_digest,p_stepup_digest);
 select * into s from xero_private.oauth_states where id=p_state_id and tenant_id=p_tenant for update;
 if not found or s.environment is distinct from p_environment or s.organisation_id is distinct from p_organisation_id or s.actor_email<>lower(p_actor) or s.session_digest<>p_session_digest or s.consumed_at is null or s.expires_at<=clock_timestamp() then raise exception 'XERO_INVALID_STATE';end if;
 fp:=xero_private.fingerprint(jsonb_build_array(p_connection_id,p_organisation_id,p_organisation_name,p_environment,p_encrypted_tokens,p_scopes,p_token_expires_at));
 if s.connected_at is not null then
  if s.save_fingerprint is distinct from fp then raise exception 'XERO_REPLAY_CONFLICT';end if;
  select * into c from public.xero_connections where id=s.connection_id and tenant_id=p_tenant;return xero_private.connection_metadata(c);
 end if;
 if p_connection_id is null or p_organisation_name is null or length(p_organisation_name) not between 1 and 240 or not xero_private.envelope_valid(p_encrypted_tokens,p_scopes,p_token_expires_at) then raise exception 'XERO_INVALID_TOKEN';end if;
 -- Serializes first connect and reconnect even before a connection row exists.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('xero-connect:'||p_tenant||':'||p_environment,0));
 select * into c from public.xero_connections where tenant_id=p_tenant and environment=p_environment for update;
 if coalesce(c.credential_epoch,0)<>s.connection_epoch then raise exception 'XERO_STALE_STATE';end if;
 if c.id is not null then
  if c.organisation_id is distinct from p_organisation_id then raise exception 'XERO_ORGANISATION_MISMATCH';end if;
  update public.xero_connections set external_connection_id=p_connection_id,organisation_name=p_organisation_name,status='connected',credential_epoch=credential_epoch+1,updated_at=clock_timestamp(),last_error=null,retry_at=null where id=c.id returning * into c;
  update xero_private.connection_tokens set encrypted_tokens=p_encrypted_tokens,scopes=p_scopes,token_expires_at=p_token_expires_at,token_version=token_version+1,refresh_lease_id=null,refresh_lease_until=null,last_refresh_lease_id=null,last_refresh_fingerprint=null,updated_at=clock_timestamp() where connection_id=c.id and tenant_id=p_tenant;
 else
  insert into public.xero_connections(tenant_id,environment,external_connection_id,organisation_id,organisation_name,created_by) values(p_tenant,p_environment,p_connection_id,p_organisation_id,p_organisation_name,lower(p_actor)) returning * into c;
  insert into xero_private.connection_tokens(tenant_id,connection_id,encrypted_tokens,scopes,token_expires_at) values(p_tenant,c.id,p_encrypted_tokens,p_scopes,p_token_expires_at);
 end if;
 update xero_private.oauth_states set connected_at=clock_timestamp(),save_fingerprint=fp,connection_id=c.id where id=s.id;
 insert into public.account_audit_log(tenant_id,actor_email,action,record_type,record_id,after_value) values(p_tenant,lower(p_actor),'xero.connect','xero_connection',c.id,xero_private.connection_metadata(c));
 return xero_private.connection_metadata(c);
end $$;
create function public.xero_connection_read(p_tenant text,p_actor text,p_session_digest text,p_environment text,p_stepup_digest text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.xero_connections%rowtype;t xero_private.connection_tokens%rowtype;s jsonb;w timestamptz;
begin
 perform xero_private.assert_actor(p_tenant,p_actor,p_session_digest,p_stepup_digest);
 select * into c from public.xero_connections where tenant_id=p_tenant and environment=p_environment;
 if not found then return jsonb_build_object('connection',null);end if;
 select * into t from xero_private.connection_tokens where tenant_id=p_tenant and connection_id=c.id;
 select ss.snapshot,r.watermark into s,w from public.xero_sync_snapshots ss join public.xero_sync_runs r on r.tenant_id=ss.tenant_id and r.id=ss.run_id where ss.tenant_id=p_tenant and ss.connection_id=c.id and r.status='succeeded' order by ss.created_at desc,ss.run_id desc limit 1;
 return jsonb_build_object('connection',xero_private.connection_metadata(c),'encryptedTokens',t.encrypted_tokens,'tokenVersion',t.token_version::text,'tokenExpiresAt',t.token_expires_at,'snapshot',s,'watermark',w);
end $$;
create function public.xero_refresh_claim(p_tenant text,p_actor text,p_session_digest text,p_environment text,p_expected_version bigint,p_lease_id uuid,p_stepup_digest text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.xero_connections%rowtype;t xero_private.connection_tokens%rowtype;
begin
 perform xero_private.assert_actor(p_tenant,p_actor,p_session_digest,p_stepup_digest);
 select * into c from public.xero_connections where tenant_id=p_tenant and environment=p_environment for update;
 if not found or c.status<>'connected' then raise exception 'XERO_RECONNECT_REQUIRED';end if;
 select * into t from xero_private.connection_tokens where tenant_id=p_tenant and connection_id=c.id for update;
 if p_lease_id is null or p_expected_version is null then raise exception 'XERO_INVALID_LEASE';end if;
 if c.retry_at>clock_timestamp() or t.token_version<>p_expected_version or (t.refresh_lease_until>clock_timestamp() and t.refresh_lease_id is distinct from p_lease_id) then return jsonb_build_object('claimed',false,'tokenVersion',t.token_version::text);end if;
 update xero_private.connection_tokens set refresh_lease_id=p_lease_id,refresh_lease_until=clock_timestamp()+interval '90 seconds' where connection_id=c.id;
 return jsonb_build_object('claimed',true,'leaseId',p_lease_id,'tokenVersion',t.token_version::text,'encryptedTokens',t.encrypted_tokens,'tokenExpiresAt',t.token_expires_at);
end $$;
create function public.xero_refresh_complete(p_tenant text,p_actor text,p_session_digest text,p_environment text,p_expected_version bigint,p_lease_id uuid,p_encrypted_tokens text,p_scopes text[],p_token_expires_at timestamptz,p_stepup_digest text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.xero_connections%rowtype;t xero_private.connection_tokens%rowtype;fp text;
begin
 perform xero_private.assert_actor(p_tenant,p_actor,p_session_digest,p_stepup_digest);
 select * into c from public.xero_connections where tenant_id=p_tenant and environment=p_environment for update;
 if not found or c.status<>'connected' then raise exception 'XERO_RECONNECT_REQUIRED';end if;
 select * into t from xero_private.connection_tokens where tenant_id=p_tenant and connection_id=c.id for update;
 fp:=xero_private.fingerprint(jsonb_build_array(p_encrypted_tokens,p_scopes,p_token_expires_at));
 if t.last_refresh_lease_id=p_lease_id and t.token_version=p_expected_version+1 then
  if t.last_refresh_fingerprint is distinct from fp then raise exception 'XERO_REPLAY_CONFLICT';end if;return jsonb_build_object('tokenVersion',t.token_version::text);
 end if;
 if t.token_version is distinct from p_expected_version or t.refresh_lease_id is distinct from p_lease_id or t.refresh_lease_until<=clock_timestamp() or p_lease_id is null then raise exception 'XERO_STALE_LEASE';end if;
 if not xero_private.envelope_valid(p_encrypted_tokens,p_scopes,p_token_expires_at) then raise exception 'XERO_INVALID_TOKEN';end if;
 update xero_private.connection_tokens set encrypted_tokens=p_encrypted_tokens,scopes=p_scopes,token_expires_at=p_token_expires_at,token_version=token_version+1,last_refresh_lease_id=p_lease_id,last_refresh_fingerprint=fp,refresh_lease_id=null,refresh_lease_until=null,updated_at=clock_timestamp() where connection_id=c.id returning * into t;
 insert into public.account_audit_log(tenant_id,actor_email,action,record_type,record_id,after_value) values(p_tenant,lower(p_actor),'xero.refresh','xero_connection',c.id,jsonb_build_object('tokenVersion',t.token_version::text));
 return jsonb_build_object('tokenVersion',t.token_version::text);
end $$;
create function public.xero_refresh_fail(p_tenant text,p_actor text,p_session_digest text,p_environment text,p_expected_version bigint,p_lease_id uuid,p_error_code text,p_retry_after integer,p_stepup_digest text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.xero_connections%rowtype;t xero_private.connection_tokens%rowtype;
begin
 perform xero_private.assert_actor(p_tenant,p_actor,p_session_digest,p_stepup_digest);
 select * into c from public.xero_connections where tenant_id=p_tenant and environment=p_environment for update;
 if not found then raise exception 'XERO_RECONNECT_REQUIRED';end if;
 select * into t from xero_private.connection_tokens where tenant_id=p_tenant and connection_id=c.id for update;
 if p_error_code is null or p_error_code not in ('reconnect','rate_limited','remote_unavailable','invalid_response') or p_retry_after is null or p_retry_after not between 0 and 3600 then raise exception 'XERO_INVALID_FAILURE';end if;
 if t.token_version is distinct from p_expected_version or t.refresh_lease_id is distinct from p_lease_id or t.refresh_lease_until<=clock_timestamp() or p_lease_id is null then raise exception 'XERO_STALE_LEASE';end if;
 update xero_private.connection_tokens set refresh_lease_id=null,refresh_lease_until=null where connection_id=c.id;
 update public.xero_connections set status=case when p_error_code='reconnect' then 'reconnect_required' else status end,last_error=p_error_code,retry_at=clock_timestamp()+make_interval(secs=>p_retry_after),updated_at=clock_timestamp() where id=c.id;
 return jsonb_build_object('status',case when p_error_code='reconnect' then 'reconnect_required' else c.status end);
end $$;
create function public.xero_sync_claim(p_tenant text,p_actor text,p_session_digest text,p_environment text,p_request_id uuid,p_stepup_digest text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.xero_connections%rowtype;r public.xero_sync_runs%rowtype;s jsonb;w timestamptz;
begin
 perform xero_private.assert_actor(p_tenant,p_actor,p_session_digest,p_stepup_digest);
 select * into c from public.xero_connections where tenant_id=p_tenant and environment=p_environment for update;
 if not found or c.status<>'connected' then raise exception 'XERO_RECONNECT_REQUIRED';end if;
 if p_request_id is null then raise exception 'XERO_INVALID_REQUEST';end if;
 select * into r from public.xero_sync_runs where tenant_id=p_tenant and request_id=p_request_id;
 if found then
  if r.connection_id<>c.id or r.actor_email<>lower(p_actor) then raise exception 'XERO_REPLAY_CONFLICT';end if;
  return jsonb_build_object('claimed',false,'runId',r.id,'status',r.status);
 end if;
 if c.retry_at>clock_timestamp() or exists(select 1 from public.xero_sync_runs where tenant_id=p_tenant and connection_id=c.id and status='running' and lease_until>clock_timestamp()) then return jsonb_build_object('claimed',false,'status','busy');end if;
 insert into public.xero_sync_runs(tenant_id,connection_id,request_id,actor_email,lease_id,lease_until,credential_epoch) values(p_tenant,c.id,p_request_id,lower(p_actor),gen_random_uuid(),clock_timestamp()+interval '15 minutes',c.credential_epoch) returning * into r;
 select ss.snapshot,sr.watermark into s,w from public.xero_sync_snapshots ss join public.xero_sync_runs sr on sr.tenant_id=ss.tenant_id and sr.id=ss.run_id where ss.tenant_id=p_tenant and ss.connection_id=c.id and sr.status='succeeded' order by ss.created_at desc,ss.run_id desc limit 1;
 return jsonb_build_object('claimed',true,'runId',r.id,'leaseId',r.lease_id,'startedAt',r.started_at,'baseSnapshot',s,'watermark',w);
end $$;

-- This is a filtered SOURCE snapshot, never a raw Xero response or a ledger write.
create function xero_private.snapshot_valid(v jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare r jsonb;x jsonb;k text;pair record;ids text[]:=array[]::text[];payment_ids text[]:=array[]::text[];n integer;pending integer:=0;eligible integer:=0;
 projects text[]:=array['Shopee Hub','Shopee Hub Internal','Tik Tok Hub','Lazada Hub'];
 uuid_pattern text:='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
 if v is null or jsonb_typeof(v)<>'object' or octet_length(v::text)>8000000 or not(v ?& array['month','today','scope','report']) or v-array['month','today','scope','report']<>'{}'::jsonb or coalesce(v->>'month','') !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' or coalesce(v->>'today','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' or not xero_private.scope_valid(v->'scope') then return false;end if;
 perform (v->>'today')::date;
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

create function public.xero_sync_complete(p_tenant text,p_actor text,p_session_digest text,p_environment text,p_run_id uuid,p_lease_id uuid,p_snapshot jsonb,p_watermark timestamptz,p_stepup_digest text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.xero_connections%rowtype;r public.xero_sync_runs%rowtype;fp text;prior_watermark timestamptz;
begin
 perform xero_private.assert_actor(p_tenant,p_actor,p_session_digest,p_stepup_digest);
 select * into c from public.xero_connections where tenant_id=p_tenant and environment=p_environment for update;
 if not found or c.status<>'connected' then raise exception 'XERO_RECONNECT_REQUIRED';end if;
 select * into r from public.xero_sync_runs where tenant_id=p_tenant and connection_id=c.id and id=p_run_id for update;
 if not found or r.actor_email<>lower(p_actor) or r.lease_id is distinct from p_lease_id or p_lease_id is null then raise exception 'XERO_STALE_LEASE';end if;
 fp:=xero_private.fingerprint(jsonb_build_array(p_snapshot,p_watermark));
 if r.status='succeeded' then
  if r.snapshot_fingerprint is distinct from fp then raise exception 'XERO_REPLAY_CONFLICT';end if;
  return jsonb_build_object('runId',r.id,'completedAt',r.completed_at);
 end if;
 if r.status<>'running' or r.lease_until<=clock_timestamp() or r.credential_epoch<>c.credential_epoch then raise exception 'XERO_STALE_LEASE';end if;
 if not xero_private.snapshot_valid(p_snapshot) then raise exception 'XERO_INVALID_SNAPSHOT';end if;
 if c.project_scope is not null and c.project_scope is distinct from p_snapshot->'scope' then raise exception 'XERO_SCOPE_CHANGED';end if;
 select max(watermark) into prior_watermark from public.xero_sync_runs where tenant_id=p_tenant and connection_id=c.id and status='succeeded';
 if p_watermark is null or p_watermark>r.started_at or (prior_watermark is not null and p_watermark<prior_watermark) then raise exception 'XERO_INVALID_WATERMARK';end if;
 insert into public.xero_sync_snapshots(run_id,tenant_id,connection_id,snapshot) values(r.id,p_tenant,c.id,p_snapshot);
 update public.xero_sync_runs set status='succeeded',completed_at=clock_timestamp(),watermark=p_watermark,snapshot_fingerprint=fp where id=r.id returning * into r;
 update public.xero_connections set project_scope=coalesce(project_scope,p_snapshot->'scope'),last_synced_at=r.completed_at,last_error=null,retry_at=null,updated_at=r.completed_at where id=c.id;
 insert into public.account_audit_log(tenant_id,actor_email,action,record_type,record_id,after_value) values(p_tenant,lower(p_actor),'xero.sync','xero_sync_run',r.id,jsonb_build_object('connectionId',c.id,'snapshotMonth',p_snapshot->>'month','watermark',p_watermark));
 return jsonb_build_object('runId',r.id,'completedAt',r.completed_at);
end $$;
create function public.xero_sync_fail(p_tenant text,p_actor text,p_session_digest text,p_environment text,p_run_id uuid,p_lease_id uuid,p_error_code text,p_retry_after integer,p_stepup_digest text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.xero_connections%rowtype;r public.xero_sync_runs%rowtype;
begin
 perform xero_private.assert_actor(p_tenant,p_actor,p_session_digest,p_stepup_digest);
 select * into c from public.xero_connections where tenant_id=p_tenant and environment=p_environment for update;
 if not found then raise exception 'XERO_RECONNECT_REQUIRED';end if;
 select * into r from public.xero_sync_runs where tenant_id=p_tenant and connection_id=c.id and id=p_run_id for update;
 if not found or r.actor_email<>lower(p_actor) or r.lease_id is distinct from p_lease_id or r.credential_epoch<>c.credential_epoch or p_lease_id is null or r.status='succeeded' or (r.status='running' and r.lease_until<=clock_timestamp()) then raise exception 'XERO_STALE_LEASE';end if;
 if p_error_code is null or p_error_code not in ('reconnect','rate_limited','remote_unavailable','invalid_response','invalid_source','sync_limit','scope_changed') or p_retry_after is null or p_retry_after not between 0 and 3600 then raise exception 'XERO_INVALID_FAILURE';end if;
 if r.status='failed' then
  if r.error_code<>p_error_code then raise exception 'XERO_REPLAY_CONFLICT';end if;
  return jsonb_build_object('runId',r.id,'status',r.status);
 end if;
 update public.xero_sync_runs set status='failed',completed_at=clock_timestamp(),error_code=p_error_code where id=r.id;
 update public.xero_connections set status=case when p_error_code='reconnect' then 'reconnect_required' else status end,last_error=p_error_code,retry_at=clock_timestamp()+make_interval(secs=>p_retry_after),updated_at=clock_timestamp() where id=c.id;
 return jsonb_build_object('runId',r.id,'status','failed');
end $$;
-- No browser policies or default EXECUTE access. Invoker functions receive only the
-- exact DML grants above; immutable snapshots never receive UPDATE/DELETE/TRUNCATE.
do $$declare routine record;begin
 for routine in select n.nspname,p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid) args from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where (n.nspname='xero_private' or (n.nspname='public' and p.proname like 'xero_%')) loop
  execute format('revoke all on function %I.%I(%s) from public,anon,authenticated,service_role',routine.nspname,routine.proname,routine.args);
  execute format('grant execute on function %I.%I(%s) to service_role',routine.nspname,routine.proname,routine.args);
 end loop;
end $$;
commit;
