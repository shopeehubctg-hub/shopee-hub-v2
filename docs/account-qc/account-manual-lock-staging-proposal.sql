-- REVIEW CANDIDATE ONLY. Do not apply without the user's exact Staging approval.
-- Scope: existing account_security.account_stepup_sessions expiry constraint,
-- account_security.account_security_audit nullable count column, and the
-- bodies of public.account_finish_attempt and public.account_lock_session.
-- Applying this SQL changes no existing table rows. Existing short-lived
-- sessions keep their current expires_at values.

begin;

alter table account_security.account_stepup_sessions
  drop constraint account_stepup_sessions_check;
alter table account_security.account_stepup_sessions
  add constraint account_stepup_sessions_primary_window_check
  check (expires_at > issued_at and expires_at <= issued_at + interval '7 days');

alter table account_security.account_security_audit
  add column revoked_session_count integer
  check (revoked_session_count is null or revoked_session_count > 0);
create or replace function public.account_finish_attempt(
  p_tenant_id text, p_user_id bigint, p_primary_digest bytea,
  p_request_id uuid, p_verified boolean, p_token_digest bytea, p_stepup_id uuid
) returns text language plpgsql security invoker set search_path = '' as $fn$
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
$fn$;

-- Lock every Account token bound to this Dashboard session. Locking the
-- credential row serializes this action with unlock completion, and advancing
-- attempt_epoch makes already-reserved attempts stale.
create or replace function public.account_lock_session(
  p_tenant_id text, p_user_id bigint, p_primary_digest bytea,
  p_stepup_digest bytea, p_request_id uuid
) returns text language plpgsql security invoker set search_path = '' as $fn$
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
$fn$;

commit;
