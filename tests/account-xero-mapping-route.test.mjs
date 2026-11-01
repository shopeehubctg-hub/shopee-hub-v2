import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
let actor,account,writes,prior,reads,onRead,requestReads;
const source=ts.transpileModule(readFileSync('app/api/admin/account/xero-mapping/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};new Function('require','exports',source)(name=>name==='../route'?{GET:async()=>{reads++;onRead?.();return Response.json(account)}}:name.endsWith('xero-server')?{xeroActor:async()=>actor,xeroHeaders:{'Cache-Control':'private, no-store'},xeroUnavailable:()=>new Response('',{status:503})}:name.endsWith('xero-store')?{xeroRpc:async(_actor,name,args)=>{writes.push({name,args});return {}}}:name.endsWith('supabase-rest')?{supabaseRest:async path=>{requestReads++;assert.match(path,/account_store_requests\?select=request_payload&tenant_id=eq.tenant&request_id=eq./);return prior;}}: (()=>{throw Error(name)})(),exports);
const uuid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const binding={contactId:uuid(1),categoryId:uuid(2),optionId:uuid(3),unitKey:'unit',effectiveMonth:'2026-10',expectedVersion:'0'};
function setup(){writes=[];prior=[];reads=0;requestReads=0;onRead=null;actor={tenantId:'tenant',actorEmail:'admin@example.invalid',config:{environment:'staging'}};account={storeOptions:[{id:'shop',name:'Shop',platform:'Shopee MY'}],stores:[{id:'unit',rosterKey:'unit',entity:'Company',project:'Project',market:'MY',storeId:'shop',currency:'MYR',latestSettingsVersion:'0'}],xero:{connected:true,status:'connected',sourceRunId:uuid(4),groups:[{...binding}]}};}
function request(items=[binding],extra={}){return new Request('https://stage.test/api/admin/account/xero-mapping',{method:'POST',headers:{origin:'https://stage.test','content-type':'application/json'},body:JSON.stringify({requestId:uuid(9),mappings:items,...extra})});}
test('mapping delegates one atomic batch with server-owned target identity and selected source month',async()=>{setup();const response=await exports.POST(request());assert.equal(response.status,200);assert.equal(writes.length,1);assert.equal(writes[0].args.p_invoice_month,'2026-10-01');assert.equal(writes[0].args.p_source_run_id,uuid(4));assert.equal(writes[0].args.p_bindings[0].targetSeed.entity,'Company');assert.equal(writes[0].args.p_bindings[0].targetExpectedVersion,'0');});
test('no writes for foreign target/source, duplicate bindings, stale version or mixed effective months',async()=>{for(const items of [[{...binding,unitKey:'foreign'}],[{...binding,contactId:uuid(8)}],[binding,binding],[{...binding,expectedVersion:'3'}],[binding,{...binding,contactId:uuid(8),effectiveMonth:'2026-11'}]]){setup();assert.ok((await exports.POST(request(items))).status>=400);assert.equal(writes.length,0);}});
test('locked or unavailable source and missing company setup fail before mutation',async()=>{for(const mode of ['locked','identity_sync_required','unavailable','missing_entity']){setup();if(mode==='locked')actor=new Response('',{status:423});else if(mode==='missing_entity')account.stores[0].entity='';else account.xero.status=mode;assert.ok((await exports.POST(request())).status>=400);assert.equal(writes.length,0);}});

test('exact successful retry replays original server evidence before refreshed source or version checks',async()=>{
 setup();assert.equal((await exports.POST(request())).status,200);const original=writes[0].args;
 prior=[{request_payload:{mode:'xero-billing-mappings',actor:actor.actorEmail,environment:'staging',connectionId:uuid(7),sourceRunId:original.p_source_run_id,invoiceMonth:original.p_invoice_month,bindings:original.p_bindings}}];
 account.xero.groups[0].expectedVersion='1';account.stores[0].latestSettingsVersion='1';account.xero.sourceRunId=uuid(5);account.xero.status='identity_sync_required';
 const before=reads;assert.equal((await exports.POST(request())).status,200);assert.equal(reads,before,'retry must not depend on current source or advanced CAS');assert.deepEqual(writes[1].args,original);
});
test('changed mapping intent, actor, environment, month or request mode cannot replay another saved request',async()=>{
 for(const changed of ['unit','version','actor','environment','month','mode']){
  setup();assert.equal((await exports.POST(request())).status,200);const original=writes[0].args;
  const payload={mode:'xero-billing-mappings',actor:actor.actorEmail,environment:'staging',connectionId:uuid(7),sourceRunId:original.p_source_run_id,invoiceMonth:original.p_invoice_month,bindings:structuredClone(original.p_bindings)};
  if(changed==='unit')payload.bindings[0].rosterKey='other';if(changed==='version')payload.bindings[0].expectedVersion='1';if(changed==='actor')payload.actor='other@example.invalid';if(changed==='environment')payload.environment='production';if(changed==='month')payload.invoiceMonth='2026-11-01';if(changed==='mode')payload.mode='account-fee-rule';prior=[{request_payload:payload}];
  const before=writes.length;assert.equal((await exports.POST(request())).status,409,changed);assert.equal(writes.length,before);
 }
});
test('replay still requires current actor/session gate and returns only RPC result',async()=>{
 setup();prior=[{request_payload:{secret:'must-not-return'}}];actor=new Response('',{status:423});assert.equal((await exports.POST(request())).status,423);assert.equal(writes.length,0);assert.equal(reads,0);
});

test('one bounded replay recheck handles a save committed between the initial request lookup and Account read',async()=>{
 setup();const originalBindings=[{contactId:binding.contactId,categoryId:binding.categoryId,optionId:binding.optionId,rosterKey:binding.unitKey,expectedVersion:'0',targetExpectedVersion:'0',targetSeed:{project:'Project',entity:'Company',currency:'MYR',market:'MY',storeId:'shop'}}];
 onRead=()=>{account.xero.groups[0].expectedVersion='1';account.stores[0].latestSettingsVersion='1';prior=[{request_payload:{mode:'xero-billing-mappings',actor:actor.actorEmail,environment:'staging',sourceRunId:uuid(4),invoiceMonth:'2026-10-01',bindings:originalBindings}}];};
 assert.equal((await exports.POST(request())).status,200);assert.equal(reads,1);assert.equal(requestReads,2);assert.equal(writes.length,1);assert.deepEqual(writes[0].args.p_bindings,originalBindings);
});

test('an audited unique live store candidate is proposed using server-owned identity only',async()=>{
 setup();account.stores[0].storeId=null;account.stores[0].candidates=[{storeId:'shop',storeName:'Shop'},{storeId:'shop',storeName:'Alias'},{storeId:'foreign',storeName:'Foreign'}];
 const response=await exports.POST(request([{...binding,storeId:'foreign',targetSeed:{storeId:'foreign'}}]));assert.equal(response.status,200);assert.equal(writes[0].args.p_bindings[0].targetSeed.storeId,'shop');assert.equal(account.stores[0].storeId,null);
});
test('missing, ambiguous or stale stores require mapping before any save',async()=>{
 for(const mode of ['none','ambiguous','stale']){
  setup();account.stores[0].storeId=null;account.storeOptions.push({id:'second',name:'Second',platform:'Shopee MY'});
  account.stores[0].candidates=mode==='none'?[]:mode==='ambiguous'?[{storeId:'shop'},{storeId:'second'}]:[{storeId:'foreign'}];
  const response=await exports.POST(request());assert.equal(response.status,409,mode);assert.match((await response.json()).error,/Store mapping required/);assert.equal(writes.length,0);
 }
});
