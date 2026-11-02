-- Isolated Stage, synthetic JSON only; no business records inserted or changed.
begin;
set local role service_role;
do $$
declare v jsonb;r jsonb;bad jsonb;labels jsonb;inv uuid:=gen_random_uuid();contact uuid:=gen_random_uuid();cat uuid:=gen_random_uuid();scope jsonb;url text;
begin
 scope:=jsonb_build_object('categoryId',cat,'options',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'project','Shopee Hub'),jsonb_build_object('id',gen_random_uuid(),'project','Shopee Hub Internal'),jsonb_build_object('id',gen_random_uuid(),'project','Tik Tok Hub'),jsonb_build_object('id',gen_random_uuid(),'project','Lazada Hub')));
 url:='https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID='||inv::text;
 r:=jsonb_build_object('invoiceId',inv,'invoiceNumber','SYNTHETIC/001','contactId',contact,'currency','MYR','state','eligible','reason',null,'project','Shopee Hub','subtotal','100.00','tax','8.00','gross','108.00','amountPaid','0.00','amountDue','108.00','amountCredited','0.00','cashReceived',null,'date','2026-10-01','dueDate','2026-10-31');
 v:=jsonb_build_object('month','2026-10','today','2026-11-02','scope',scope,'report',jsonb_build_object('rows',jsonb_build_array(r),'invoices',jsonb_build_array(r||jsonb_build_object('xeroUrl',url)),'totals',jsonb_build_array(jsonb_build_object('currency','MYR','gross','108.00','tax','8.00','amountPaid','0.00','amountDue','108.00','amountCredited','0.00','cashReceived',null)),'month','2026-10','today','2026-11-02','payments','[]'::jsonb,'collections','[]'::jsonb,'outstanding',jsonb_build_array(jsonb_build_object('currency','MYR','amountDue','108.00')),'invoiceCount',1,'pendingCount',0));
 if not xero_private.snapshot_valid(v) then raise exception 'Legacy snapshot rejected';end if;
 foreach labels in array array['[]'::jsonb,'["NOMOQ"]'::jsonb,'["Store A","Store B"]'::jsonb] loop
  bad:=jsonb_set(jsonb_set(v,'{report,rows,0,storeNames}',labels),'{report,invoices,0,storeNames}',labels);
  if not xero_private.snapshot_valid(bad) then raise exception 'Bounded store evidence rejected: %',labels;end if;
 end loop;
 foreach labels in array array['null'::jsonb,'"Store A"'::jsonb,'[1]'::jsonb,'[{}]'::jsonb,'[""]'::jsonb,'[" Store A"]'::jsonb,'["Store A "]'::jsonb,'["Store A","store a"]'::jsonb,'["Store A","Store  A"]'::jsonb,'["https://example.invalid"]'::jsonb,'["person@example.invalid"]'::jsonb,'["www.example.invalid"]'::jsonb,jsonb_build_array(repeat('x',121)),jsonb_build_array(E'Store\nprivate note'),jsonb_build_array('A','B','C','D','E','F','G','H','I')] loop
  bad:=jsonb_set(jsonb_set(v,'{report,rows,0,storeNames}',labels),'{report,invoices,0,storeNames}',labels);
  if xero_private.snapshot_valid(bad) then raise exception 'Invalid store evidence accepted: %',labels;end if;
 end loop;
 bad:=jsonb_set(jsonb_set(v,'{report,rows,0,storeNames}','["Store A"]'),'{report,invoices,0,storeNames}','["Store B"]');
 if xero_private.snapshot_valid(bad) then raise exception 'Presentation/source evidence disagreement accepted';end if;
 bad:=jsonb_set(jsonb_set(v,'{report,rows,0,Description}','"Raw description"'),'{report,invoices,0,Description}','"Raw description"');
 if xero_private.snapshot_valid(bad) then raise exception 'Raw Description persisted';end if;
 bad:=jsonb_set(jsonb_set(v,'{report,rows,0,storeNames}','["Store A"]'),'{report,invoices,0,storeNames}','["Store A"]');
 bad:=jsonb_set(jsonb_set(bad,'{report,rows,0,gross}','"109.00"'),'{report,invoices,0,gross}','"109.00"');
 if xero_private.snapshot_valid(bad) then raise exception 'Store evidence bypassed exact money reconciliation';end if;
 r:=jsonb_build_object('invoiceId',inv,'invoiceNumber','SYNTHETIC/001','contactId',contact,'currency','MYR','state','pending','reason','mixed_projects','project',null);
 bad:=jsonb_set(jsonb_set(jsonb_set(jsonb_set(v,'{report,rows}',jsonb_build_array(r)),'{report,invoices}',jsonb_build_array(r||jsonb_build_object('xeroUrl',url))),'{report,invoiceCount}','0'),'{report,pendingCount}','1');
 if not xero_private.snapshot_valid(bad) then raise exception 'Legacy pending snapshot rejected';end if;
 bad:=jsonb_set(jsonb_set(bad,'{report,rows,0,storeNames}','["Store A"]'),'{report,invoices,0,storeNames}','["Store A"]');
 if xero_private.snapshot_valid(bad) then raise exception 'Pending mixed invoice retained store evidence';end if;
 if has_function_privilege('anon','xero_private.snapshot_valid(jsonb)','EXECUTE') or has_function_privilege('authenticated','xero_private.snapshot_valid(jsonb)','EXECUTE') then raise exception 'Snapshot validator public execution';end if;
end $$;
reset role;
rollback;
