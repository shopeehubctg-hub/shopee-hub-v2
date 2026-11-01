-- Schema-only snapshot of reviewed isolated Staging security design, 2026-10-29.
-- Fresh Production installation only. No credential/session/audit/business rows copied.
-- Execute transactionally; no DROP or DELETE. Owner assignment is separate.
begin;
create schema account_security;
revoke all on schema account_security from public, anon, authenticated;
grant usage on schema account_security to service_role;
alter table public.tenants add column account_security_owner_user_id bigint;
alter table public.customer_users add constraint customer_users_tenant_id_id_key UNIQUE (tenant_id, id);
create table account_security.account_auth_attempts (id uuid not null,
tenant_id text not null,
user_id bigint not null,
request_id uuid not null,
credential_version bigint not null,
attempt_epoch bigint not null,
primary_session_digest bytea not null,
reserved_at timestamp with time zone default now() not null,
expires_at timestamp with time zone not null,
finished_at timestamp with time zone,
status text not null);
create table account_security.account_credentials (tenant_id text not null,
user_id bigint not null,
password_hash text,
credential_version bigint default 0 not null,
attempt_epoch bigint default 0 not null,
enrolled_at timestamp with time zone,
rotated_at timestamp with time zone,
updated_at timestamp with time zone default now() not null,
attempts_in_window integer default 0 not null,
attempt_window_started_at timestamp with time zone,
locked_until timestamp with time zone);
create table account_security.account_enrollment_challenges (id uuid not null,
tenant_id text not null,
target_user_id bigint not null,
approved_by_user_id bigint,
purpose text not null,
status text not null,
target_primary_session_digest bytea not null,
request_id uuid not null,
credential_version bigint not null,
requested_at timestamp with time zone default now() not null,
approved_at timestamp with time zone,
decision_request_id uuid,
expires_at timestamp with time zone not null,
consumed_at timestamp with time zone,
consumed_request_id uuid,
revoked_at timestamp with time zone,
expired_at timestamp with time zone);
create table account_security.account_security_audit (id uuid not null,
tenant_id text not null,
user_id bigint not null,
actor_user_id bigint,
request_id uuid,
operation_stage text not null,
event_type text not null,
outcome text not null,
related_id uuid,
occurred_at timestamp with time zone default now() not null,
revoked_session_count integer);
create table account_security.account_stepup_sessions (id uuid not null,
tenant_id text not null,
user_id bigint not null,
token_digest bytea not null,
primary_session_digest bytea not null,
credential_version bigint not null,
issued_at timestamp with time zone default now() not null,
expires_at timestamp with time zone not null,
revoked_at timestamp with time zone);
create table account_security.portal_auth_sessions (session_digest bytea not null,
tenant_id text not null,
user_id bigint not null,
request_id uuid not null,
auth_method text not null,
issued_at timestamp with time zone default now() not null,
expires_at timestamp with time zone not null,
revoked_at timestamp with time zone);
alter table account_security.account_credentials add constraint account_credentials_credential_version_check CHECK ((credential_version >= 0));
alter table account_security.account_credentials add constraint account_credentials_attempt_epoch_check CHECK ((attempt_epoch >= 0));
alter table account_security.account_credentials add constraint account_credentials_attempts_in_window_check CHECK ((attempts_in_window >= 0));
alter table account_security.account_credentials add constraint account_credentials_check CHECK ((((password_hash IS NULL) AND (credential_version = 0) AND (enrolled_at IS NULL)) OR ((password_hash IS NOT NULL) AND ((length(password_hash) >= 50) AND (length(password_hash) <= 200)) AND (credential_version > 0) AND (enrolled_at IS NOT NULL))));
alter table account_security.account_credentials add constraint account_credentials_pkey PRIMARY KEY (tenant_id, user_id);
alter table account_security.portal_auth_sessions add constraint portal_auth_sessions_session_digest_check CHECK ((octet_length(session_digest) = 32));
alter table account_security.portal_auth_sessions add constraint portal_auth_sessions_auth_method_check CHECK ((auth_method = ANY (ARRAY['password'::text, 'email_link'::text, 'trusted_proxy'::text])));
alter table account_security.portal_auth_sessions add constraint portal_auth_sessions_check CHECK (((expires_at > issued_at) AND (expires_at <= (issued_at + '7 days'::interval))));
alter table account_security.portal_auth_sessions add constraint portal_auth_sessions_check1 CHECK (((revoked_at IS NULL) OR (revoked_at >= issued_at)));
alter table account_security.portal_auth_sessions add constraint portal_auth_sessions_pkey PRIMARY KEY (session_digest);
alter table account_security.portal_auth_sessions add constraint portal_auth_sessions_tenant_id_user_id_session_digest_key UNIQUE (tenant_id, user_id, session_digest);
alter table account_security.portal_auth_sessions add constraint portal_auth_sessions_tenant_id_user_id_request_id_key UNIQUE (tenant_id, user_id, request_id);
alter table account_security.account_auth_attempts add constraint account_auth_attempts_credential_version_check CHECK ((credential_version >= 0));
alter table account_security.account_auth_attempts add constraint account_auth_attempts_attempt_epoch_check CHECK ((attempt_epoch >= 0));
alter table account_security.account_auth_attempts add constraint account_auth_attempts_primary_session_digest_check CHECK ((octet_length(primary_session_digest) = 32));
alter table account_security.account_auth_attempts add constraint account_auth_attempts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'succeeded'::text, 'failed'::text, 'stale'::text, 'expired'::text])));
alter table account_security.account_auth_attempts add constraint account_auth_attempts_check CHECK (((expires_at > reserved_at) AND (expires_at <= (reserved_at + '00:05:00'::interval))));
alter table account_security.account_auth_attempts add constraint account_auth_attempts_check1 CHECK ((((status = 'pending'::text) AND (finished_at IS NULL)) OR ((status <> 'pending'::text) AND (finished_at IS NOT NULL))));
alter table account_security.account_auth_attempts add constraint account_auth_attempts_pkey PRIMARY KEY (id);
alter table account_security.account_auth_attempts add constraint account_auth_attempts_tenant_id_user_id_request_id_key UNIQUE (tenant_id, user_id, request_id);
alter table account_security.account_stepup_sessions add constraint account_stepup_sessions_token_digest_check CHECK ((octet_length(token_digest) = 32));
alter table account_security.account_stepup_sessions add constraint account_stepup_sessions_primary_session_digest_check CHECK ((octet_length(primary_session_digest) = 32));
alter table account_security.account_stepup_sessions add constraint account_stepup_sessions_credential_version_check CHECK ((credential_version > 0));
alter table account_security.account_enrollment_challenges add constraint account_enrollment_challenges_check1 CHECK (((consumed_at IS NULL) = (consumed_request_id IS NULL)));
alter table account_security.account_stepup_sessions add constraint account_stepup_sessions_check1 CHECK (((revoked_at IS NULL) OR (revoked_at >= issued_at)));
alter table account_security.account_stepup_sessions add constraint account_stepup_sessions_pkey PRIMARY KEY (id);
alter table account_security.account_stepup_sessions add constraint account_stepup_sessions_token_digest_key UNIQUE (token_digest);
alter table account_security.account_enrollment_challenges add constraint account_enrollment_challenges_purpose_check CHECK ((purpose = ANY (ARRAY['enroll'::text, 'reset'::text])));
alter table account_security.account_enrollment_challenges add constraint account_enrollment_challenges_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'consumed'::text, 'rejected'::text, 'revoked'::text, 'expired'::text])));
alter table account_security.account_enrollment_challenges add constraint account_enrollment_challenge_target_primary_session_diges_check CHECK ((octet_length(target_primary_session_digest) = 32));
alter table account_security.account_enrollment_challenges add constraint account_enrollment_challenges_credential_version_check CHECK ((credential_version >= 0));
alter table account_security.account_enrollment_challenges add constraint account_enrollment_challenges_check CHECK (((expires_at > requested_at) AND (expires_at <= (requested_at + '00:30:00'::interval))));
alter table account_security.account_enrollment_challenges add constraint account_enrollment_challenges_check2 CHECK ((((approved_by_user_id IS NULL) AND (approved_at IS NULL)) OR ((approved_by_user_id IS NOT NULL) AND (approved_at IS NOT NULL))));
alter table account_security.account_enrollment_challenges add constraint account_enrollment_challenges_check3 CHECK ((((status = 'pending'::text) AND (approved_at IS NULL) AND (decision_request_id IS NULL)) OR ((status = 'rejected'::text) AND (approved_at IS NULL) AND (decision_request_id IS NOT NULL)) OR ((status = ANY (ARRAY['approved'::text, 'consumed'::text])) AND (approved_at IS NOT NULL) AND (decision_request_id IS NOT NULL)) OR ((status = ANY (ARRAY['revoked'::text, 'expired'::text])) AND (((approved_at IS NULL) AND (decision_request_id IS NULL)) OR ((approved_at IS NOT NULL) AND (decision_request_id IS NOT NULL))))));
alter table account_security.account_enrollment_challenges add constraint account_enrollment_challenges_check4 CHECK (((status = 'consumed'::text) = (consumed_at IS NOT NULL)));
alter table account_security.account_enrollment_challenges add constraint account_enrollment_challenges_check5 CHECK (((status = 'revoked'::text) = (revoked_at IS NOT NULL)));
alter table account_security.account_enrollment_challenges add constraint account_enrollment_challenges_check6 CHECK (((status = 'expired'::text) = (expired_at IS NOT NULL)));
alter table account_security.account_enrollment_challenges add constraint account_enrollment_challenges_pkey PRIMARY KEY (id);
alter table account_security.account_enrollment_challenges add constraint account_enrollment_challenges_tenant_id_request_id_key UNIQUE (tenant_id, request_id);
alter table account_security.account_security_audit add constraint account_security_audit_pkey PRIMARY KEY (id);
alter table account_security.account_stepup_sessions add constraint account_stepup_sessions_primary_window_check CHECK (((expires_at > issued_at) AND (expires_at <= (issued_at + '7 days'::interval))));
alter table account_security.account_security_audit add constraint account_security_audit_revoked_session_count_check CHECK (((revoked_session_count IS NULL) OR (revoked_session_count > 0)));
alter table public.tenants add constraint tenants_account_security_owner_fk FOREIGN KEY (id, account_security_owner_user_id) REFERENCES public.customer_users(tenant_id, id);
alter table account_security.account_credentials add constraint account_credentials_tenant_id_user_id_fkey FOREIGN KEY (tenant_id, user_id) REFERENCES public.customer_users(tenant_id, id);
alter table account_security.portal_auth_sessions add constraint portal_auth_sessions_tenant_id_user_id_fkey FOREIGN KEY (tenant_id, user_id) REFERENCES public.customer_users(tenant_id, id);
alter table account_security.account_auth_attempts add constraint account_auth_attempts_tenant_id_user_id_fkey FOREIGN KEY (tenant_id, user_id) REFERENCES account_security.account_credentials(tenant_id, user_id);
alter table account_security.account_auth_attempts add constraint account_auth_attempts_tenant_id_user_id_primary_session_di_fkey FOREIGN KEY (tenant_id, user_id, primary_session_digest) REFERENCES account_security.portal_auth_sessions(tenant_id, user_id, session_digest);
alter table account_security.account_stepup_sessions add constraint account_stepup_sessions_tenant_id_user_id_fkey FOREIGN KEY (tenant_id, user_id) REFERENCES account_security.account_credentials(tenant_id, user_id);
alter table account_security.account_stepup_sessions add constraint account_stepup_sessions_tenant_id_user_id_primary_session__fkey FOREIGN KEY (tenant_id, user_id, primary_session_digest) REFERENCES account_security.portal_auth_sessions(tenant_id, user_id, session_digest);
alter table account_security.account_enrollment_challenges add constraint account_enrollment_challenges_tenant_id_target_user_id_fkey FOREIGN KEY (tenant_id, target_user_id) REFERENCES public.customer_users(tenant_id, id);
alter table account_security.account_enrollment_challenges add constraint account_enrollment_challenges_tenant_id_approved_by_user_i_fkey FOREIGN KEY (tenant_id, approved_by_user_id) REFERENCES public.customer_users(tenant_id, id);
alter table account_security.account_enrollment_challenges add constraint account_enrollment_challenges_tenant_id_target_user_id_tar_fkey FOREIGN KEY (tenant_id, target_user_id, target_primary_session_digest) REFERENCES account_security.portal_auth_sessions(tenant_id, user_id, session_digest);
alter table account_security.account_security_audit add constraint account_security_audit_tenant_id_user_id_fkey FOREIGN KEY (tenant_id, user_id) REFERENCES public.customer_users(tenant_id, id);
alter table account_security.account_security_audit add constraint account_security_audit_tenant_id_actor_user_id_fkey FOREIGN KEY (tenant_id, actor_user_id) REFERENCES public.customer_users(tenant_id, id);
CREATE UNIQUE INDEX account_security_audit_request_stage_idx ON account_security.account_security_audit USING btree (tenant_id, user_id, request_id, operation_stage) WHERE (request_id IS NOT NULL);
CREATE INDEX account_stepup_sessions_primary_idx ON account_security.account_stepup_sessions USING btree (primary_session_digest);
CREATE INDEX account_auth_attempts_user_status_exp_idx ON account_security.account_auth_attempts USING btree (tenant_id, user_id, status, expires_at);
CREATE UNIQUE INDEX account_enrollment_challenges_active_idx ON account_security.account_enrollment_challenges USING btree (tenant_id, target_user_id) WHERE (status = ANY (ARRAY['pending'::text, 'approved'::text]));
CREATE INDEX account_security_audit_user_time_idx ON account_security.account_security_audit USING btree (tenant_id, user_id, occurred_at DESC);
CREATE INDEX account_stepup_sessions_user_exp_idx ON account_security.account_stepup_sessions USING btree (tenant_id, user_id, expires_at);
CREATE INDEX portal_auth_sessions_user_exp_idx ON account_security.portal_auth_sessions USING btree (tenant_id, user_id, expires_at);
alter table account_security.account_auth_attempts enable row level security;
revoke all on account_security.account_auth_attempts from public,anon,authenticated,service_role;
grant select,insert,update on account_security.account_auth_attempts to service_role;
alter table account_security.account_credentials enable row level security;
revoke all on account_security.account_credentials from public,anon,authenticated,service_role;
grant select,insert,update on account_security.account_credentials to service_role;
alter table account_security.account_enrollment_challenges enable row level security;
revoke all on account_security.account_enrollment_challenges from public,anon,authenticated,service_role;
grant select,insert,update on account_security.account_enrollment_challenges to service_role;
alter table account_security.account_security_audit enable row level security;
revoke all on account_security.account_security_audit from public,anon,authenticated,service_role;
grant insert on account_security.account_security_audit to service_role;
alter table account_security.account_stepup_sessions enable row level security;
revoke all on account_security.account_stepup_sessions from public,anon,authenticated,service_role;
grant select,insert,update on account_security.account_stepup_sessions to service_role;
alter table account_security.portal_auth_sessions enable row level security;
revoke all on account_security.portal_auth_sessions from public,anon,authenticated,service_role;
grant select,insert,update on account_security.portal_auth_sessions to service_role;
grant select on public.tenants,public.customer_users to service_role;
CREATE OR REPLACE FUNCTION account_security.assert_member(p_tenant_id text, p_user_id bigint, p_superadmin boolean)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  -- Read-only: service_role has no UPDATE on these existing public tables.
  -- A concurrent role change may commit after this check; all later Account
  -- access checks re-read the current role, and challenge consume rechecks.
  perform 1 from public.tenants t where t.id = p_tenant_id and t.active;
  if not found then raise exception 'ACCOUNT_TENANT_DENIED'; end if;
  perform 1 from public.customer_users u
    where u.tenant_id = p_tenant_id and u.id = p_user_id and u.active
      and (not p_superadmin or u.role = 'superadmin');
  if not found then raise exception 'ACCOUNT_MEMBER_DENIED'; end if;
end;
$function$
;
revoke all on function account_security.assert_member(p_tenant_id text, p_user_id bigint, p_superadmin boolean) from public,anon,authenticated;
grant execute on function account_security.assert_member(p_tenant_id text, p_user_id bigint, p_superadmin boolean) to service_role;
CREATE OR REPLACE FUNCTION account_security.assert_primary(p_tenant_id text, p_user_id bigint, p_session_digest bytea)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_session account_security.portal_auth_sessions%rowtype;
begin
  if p_session_digest is null or octet_length(p_session_digest) <> 32 then
    raise exception 'ACCOUNT_PRIMARY_DENIED';
  end if;
  select * into v_session from account_security.portal_auth_sessions s
    where s.tenant_id = p_tenant_id and s.user_id = p_user_id
      and s.session_digest = p_session_digest
      for share;
  if not found or v_session.revoked_at is not null
     or v_session.expires_at <= clock_timestamp() then
    raise exception 'ACCOUNT_PRIMARY_DENIED';
  end if;
end;
$function$
;
revoke all on function account_security.assert_primary(p_tenant_id text, p_user_id bigint, p_session_digest bytea) from public,anon,authenticated;
grant execute on function account_security.assert_primary(p_tenant_id text, p_user_id bigint, p_session_digest bytea) to service_role;
CREATE OR REPLACE FUNCTION public.account_consume_challenge(p_tenant_id text, p_target_user_id bigint, p_primary_digest bytea, p_challenge_id uuid, p_new_password_hash text, p_expected_credential_version bigint, p_request_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_cred account_security.account_credentials%rowtype;
        v_challenge account_security.account_enrollment_challenges%rowtype;
        v_primary_expires_at timestamptz;
        v_clock timestamptz;
begin
  perform account_security.assert_member(p_tenant_id,p_target_user_id,true);
  perform account_security.assert_primary(p_tenant_id,p_target_user_id,p_primary_digest);
  if p_request_id is null or p_challenge_id is null
     or p_expected_credential_version is null or p_expected_credential_version < 0
     or p_new_password_hash is null
     or p_new_password_hash !~ '^scrypt[$]v1[$]32768[$]8[$]3[$]'
     or length(p_new_password_hash) > 200 then raise exception 'ACCOUNT_INPUT_INVALID'; end if;
  select * into v_cred from account_security.account_credentials
    where tenant_id = p_tenant_id and user_id = p_target_user_id for update;
  if not found then raise exception 'ACCOUNT_CREDENTIAL_DENIED'; end if;
  select * into v_challenge from account_security.account_enrollment_challenges
    where tenant_id = p_tenant_id and target_user_id = p_target_user_id
      and id = p_challenge_id for update;
  if not found then raise exception 'ACCOUNT_CHALLENGE_DENIED'; end if;
  -- A replay never means that this request's candidate became the password.
  if v_challenge.status = 'consumed' then
    return 'already_consumed';
  end if;
  select expires_at into v_primary_expires_at from account_security.portal_auth_sessions
    where tenant_id = p_tenant_id and user_id = p_target_user_id
      and session_digest = p_primary_digest;
  v_clock := clock_timestamp();
  if v_primary_expires_at <= v_clock
     or v_challenge.target_primary_session_digest <> p_primary_digest then
    raise exception 'ACCOUNT_CHALLENGE_DENIED';
  end if;
  if v_challenge.expires_at <= v_clock and v_challenge.status in ('pending','approved') then
    update account_security.account_enrollment_challenges
      set status = 'expired', expired_at = v_clock where id = v_challenge.id;
    return 'expired';
  end if;
  if v_challenge.status <> 'approved' then
    raise exception 'ACCOUNT_CHALLENGE_DENIED';
  end if;
  if v_cred.credential_version <> p_expected_credential_version
     or v_challenge.credential_version <> v_cred.credential_version then
    raise exception 'ACCOUNT_VERSION_CONFLICT';
  end if;
  perform 1 from public.tenants t
    join public.customer_users u
      on u.tenant_id = t.id and u.id = v_challenge.approved_by_user_id
    where t.id = p_tenant_id and t.active
      and t.account_security_owner_user_id = u.id
      and u.active and u.role = 'superadmin';
  if not found then raise exception 'ACCOUNT_OWNER_DENIED'; end if;
  if v_challenge.purpose = 'enroll' and v_cred.password_hash is not null then
    raise exception 'ACCOUNT_ALREADY_ENROLLED';
  end if;
  if v_challenge.purpose = 'reset' and v_cred.password_hash is null then
    raise exception 'ACCOUNT_NOT_ENROLLED';
  end if;
  update account_security.account_credentials
    set password_hash = p_new_password_hash,
      credential_version = credential_version + 1,
      attempt_epoch = attempt_epoch + 1,
      attempts_in_window = 0, attempt_window_started_at = null,
      locked_until = null,
      enrolled_at = coalesce(enrolled_at,v_clock), rotated_at = v_clock,
      updated_at = v_clock
    where tenant_id = p_tenant_id and user_id = p_target_user_id;
  update account_security.account_enrollment_challenges
    set status = 'consumed', consumed_at = v_clock, consumed_request_id = p_request_id
    where id = v_challenge.id;
  -- Credential lock serializes issue/consume for this target. Any other
  -- unconsumed challenge, including the other purpose, must be invalidated.
  update account_security.account_enrollment_challenges
    set status = 'revoked', revoked_at = v_clock
    where tenant_id = p_tenant_id and target_user_id = p_target_user_id
      and id <> v_challenge.id and status in ('pending','approved');
  update account_security.account_stepup_sessions set revoked_at = v_clock
    where tenant_id = p_tenant_id and user_id = p_target_user_id and revoked_at is null;
  insert into account_security.account_security_audit
    (id,tenant_id,user_id,actor_user_id,request_id,operation_stage,event_type,outcome,related_id)
    values (gen_random_uuid(),p_tenant_id,p_target_user_id,p_target_user_id,p_request_id,
      'challenge_consume',v_challenge.purpose,'ok',v_challenge.id);
  return 'ok';
end;
$function$
;
revoke all on function public.account_consume_challenge(p_tenant_id text, p_target_user_id bigint, p_primary_digest bytea, p_challenge_id uuid, p_new_password_hash text, p_expected_credential_version bigint, p_request_id uuid) from public,anon,authenticated;
grant execute on function public.account_consume_challenge(p_tenant_id text, p_target_user_id bigint, p_primary_digest bytea, p_challenge_id uuid, p_new_password_hash text, p_expected_credential_version bigint, p_request_id uuid) to service_role;
CREATE OR REPLACE FUNCTION public.account_decide_challenge(p_tenant_id text, p_owner_user_id bigint, p_owner_primary_digest bytea, p_challenge_id uuid, p_decision text, p_request_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_challenge account_security.account_enrollment_challenges%rowtype;
        v_cred account_security.account_credentials%rowtype;
        v_session account_security.portal_auth_sessions%rowtype;
        v_owner_session_ok boolean := false;
        v_target_session_ok boolean := false;
        v_owner_expires_at timestamptz;
        v_target_expires_at timestamptz;
        v_clock timestamptz;
begin
  if p_challenge_id is null or p_request_id is null
     or p_decision is null or p_decision not in ('approve','reject')
     or p_owner_primary_digest is null
     or octet_length(p_owner_primary_digest) <> 32 then
    raise exception 'ACCOUNT_INPUT_INVALID';
  end if;
  perform 1 from public.tenants
    where id = p_tenant_id and active
      and account_security_owner_user_id = p_owner_user_id;
  if not found then raise exception 'ACCOUNT_OWNER_DENIED'; end if;
  perform account_security.assert_member(p_tenant_id,p_owner_user_id,true);
  -- Read challenge identity before locks; re-read it FOR UPDATE after the
  -- target credential lock. This first read gives no approval authority.
  select * into v_challenge from account_security.account_enrollment_challenges
    where tenant_id = p_tenant_id and id = p_challenge_id;
  if not found then raise exception 'ACCOUNT_CHALLENGE_DENIED'; end if;
  perform account_security.assert_member(p_tenant_id,v_challenge.target_user_id,true);
  -- Lock both main sessions in digest order. This also covers owner=target
  -- with two different sessions, without reversing another approval's order.
  for v_session in
    select s.* from account_security.portal_auth_sessions s
    where (s.tenant_id = p_tenant_id and s.user_id = p_owner_user_id
           and s.session_digest = p_owner_primary_digest)
       or (s.tenant_id = p_tenant_id and s.user_id = v_challenge.target_user_id
           and s.session_digest = v_challenge.target_primary_session_digest)
    order by s.session_digest for share
  loop
    if v_session.revoked_at is null and v_session.expires_at > clock_timestamp() then
      if v_session.user_id = p_owner_user_id
         and v_session.session_digest = p_owner_primary_digest then
        v_owner_session_ok := true;
        v_owner_expires_at := v_session.expires_at;
      end if;
      if v_session.user_id = v_challenge.target_user_id
         and v_session.session_digest = v_challenge.target_primary_session_digest then
        v_target_session_ok := true;
        v_target_expires_at := v_session.expires_at;
      end if;
    end if;
  end loop;
  if not v_owner_session_ok or not v_target_session_ok then
    raise exception 'ACCOUNT_PRIMARY_DENIED';
  end if;
  select * into v_cred from account_security.account_credentials
    where tenant_id = p_tenant_id and user_id = v_challenge.target_user_id for update;
  if not found then raise exception 'ACCOUNT_CREDENTIAL_DENIED'; end if;
  select * into v_challenge from account_security.account_enrollment_challenges
    where tenant_id = p_tenant_id and id = p_challenge_id for update;
  if not found then raise exception 'ACCOUNT_CHALLENGE_DENIED'; end if;
  v_clock := clock_timestamp();
  if v_owner_expires_at <= v_clock or v_target_expires_at <= v_clock then
    raise exception 'ACCOUNT_PRIMARY_DENIED';
  end if;
  if v_challenge.expires_at <= v_clock and v_challenge.status in ('pending','approved') then
    update account_security.account_enrollment_challenges
      set status = 'expired', expired_at = v_clock where id = p_challenge_id;
    return 'expired';
  end if;
  if v_challenge.status <> 'pending' then
    if v_challenge.decision_request_id = p_request_id
       and ((p_decision = 'approve' and v_challenge.status = 'approved')
         or (p_decision = 'reject' and v_challenge.status = 'rejected')) then
      return v_challenge.status;
    end if;
    raise exception 'ACCOUNT_DECISION_CONFLICT';
  end if;
  if v_challenge.credential_version <> v_cred.credential_version then
    raise exception 'ACCOUNT_VERSION_CONFLICT';
  end if;
  if (v_challenge.purpose = 'enroll' and v_cred.password_hash is not null)
     or (v_challenge.purpose = 'reset' and v_cred.password_hash is null) then
    raise exception 'ACCOUNT_PURPOSE_CONFLICT';
  end if;
  update account_security.account_enrollment_challenges
    set status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
        approved_by_user_id = case when p_decision = 'approve' then p_owner_user_id else null end,
        approved_at = case when p_decision = 'approve' then v_clock else null end,
        decision_request_id = p_request_id
    where id = p_challenge_id;
  insert into account_security.account_security_audit
    (id,tenant_id,user_id,actor_user_id,request_id,operation_stage,event_type,outcome,related_id)
    values (gen_random_uuid(),p_tenant_id,v_challenge.target_user_id,p_owner_user_id,p_request_id,
      'challenge_decide',v_challenge.purpose,p_decision,p_challenge_id);
  return case when p_decision = 'approve' then 'approved' else 'rejected' end;
end;
$function$
;
revoke all on function public.account_decide_challenge(p_tenant_id text, p_owner_user_id bigint, p_owner_primary_digest bytea, p_challenge_id uuid, p_decision text, p_request_id uuid) from public,anon,authenticated;
grant execute on function public.account_decide_challenge(p_tenant_id text, p_owner_user_id bigint, p_owner_primary_digest bytea, p_challenge_id uuid, p_decision text, p_request_id uuid) to service_role;
CREATE OR REPLACE FUNCTION public.account_finish_attempt(p_tenant_id text, p_user_id bigint, p_primary_digest bytea, p_request_id uuid, p_verified boolean, p_token_digest bytea, p_stepup_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_cred account_security.account_credentials%rowtype;
        v_attempt account_security.account_auth_attempts%rowtype;
        v_primary_expires_at timestamptz;
        v_clock timestamptz;
        v_outcome text;
begin
  perform account_security.assert_member(p_tenant_id,p_user_id,true);
  perform account_security.assert_primary(p_tenant_id,p_user_id,p_primary_digest);
  select * into v_cred from account_security.account_credentials
    where tenant_id = p_tenant_id and user_id = p_user_id for update;
  if not found then raise exception 'ACCOUNT_CREDENTIAL_DENIED'; end if;
  select * into v_attempt from account_security.account_auth_attempts
    where tenant_id = p_tenant_id and user_id = p_user_id and request_id = p_request_id
    for update;
  if not found or v_attempt.primary_session_digest <> p_primary_digest then
    raise exception 'ACCOUNT_ATTEMPT_DENIED';
  end if;
  if v_attempt.status <> 'pending' then return v_attempt.status; end if;
  select expires_at into v_primary_expires_at from account_security.portal_auth_sessions
    where tenant_id = p_tenant_id and user_id = p_user_id
      and session_digest = p_primary_digest;
  v_clock := clock_timestamp();
  if v_primary_expires_at <= v_clock then v_outcome := 'stale';
  elsif v_attempt.expires_at <= v_clock then v_outcome := 'expired';
  elsif v_attempt.credential_version <> v_cred.credential_version
     or v_attempt.attempt_epoch <> v_cred.attempt_epoch then v_outcome := 'stale';
  elsif coalesce(v_cred.locked_until > v_clock,false) then v_outcome := 'failed';
  elsif p_verified is not true or v_cred.password_hash is null then v_outcome := 'failed';
  else
    if p_token_digest is null or octet_length(p_token_digest) <> 32
       or p_stepup_id is null then raise exception 'ACCOUNT_INPUT_INVALID'; end if;
    v_outcome := 'succeeded';
  end if;
  if v_outcome = 'succeeded' then
    insert into account_security.account_stepup_sessions
      (id,tenant_id,user_id,token_digest,primary_session_digest,credential_version,
       issued_at,expires_at)
      values (p_stepup_id,p_tenant_id,p_user_id,p_token_digest,p_primary_digest,
        v_cred.credential_version,v_clock,
        v_primary_expires_at);
    update account_security.account_credentials
      set attempt_epoch = attempt_epoch + 1, attempts_in_window = 0,
          attempt_window_started_at = null, locked_until = null, updated_at = v_clock
      where tenant_id = p_tenant_id and user_id = p_user_id;
  elsif v_outcome = 'failed' and v_cred.attempts_in_window >= 5 then
    update account_security.account_credentials
      set locked_until = v_clock + interval '15 minutes', updated_at = v_clock
      where tenant_id = p_tenant_id and user_id = p_user_id;
  end if;
  update account_security.account_auth_attempts
    set status = v_outcome, finished_at = v_clock where id = v_attempt.id;
  insert into account_security.account_security_audit
    (id,tenant_id,user_id,actor_user_id,request_id,operation_stage,event_type,outcome,related_id)
    values (gen_random_uuid(),p_tenant_id,p_user_id,p_user_id,p_request_id,
      'attempt_finish','unlock_result',v_outcome,v_attempt.id);
  return v_outcome;
end;
$function$
;
revoke all on function public.account_finish_attempt(p_tenant_id text, p_user_id bigint, p_primary_digest bytea, p_request_id uuid, p_verified boolean, p_token_digest bytea, p_stepup_id uuid) from public,anon,authenticated;
grant execute on function public.account_finish_attempt(p_tenant_id text, p_user_id bigint, p_primary_digest bytea, p_request_id uuid, p_verified boolean, p_token_digest bytea, p_stepup_id uuid) to service_role;
CREATE OR REPLACE FUNCTION public.account_lock_session(p_tenant_id text, p_user_id bigint, p_primary_digest bytea, p_stepup_digest bytea, p_request_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_stepup account_security.account_stepup_sessions%rowtype;
        v_clock timestamptz;
        v_revoked integer;
begin
  perform account_security.assert_member(p_tenant_id,p_user_id,true);
  perform account_security.assert_primary(p_tenant_id,p_user_id,p_primary_digest);
  if p_request_id is null or p_stepup_digest is null
     or octet_length(p_stepup_digest) <> 32 then
    raise exception 'ACCOUNT_INPUT_INVALID';
  end if;
  perform 1 from account_security.account_credentials
    where tenant_id = p_tenant_id and user_id = p_user_id for update;
  if not found then raise exception 'ACCOUNT_CREDENTIAL_DENIED'; end if;
  select * into v_stepup from account_security.account_stepup_sessions s
    where s.tenant_id = p_tenant_id and s.user_id = p_user_id
      and s.primary_session_digest = p_primary_digest
      and s.token_digest = p_stepup_digest for update;
  if not found then raise exception 'ACCOUNT_STEPUP_DENIED'; end if;
  if v_stepup.revoked_at is not null or v_stepup.expires_at <= clock_timestamp()
    then return 'already_locked'; end if;
  v_clock := clock_timestamp();
  update account_security.account_stepup_sessions
    set revoked_at = v_clock
    where tenant_id = p_tenant_id and user_id = p_user_id
      and primary_session_digest = p_primary_digest and revoked_at is null
      and expires_at > v_clock;
  get diagnostics v_revoked = row_count;
  if v_revoked = 0 then return 'already_locked'; end if;
  update account_security.account_credentials
    set attempt_epoch = attempt_epoch + 1, updated_at = v_clock
    where tenant_id = p_tenant_id and user_id = p_user_id;
  insert into account_security.account_security_audit
    (id,tenant_id,user_id,actor_user_id,request_id,operation_stage,event_type,outcome,related_id,revoked_session_count)
    values (gen_random_uuid(),p_tenant_id,p_user_id,p_user_id,p_request_id,
      'account_lock','stepup_revoke','ok',v_stepup.id,v_revoked);
  return 'locked';
end;
$function$
;
revoke all on function public.account_lock_session(p_tenant_id text, p_user_id bigint, p_primary_digest bytea, p_stepup_digest bytea, p_request_id uuid) from public,anon,authenticated;
grant execute on function public.account_lock_session(p_tenant_id text, p_user_id bigint, p_primary_digest bytea, p_stepup_digest bytea, p_request_id uuid) to service_role;
CREATE OR REPLACE FUNCTION public.account_portal_session_valid(p_tenant_id text, p_user_id bigint, p_session_digest bytea)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  perform account_security.assert_member(p_tenant_id, p_user_id, false);
  perform account_security.assert_primary(p_tenant_id, p_user_id, p_session_digest);
  return true;
exception when others then return false;
end;
$function$
;
revoke all on function public.account_portal_session_valid(p_tenant_id text, p_user_id bigint, p_session_digest bytea) from public,anon,authenticated;
grant execute on function public.account_portal_session_valid(p_tenant_id text, p_user_id bigint, p_session_digest bytea) to service_role;
CREATE OR REPLACE FUNCTION public.account_register_portal_session(p_tenant_id text, p_user_id bigint, p_session_digest bytea, p_expires_at timestamp with time zone, p_auth_method text, p_request_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_existing account_security.portal_auth_sessions%rowtype;
        v_inserted integer;
begin
  perform account_security.assert_member(p_tenant_id, p_user_id, false);
  if p_request_id is null or p_session_digest is null or octet_length(p_session_digest) <> 32
     or p_auth_method not in ('password','email_link','trusted_proxy')
     or p_expires_at <= now() or p_expires_at > now() + interval '7 days' then
    raise exception 'ACCOUNT_INPUT_INVALID';
  end if;
  insert into account_security.portal_auth_sessions
    (session_digest,tenant_id,user_id,request_id,auth_method,expires_at)
    values (p_session_digest,p_tenant_id,p_user_id,p_request_id,p_auth_method,p_expires_at)
    on conflict (tenant_id,user_id,request_id) do nothing;
  get diagnostics v_inserted = row_count;
  select * into v_existing from account_security.portal_auth_sessions
    where tenant_id = p_tenant_id and user_id = p_user_id and request_id = p_request_id;
  if v_existing.session_digest <> p_session_digest
     or v_existing.expires_at <> p_expires_at or v_existing.auth_method <> p_auth_method then
    raise exception 'ACCOUNT_REQUEST_CONFLICT';
  end if;
  if v_existing.revoked_at is not null or v_existing.expires_at <= clock_timestamp() then
    raise exception 'ACCOUNT_PRIMARY_DENIED';
  end if;
  return case when v_inserted = 1 then 'created' else 'existing' end;
end;
$function$
;
revoke all on function public.account_register_portal_session(p_tenant_id text, p_user_id bigint, p_session_digest bytea, p_expires_at timestamp with time zone, p_auth_method text, p_request_id uuid) from public,anon,authenticated;
grant execute on function public.account_register_portal_session(p_tenant_id text, p_user_id bigint, p_session_digest bytea, p_expires_at timestamp with time zone, p_auth_method text, p_request_id uuid) to service_role;
CREATE OR REPLACE FUNCTION public.account_request_challenge(p_tenant_id text, p_target_user_id bigint, p_primary_digest bytea, p_purpose text, p_request_id uuid, p_challenge_id uuid, p_expires_at timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_cred account_security.account_credentials%rowtype;
        v_existing account_security.account_enrollment_challenges%rowtype;
        v_primary_expires_at timestamptz;
        v_clock timestamptz;
begin
  perform account_security.assert_member(p_tenant_id,p_target_user_id,true);
  perform account_security.assert_primary(p_tenant_id,p_target_user_id,p_primary_digest);
  if p_purpose is null or p_purpose not in ('enroll','reset')
     or p_request_id is null or p_challenge_id is null or p_expires_at is null then
    raise exception 'ACCOUNT_INPUT_INVALID';
  end if;
  insert into account_security.account_credentials (tenant_id,user_id)
    values (p_tenant_id,p_target_user_id) on conflict do nothing;
  select * into v_cred from account_security.account_credentials
    where tenant_id = p_tenant_id and user_id = p_target_user_id for update;
  select expires_at into v_primary_expires_at
    from account_security.portal_auth_sessions
    where tenant_id = p_tenant_id and user_id = p_target_user_id
      and session_digest = p_primary_digest;
  v_clock := clock_timestamp();
  if v_primary_expires_at <= v_clock then
    raise exception 'ACCOUNT_PRIMARY_DENIED';
  end if;
  -- The credential lock serializes all request/decide/consume operations for
  -- this target. Expired rows remain as explicit terminal records.
  update account_security.account_enrollment_challenges
    set status = 'expired', expired_at = v_clock
    where tenant_id = p_tenant_id and target_user_id = p_target_user_id
      and status in ('pending','approved') and expires_at <= v_clock;
  update account_security.account_enrollment_challenges r
    set status = 'revoked', revoked_at = v_clock
    where r.tenant_id = p_tenant_id and r.target_user_id = p_target_user_id
      and r.status in ('pending','approved')
      and exists (select 1 from account_security.portal_auth_sessions s
        where s.tenant_id = r.tenant_id and s.user_id = r.target_user_id
          and s.session_digest = r.target_primary_session_digest
          and (s.revoked_at is not null or s.expires_at <= v_clock));
  select * into v_existing from account_security.account_enrollment_challenges
    where tenant_id = p_tenant_id and request_id = p_request_id;
  if found then
    if v_existing.target_user_id <> p_target_user_id
       or v_existing.target_primary_session_digest <> p_primary_digest
       or v_existing.purpose <> p_purpose
       or v_existing.id <> p_challenge_id
       or v_existing.expires_at <> p_expires_at then
      raise exception 'ACCOUNT_REQUEST_CONFLICT';
    end if;
    return v_existing.status;
  end if;
  if p_expires_at <= v_clock
     or p_expires_at > least(v_clock + interval '30 minutes',v_primary_expires_at) then
    raise exception 'ACCOUNT_CHALLENGE_EXPIRED';
  end if;
  if (p_purpose = 'enroll' and v_cred.password_hash is not null)
     or (p_purpose = 'reset' and v_cred.password_hash is null) then
    raise exception 'ACCOUNT_PURPOSE_CONFLICT';
  end if;
  if exists (select 1 from account_security.account_enrollment_challenges
       where tenant_id = p_tenant_id and target_user_id = p_target_user_id
         and status in ('pending','approved')) then
    return 'active_request_exists';
  end if;
  insert into account_security.account_enrollment_challenges
    (id,tenant_id,target_user_id,purpose,status,target_primary_session_digest,
     request_id,credential_version,requested_at,expires_at)
    values (p_challenge_id,p_tenant_id,p_target_user_id,p_purpose,'pending',
      p_primary_digest,p_request_id,v_cred.credential_version,v_clock,p_expires_at);
  insert into account_security.account_security_audit
    (id,tenant_id,user_id,actor_user_id,request_id,operation_stage,event_type,outcome,related_id)
    values (gen_random_uuid(),p_tenant_id,p_target_user_id,p_target_user_id,p_request_id,
      'challenge_request',p_purpose,'pending',p_challenge_id);
  return 'pending';
end;
$function$
;
revoke all on function public.account_request_challenge(p_tenant_id text, p_target_user_id bigint, p_primary_digest bytea, p_purpose text, p_request_id uuid, p_challenge_id uuid, p_expires_at timestamp with time zone) from public,anon,authenticated;
grant execute on function public.account_request_challenge(p_tenant_id text, p_target_user_id bigint, p_primary_digest bytea, p_purpose text, p_request_id uuid, p_challenge_id uuid, p_expires_at timestamp with time zone) to service_role;
CREATE OR REPLACE FUNCTION public.account_reserve_attempt(p_tenant_id text, p_user_id bigint, p_primary_digest bytea, p_request_id uuid, p_attempt_id uuid)
 RETURNS TABLE(allowed boolean, attempt_id uuid, credential_version bigint, attempt_epoch bigint, password_hash text)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_cred account_security.account_credentials%rowtype;
        v_attempt account_security.account_auth_attempts%rowtype;
        v_primary_expires_at timestamptz;
        v_clock timestamptz;
        v_denied boolean := false;
begin
  perform account_security.assert_member(p_tenant_id,p_user_id,true);
  perform account_security.assert_primary(p_tenant_id,p_user_id,p_primary_digest);
  if p_request_id is null or p_attempt_id is null then raise exception 'ACCOUNT_INPUT_INVALID'; end if;
  insert into account_security.account_credentials (tenant_id,user_id)
    values (p_tenant_id,p_user_id) on conflict do nothing;
  select * into v_cred from account_security.account_credentials
    where tenant_id = p_tenant_id and user_id = p_user_id for update;
  select expires_at into v_primary_expires_at from account_security.portal_auth_sessions
    where tenant_id = p_tenant_id and user_id = p_user_id
      and session_digest = p_primary_digest;
  if v_primary_expires_at <= clock_timestamp() then
    raise exception 'ACCOUNT_PRIMARY_DENIED';
  end if;
  v_clock := clock_timestamp();
  select * into v_attempt from account_security.account_auth_attempts
    where tenant_id = p_tenant_id and user_id = p_user_id and request_id = p_request_id;
  if found then
    if v_attempt.primary_session_digest <> p_primary_digest then
      raise exception 'ACCOUNT_REQUEST_CONFLICT';
    end if;
    -- No second hash check under the same reservation. A genuine retry uses
    -- a fresh request UUID and consumes a new quota slot.
    return query select false,v_attempt.id,v_attempt.credential_version,
      v_attempt.attempt_epoch,null::text;
    return;
  end if;
  if v_cred.attempt_window_started_at is null
     or v_cred.attempt_window_started_at <= clock_timestamp() - interval '15 minutes' then
    update account_security.account_credentials
      set attempts_in_window = 0, attempt_window_started_at = clock_timestamp(),
          locked_until = case when locked_until <= clock_timestamp() then null else locked_until end,
          updated_at = clock_timestamp()
      where tenant_id = p_tenant_id and user_id = p_user_id;
    v_cred.attempts_in_window := 0;
    if v_cred.locked_until <= clock_timestamp() then v_cred.locked_until := null; end if;
  end if;
  v_denied := coalesce(v_cred.locked_until > clock_timestamp(),false)
              or v_cred.attempts_in_window >= 5;
  if v_denied then
    update account_security.account_credentials
      set locked_until = greatest(coalesce(locked_until,clock_timestamp()),
          clock_timestamp() + interval '15 minutes'),
          updated_at = clock_timestamp()
      where tenant_id = p_tenant_id and user_id = p_user_id;
  else
    update account_security.account_credentials
      set attempts_in_window = attempts_in_window + 1, updated_at = clock_timestamp()
      where tenant_id = p_tenant_id and user_id = p_user_id;
  end if;
  insert into account_security.account_auth_attempts
    (id,tenant_id,user_id,request_id,credential_version,attempt_epoch,
     primary_session_digest,reserved_at,expires_at,finished_at,status)
    values (p_attempt_id,p_tenant_id,p_user_id,p_request_id,
      v_cred.credential_version,v_cred.attempt_epoch,p_primary_digest,v_clock,
      v_clock + interval '5 minutes',
      case when v_denied then v_clock else null end,
      case when v_denied then 'failed' else 'pending' end);
  insert into account_security.account_security_audit
    (id,tenant_id,user_id,actor_user_id,request_id,operation_stage,event_type,outcome,related_id)
    values (gen_random_uuid(),p_tenant_id,p_user_id,p_user_id,p_request_id,
      'attempt_reserve','unlock_attempt',case when v_denied then 'locked' else 'reserved' end,
      p_attempt_id);
  return query select not v_denied,p_attempt_id,v_cred.credential_version,
    v_cred.attempt_epoch,case when v_denied then null::text else v_cred.password_hash end;
end;
$function$
;
revoke all on function public.account_reserve_attempt(p_tenant_id text, p_user_id bigint, p_primary_digest bytea, p_request_id uuid, p_attempt_id uuid) from public,anon,authenticated;
grant execute on function public.account_reserve_attempt(p_tenant_id text, p_user_id bigint, p_primary_digest bytea, p_request_id uuid, p_attempt_id uuid) to service_role;
CREATE OR REPLACE FUNCTION public.account_revoke_portal_session(p_tenant_id text, p_user_id bigint, p_session_digest bytea, p_request_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_session account_security.portal_auth_sessions%rowtype;
begin
  -- Allow logout even after role removal; confirm canonical tenant/user identity.
  perform 1 from public.tenants where id = p_tenant_id;
  if not found then raise exception 'ACCOUNT_TENANT_DENIED'; end if;
  perform 1 from public.customer_users
    where tenant_id = p_tenant_id and id = p_user_id;
  if not found then raise exception 'ACCOUNT_MEMBER_DENIED'; end if;
  select * into v_session from account_security.portal_auth_sessions
    where tenant_id = p_tenant_id and user_id = p_user_id
      and session_digest = p_session_digest for update;
  if not found then raise exception 'ACCOUNT_PRIMARY_DENIED'; end if;
  if v_session.revoked_at is not null then return 'already_revoked'; end if;
  update account_security.portal_auth_sessions set revoked_at = now()
    where session_digest = p_session_digest;
  update account_security.account_stepup_sessions set revoked_at = now()
    where tenant_id = p_tenant_id and user_id = p_user_id
      and primary_session_digest = p_session_digest and revoked_at is null;
  update account_security.account_enrollment_challenges
    set status = 'revoked', revoked_at = clock_timestamp()
    where tenant_id = p_tenant_id and target_user_id = p_user_id
      and target_primary_session_digest = p_session_digest
      and status in ('pending','approved');
  insert into account_security.account_security_audit
    (id,tenant_id,user_id,actor_user_id,request_id,operation_stage,event_type,outcome)
    values (gen_random_uuid(),p_tenant_id,p_user_id,p_user_id,p_request_id,
      'portal_logout','session_revoke','ok');
  return 'revoked';
end;
$function$
;
revoke all on function public.account_revoke_portal_session(p_tenant_id text, p_user_id bigint, p_session_digest bytea, p_request_id uuid) from public,anon,authenticated;
grant execute on function public.account_revoke_portal_session(p_tenant_id text, p_user_id bigint, p_session_digest bytea, p_request_id uuid) to service_role;
CREATE OR REPLACE FUNCTION public.account_security_status(p_tenant_id text, p_user_id bigint, p_primary_digest bytea, p_stepup_digest bytea DEFAULT NULL::bytea)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_enrolled boolean := false;
        v_version bigint := 0;
        v_request jsonb;
        v_pending jsonb := '[]'::jsonb;
        v_is_owner boolean := false;
        v_stepup_expires_at timestamptz;
begin
  perform account_security.assert_member(p_tenant_id,p_user_id,true);
  perform account_security.assert_primary(p_tenant_id,p_user_id,p_primary_digest);
  select c.password_hash is not null,c.credential_version
    into v_enrolled,v_version
    from account_security.account_credentials c
    where c.tenant_id = p_tenant_id and c.user_id = p_user_id;
  v_enrolled := coalesce(v_enrolled,false);
  v_version := coalesce(v_version,0);
  if p_stepup_digest is not null and octet_length(p_stepup_digest) = 32 then
    select s.expires_at into v_stepup_expires_at
      from account_security.account_stepup_sessions s
      join account_security.portal_auth_sessions p
        on p.tenant_id = s.tenant_id and p.user_id = s.user_id
        and p.session_digest = s.primary_session_digest
      where s.tenant_id = p_tenant_id and s.user_id = p_user_id
        and s.primary_session_digest = p_primary_digest
        and s.token_digest = p_stepup_digest and s.revoked_at is null
        and s.expires_at > clock_timestamp()
        and p.revoked_at is null and p.expires_at > clock_timestamp()
        and s.credential_version = v_version and v_enrolled;
  end if;
  select jsonb_build_object(
      'id',r.id,'purpose',r.purpose,'status',r.status,
      'requested_at',r.requested_at,'expires_at',r.expires_at,
      'credential_version',r.credential_version::text,
      'session_matches',r.target_primary_session_digest = p_primary_digest)
    into v_request from account_security.account_enrollment_challenges r
    where r.tenant_id = p_tenant_id and r.target_user_id = p_user_id
    order by r.requested_at desc limit 1;
  select t.account_security_owner_user_id = p_user_id into v_is_owner
    from public.tenants t where t.id = p_tenant_id and t.active;
  if coalesce(v_is_owner,false) then
    select coalesce(jsonb_agg(jsonb_build_object(
        'id',q.id,'target_user_id',q.target_user_id,
        'target_email',q.email,'purpose',q.purpose,
        'requested_at',q.requested_at,'expires_at',q.expires_at)
        order by q.requested_at,q.id),'[]'::jsonb)
      into v_pending
      from (
        select r.id,r.target_user_id,u.email,r.purpose,
               r.requested_at,r.expires_at
        from account_security.account_enrollment_challenges r
        join public.customer_users u
          on u.tenant_id = r.tenant_id and u.id = r.target_user_id
        join account_security.portal_auth_sessions s
          on s.tenant_id = r.tenant_id and s.user_id = r.target_user_id
          and s.session_digest = r.target_primary_session_digest
        where r.tenant_id = p_tenant_id and r.status = 'pending'
          and r.expires_at > clock_timestamp()
          and u.active and u.role = 'superadmin'
          and s.revoked_at is null and s.expires_at > clock_timestamp()
        order by r.requested_at,r.id limit 100
      ) q;
  end if;
  return jsonb_build_object(
    'enrolled',v_enrolled,'credential_version',v_version::text,
    'latest_request',v_request,'is_owner',coalesce(v_is_owner,false),
    'pending_approvals',v_pending,
    'unlocked',v_stepup_expires_at is not null,
    'expires_at',v_stepup_expires_at);
end;
$function$
;
revoke all on function public.account_security_status(p_tenant_id text, p_user_id bigint, p_primary_digest bytea, p_stepup_digest bytea) from public,anon,authenticated;
grant execute on function public.account_security_status(p_tenant_id text, p_user_id bigint, p_primary_digest bytea, p_stepup_digest bytea) to service_role;
CREATE OR REPLACE FUNCTION public.account_session_valid(p_tenant_id text, p_user_id bigint, p_primary_digest bytea, p_stepup_digest bytea)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  perform account_security.assert_member(p_tenant_id, p_user_id, true);
  perform account_security.assert_primary(p_tenant_id, p_user_id, p_primary_digest);
  return exists (
    select 1 from account_security.account_stepup_sessions s
    join account_security.account_credentials c
      on c.tenant_id = s.tenant_id and c.user_id = s.user_id
    where s.tenant_id = p_tenant_id and s.user_id = p_user_id
      and s.primary_session_digest = p_primary_digest
      and s.token_digest = p_stepup_digest and s.revoked_at is null
      and s.expires_at > clock_timestamp() and c.password_hash is not null
      and c.credential_version = s.credential_version
  );
exception when others then return false;
end;
$function$
;
revoke all on function public.account_session_valid(p_tenant_id text, p_user_id bigint, p_primary_digest bytea, p_stepup_digest bytea) from public,anon,authenticated;
grant execute on function public.account_session_valid(p_tenant_id text, p_user_id bigint, p_primary_digest bytea, p_stepup_digest bytea) to service_role;
notify pgrst,'reload schema';
commit;


CREATE OR REPLACE FUNCTION public.account_revoke_portal_session(p_tenant_id text, p_user_id bigint, p_session_digest bytea, p_request_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_session account_security.portal_auth_sessions%rowtype;
        v_clock timestamptz;
begin
  -- Allow logout even after role removal; confirm canonical tenant/user identity.
  perform 1 from public.tenants where id = p_tenant_id;
  if not found then raise exception 'ACCOUNT_TENANT_DENIED'; end if;
  perform 1 from public.customer_users
    where tenant_id = p_tenant_id and id = p_user_id;
  if not found then raise exception 'ACCOUNT_MEMBER_DENIED'; end if;
  select * into v_session from account_security.portal_auth_sessions
    where tenant_id = p_tenant_id and user_id = p_user_id
      and session_digest = p_session_digest for update;
  if not found then raise exception 'ACCOUNT_PRIMARY_DENIED'; end if;
  if v_session.revoked_at is not null then return 'already_revoked'; end if;
  v_clock := clock_timestamp();
  update account_security.portal_auth_sessions set revoked_at = v_clock
    where session_digest = p_session_digest;
  update account_security.account_stepup_sessions set revoked_at = v_clock
    where tenant_id = p_tenant_id and user_id = p_user_id
      and primary_session_digest = p_session_digest and revoked_at is null;
  update account_security.account_enrollment_challenges
    set status = 'revoked', revoked_at = v_clock
    where tenant_id = p_tenant_id and target_user_id = p_user_id
      and target_primary_session_digest = p_session_digest
      and status in ('pending','approved');
  insert into account_security.account_security_audit
    (id,tenant_id,user_id,actor_user_id,request_id,operation_stage,event_type,outcome)
    values (gen_random_uuid(),p_tenant_id,p_user_id,p_user_id,p_request_id,
      'portal_logout','session_revoke','ok');
  return 'revoked';
end;
$function$

;
