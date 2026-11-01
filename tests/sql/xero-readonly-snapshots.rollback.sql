-- Isolated Staging only. Fixtures exist exclusively inside this ROLLBACK transaction.
-- Uses fake UUIDs, invalid-domain actor, synthetic encrypted envelopes, no real Xero calls.
begin;
do $$declare suffix text:=replace(gen_random_uuid()::text,'-','');u bigint;s text;tenant text;email text;begin
 tenant:='xero-rollback-'||suffix;email:='xero-test-'||suffix||'@example.invalid';s:=encode(sha256(convert_to(suffix,'UTF8')),'hex');
 perform set_config('xero_test.tenant',tenant,true);perform set_config('xero_test.email',email,true);perform set_config('xero_test.session',s,true);
 insert into public.tenants(id,name,active) values(tenant,'Synthetic Xero rollback',true);
 u:=-abs(('x'||left(suffix,12))::bit(48)::bigint)-10000000;
 insert into public.customer_users(id,tenant_id,email,role,active) values(u,tenant,email,'superadmin',true);
 insert into account_security.portal_auth_sessions(session_digest,tenant_id,user_id,request_id,auth_method,expires_at) values(decode(s,'hex'),tenant,u,gen_random_uuid(),'password',now()+interval '1 hour');
end $$;
set local role service_role;
do $$
declare t text:=current_setting('xero_test.tenant');a text:=current_setting('xero_test.email');s text:=current_setting('xero_test.session');
 org uuid:=gen_random_uuid();ext uuid:=gen_random_uuid();st jsonb;st_old jsonb;c jsonb;r jsonb;r2 jsonb;claim jsonb;answer jsonb;lease uuid:=gen_random_uuid();req uuid:=gen_random_uuid();
 token text:='v1.'||repeat('A',16)||'.'||repeat('B',22)||'.'||repeat('C',120);token2 text:='v1.'||repeat('A',16)||'.'||repeat('B',22)||'.'||repeat('D',120);expiry timestamptz:=now()+interval '30 minutes';
 scopes text[]:=array['offline_access','accounting.invoices.read','accounting.payments.read','accounting.settings.read'];
 snapshot jsonb;scope jsonb;invoice jsonb;pending_invoice jsonb;invoice_id uuid:=gen_random_uuid();pending_id uuid:=gen_random_uuid();before_count bigint;p record;
begin
 if has_schema_privilege('authenticated','xero_private','usage') or has_table_privilege('anon','public.xero_connections','select') or has_table_privilege('authenticated','public.xero_sync_snapshots','select') then raise exception 'Xero source exposed to client role';end if;
 if has_table_privilege('service_role','public.xero_sync_snapshots','update') or has_table_privilege('service_role','public.xero_sync_snapshots','delete') or has_table_privilege('service_role','public.xero_sync_snapshots','truncate') or has_table_privilege('service_role','xero_private.connection_tokens','delete') then raise exception 'Xero source overprivileged';end if;
 for p in select pr.oid,n.nspname,pr.proname,pg_get_function_identity_arguments(pr.oid) args from pg_proc pr join pg_namespace n on n.oid=pr.pronamespace where n.nspname='public' and pr.proname like 'xero_%' loop
  if has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute') then raise exception 'Xero RPC exposed';end if;
 end loop;
 if (public.xero_connection_read(t,a,s,'staging')->'connection')<>'null'::jsonb then raise exception 'Synthetic tenant connection should not exist';end if;
 begin perform public.xero_connection_read(t,a,repeat('0',64),'staging');raise exception 'Bad session accepted';exception when others then if sqlerrm not in ('ACCOUNT_PRIMARY_DENIED','XERO_ACCESS_DENIED') then raise;end if;end;
 begin perform public.xero_connection_read('foreign-'||t,a,s,'staging');raise exception 'Foreign tenant accepted';exception when others then if sqlerrm<>'XERO_ACCESS_DENIED' then raise;end if;end;
 st:=public.xero_oauth_begin(t,a,s,'staging',org,repeat('a',64),now()+interval '5 minutes');
 st_old:=public.xero_oauth_begin(t,a,s,'staging',org,repeat('b',64),now()+interval '5 minutes');
 begin perform public.xero_oauth_consume(t,a,s,'staging',gen_random_uuid(),repeat('a',64));raise exception 'Wrong org state accepted';exception when others then if sqlerrm<>'XERO_INVALID_STATE' then raise;end if;end;
 answer:=public.xero_oauth_consume(t,a,s,'staging',org,repeat('a',64));
 begin perform public.xero_oauth_consume(t,a,s,'staging',org,repeat('a',64));raise exception 'Replayed state accepted';exception when others then if sqlerrm<>'XERO_INVALID_STATE' then raise;end if;end;
 c:=public.xero_connection_save(t,a,s,(st->>'stateId')::uuid,ext,org,'Synthetic organisation','staging',token,scopes,expiry);
 if public.xero_connection_save(t,a,s,(st->>'stateId')::uuid,ext,org,'Synthetic organisation','staging',token,scopes,expiry) is distinct from c then raise exception 'Connection exact replay changed';end if;
 answer:=public.xero_oauth_consume(t,a,s,'staging',org,repeat('b',64));
 begin perform public.xero_connection_save(t,a,s,(st_old->>'stateId')::uuid,ext,org,'Synthetic organisation','staging',token,scopes,expiry);raise exception 'Stale callback accepted';exception when others then if sqlerrm<>'XERO_STALE_STATE' then raise;end if;end;
 answer:=public.xero_connection_read(t,a,s,'staging');
 if answer->>'encryptedTokens'<>token or answer->>'tokenVersion'<>'1' then raise exception 'Encrypted token read/CAS changed';end if;
 claim:=public.xero_refresh_claim(t,a,s,'staging',1,lease);
 if claim->>'claimed'<>'true' then raise exception 'Refresh lease not acquired';end if;
 if public.xero_refresh_claim(t,a,s,'staging',1,gen_random_uuid())->>'claimed'<>'false' then raise exception 'Concurrent refresh lease acquired';end if;
 begin perform public.xero_refresh_complete(t,a,s,'staging',1,gen_random_uuid(),token2,scopes,expiry);raise exception 'Wrong refresh lease accepted';exception when others then if sqlerrm<>'XERO_STALE_LEASE' then raise;end if;end;
 answer:=public.xero_refresh_complete(t,a,s,'staging',1,lease,token2,scopes,expiry);
 if answer->>'tokenVersion'<>'2' or public.xero_refresh_complete(t,a,s,'staging',1,lease,token2,scopes,expiry) is distinct from answer then raise exception 'Refresh CAS/replay failed';end if;
 begin perform public.xero_refresh_complete(t,a,s,'staging',1,lease,token,scopes,expiry);raise exception 'Changed refresh replay accepted';exception when others then if sqlerrm<>'XERO_REPLAY_CONFLICT' then raise;end if;end;
 scope:=jsonb_build_object('categoryId',gen_random_uuid(),'options',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'project','Shopee Hub'),jsonb_build_object('id',gen_random_uuid(),'project','Shopee Hub Internal'),jsonb_build_object('id',gen_random_uuid(),'project','Tik Tok Hub'),jsonb_build_object('id',gen_random_uuid(),'project','Lazada Hub')));
 snapshot:=jsonb_build_object('month','2026-10','today','2026-11-01','scope',scope,'report',jsonb_build_object('rows','[]'::jsonb,'totals','[]'::jsonb,'month','2026-10','today','2026-11-01','payments','[]'::jsonb,'invoiceCount',0,'pendingCount',0,'collections','[]'::jsonb,'outstanding','[]'::jsonb,'invoices','[]'::jsonb));
 if not xero_private.snapshot_valid(snapshot) then raise exception 'Safe empty source snapshot rejected';end if;
 invoice:=jsonb_build_object('invoiceId',invoice_id,'invoiceNumber','SYNTHETIC-ROLLBACK-ONLY','contactId',null,'currency','MYR','state','eligible','reason',null,'project','Shopee Hub','subtotal','100.00','tax','8.00','gross','108.00','amountPaid','50.00','amountDue','58.00','amountCredited','0.00','cashReceived','50.00','date','2026-10-10T00:00:00','dueDate','2026-11-10');
 pending_invoice:=jsonb_build_object('invoiceId',pending_id,'invoiceNumber','SYNTHETIC-PENDING','contactId',null,'currency','MYR','state','pending','reason','mixed_projects','project',null);
 snapshot:=jsonb_set(snapshot,'{report,rows}',jsonb_build_array(invoice,pending_invoice));
 snapshot:=jsonb_set(snapshot,'{report,invoices}',jsonb_build_array(invoice||jsonb_build_object('xeroUrl','https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID='||invoice_id),pending_invoice||jsonb_build_object('xeroUrl','https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID='||pending_id)));
 snapshot:=jsonb_set(snapshot,'{report,totals}',jsonb_build_array(jsonb_build_object('currency','MYR','gross','108.00','tax','8.00','amountPaid','50.00','amountDue','58.00','amountCredited','0.00','cashReceived','50.00')));
 snapshot:=jsonb_set(snapshot,'{report,collections}',jsonb_build_array(jsonb_build_object('currency','MYR','monthCollected','50.00','todayCollected','0.00')));
 snapshot:=jsonb_set(snapshot,'{report,outstanding}',jsonb_build_array(jsonb_build_object('currency','MYR','amountDue','58.00')));
 snapshot:=jsonb_set(snapshot,'{report,payments}',jsonb_build_array(jsonb_build_object('paymentId',gen_random_uuid(),'invoiceId',invoice_id,'invoiceNumber','SYNTHETIC-ROLLBACK-ONLY','project','Shopee Hub','currency','MYR','amount','50.00','date','2026-10-15')));
 snapshot:=jsonb_set(jsonb_set(snapshot,'{report,invoiceCount}','1'),'{report,pendingCount}','1');
 if not xero_private.snapshot_valid(snapshot) then raise exception 'Valid money/payment/pending snapshot rejected';end if;
 if xero_private.snapshot_valid(jsonb_set(snapshot,'{report,rows,0,gross}','"999.00"')) then raise exception 'Unreconciled invoice accepted';end if;
 if xero_private.snapshot_valid(jsonb_set(snapshot,'{report,rows,1,gross}','"100.00"')) then raise exception 'Mixed pending invoice amount accepted';end if;
 if xero_private.snapshot_valid(jsonb_set(snapshot,'{report,rows,1,state}','"excluded"')) then raise exception 'Excluded invoice persisted';end if;

 if xero_private.snapshot_valid(snapshot||jsonb_build_object('rawContact',jsonb_build_object('email','private@example.invalid'))) then raise exception 'Raw contact accepted';end if;
 if xero_private.snapshot_valid(jsonb_set(snapshot,'{scope,options,0,project}','"Other Department"')) then raise exception 'Other department scope accepted';end if;
 if xero_private.snapshot_valid(snapshot#-'{scope,categoryId}') then raise exception 'Missing scope ID accepted';end if;
 r:=public.xero_sync_claim(t,a,s,'staging',req);
 if r->>'claimed'<>'true' or public.xero_sync_claim(t,a,s,'staging',gen_random_uuid())->>'claimed'<>'false' then raise exception 'Concurrent sync not serialized';end if;
 begin perform public.xero_sync_complete(t,a,s,'staging',(r->>'runId')::uuid,(r->>'leaseId')::uuid,snapshot||'{"rawContact":{}}'::jsonb,(r->>'startedAt')::timestamptz);raise exception 'Invalid snapshot published';exception when others then if sqlerrm<>'XERO_INVALID_SNAPSHOT' then raise;end if;end;
 if exists(select 1 from public.xero_sync_snapshots where tenant_id=t) then raise exception 'Invalid snapshot left partial row';end if;
 answer:=public.xero_sync_complete(t,a,s,'staging',(r->>'runId')::uuid,(r->>'leaseId')::uuid,snapshot,(r->>'startedAt')::timestamptz);
 if public.xero_sync_complete(t,a,s,'staging',(r->>'runId')::uuid,(r->>'leaseId')::uuid,snapshot,(r->>'startedAt')::timestamptz) is distinct from answer then raise exception 'Sync completion replay changed';end if;
 if public.xero_sync_claim(t,a,s,'staging',req)->>'claimed'<>'false' or (select count(*) from public.xero_sync_snapshots where tenant_id=t)<>1 then raise exception 'Sync duplicate published';end if;
 r2:=public.xero_sync_claim(t,a,s,'staging',gen_random_uuid());
 begin perform public.xero_sync_complete(t,a,s,'staging',(r2->>'runId')::uuid,(r2->>'leaseId')::uuid,jsonb_set(snapshot,'{scope,categoryId}',to_jsonb(gen_random_uuid()::text)),(r2->>'startedAt')::timestamptz);raise exception 'Scope rebound without approval';exception when others then if sqlerrm<>'XERO_SCOPE_CHANGED' then raise;end if;end;
 answer:=public.xero_sync_fail(t,a,s,'staging',(r2->>'runId')::uuid,(r2->>'leaseId')::uuid,'rate_limited',60);
 if public.xero_sync_claim(t,a,s,'staging',gen_random_uuid())->>'claimed'<>'false' or public.xero_refresh_claim(t,a,s,'staging',2,gen_random_uuid())->>'claimed'<>'false' then raise exception 'Rate limit bypassed';end if;
 answer:=public.xero_connection_read(t,a,s,'staging');
 if answer->'snapshot' is distinct from snapshot or answer->'connection'->>'lastError'<>'rate_limited' then raise exception 'Failure replaced last successful snapshot';end if;
 if exists(select 1 from public.account_invoices where tenant_id=t) or exists(select 1 from public.account_assessments where tenant_id=t) or exists(select 1 from public.account_receipts where tenant_id=t) then raise exception 'Xero fabricated assessed ledger records';end if;
 if (select count(*) from public.account_audit_log where tenant_id=t)<>3 then raise exception 'Audit replay duplicated or missing';end if;
 if exists(select 1 from public.account_audit_log where tenant_id=t and (coalesce(before_value::text,'')||coalesce(after_value::text,'')) like '%encryptedTokens%') then raise exception 'Tokens leaked in audit';end if;
end $$;
reset role;
-- Revoking the persisted primary immediately blocks even metadata reads.
do $$declare t text:=current_setting('xero_test.tenant');s text:=current_setting('xero_test.session');begin
 update account_security.portal_auth_sessions set revoked_at=clock_timestamp() where tenant_id=t and session_digest=decode(s,'hex');
end $$;
set local role service_role;
do $$begin
 begin perform public.xero_connection_read(current_setting('xero_test.tenant'),current_setting('xero_test.email'),current_setting('xero_test.session'),'staging');raise exception 'Revoked primary accepted';exception when others then if sqlerrm<>'ACCOUNT_PRIMARY_DENIED' then raise;end if;end;
end $$;
reset role;
rollback;
