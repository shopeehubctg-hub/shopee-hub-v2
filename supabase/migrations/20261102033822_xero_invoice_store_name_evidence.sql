-- Minimal source evidence for explicit per-invoice STORE NAME review.
-- No raw Description, business mappings, ledger rows, tables or indexes are written.
-- Old immutable snapshots remain valid; only new eligible rows may add storeNames.
create or replace function xero_private.snapshot_valid(v jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare r jsonb;x jsonb;k text;pair record;ids text[]:=array[]::text[];payment_ids text[]:=array[]::text[];n integer;pending integer:=0;eligible integer:=0;label jsonb;label_text text;label_key text;label_keys text[];
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
   if x-array['invoiceId','invoiceNumber','contactId','currency','state','reason','project','subtotal','tax','gross','amountPaid','amountDue','amountCredited','cashReceived','date','dueDate','storeNames']<>'{}'::jsonb or not(x ?& array['subtotal','tax','gross','amountPaid','amountDue','amountCredited','cashReceived','date','dueDate']) or x->'reason'<>'null'::jsonb or not(coalesce(x->>'project','')=any(projects)) then return false;end if;
   -- Only short, explicit STORE NAME labels survive the source adapter. No descriptions/PII.
   -- Absent is a legacy snapshot; [] proves that this refreshed invoice had no parsed label.
   if x ? 'storeNames' then
    if jsonb_typeof(x->'storeNames') is distinct from 'array' or jsonb_array_length(x->'storeNames')>8 then return false;end if;
    label_keys:=array[]::text[];
    for label in select value from jsonb_array_elements(x->'storeNames') loop
     if jsonb_typeof(label) is distinct from 'string' then return false;end if;
     label_text:=label#>>'{}';
     if label_text is distinct from trim(label_text) or length(label_text) not between 1 and 120
      or label_text ~ '[[:cntrl:]]' or label_text ~* '(https?://|www[.]|[[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,})' then return false;end if;
     label_key:=lower(regexp_replace(normalize(label_text,NFKC),'[[:space:]]+',' ','g'));
     if label_key=any(label_keys) then return false;end if;
     label_keys:=array_append(label_keys,label_key);
    end loop;
   end if;
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

revoke all on function xero_private.snapshot_valid(jsonb) from public,anon,authenticated;
grant execute on function xero_private.snapshot_valid(jsonb) to service_role;
