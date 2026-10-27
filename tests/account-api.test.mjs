import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
let source=readFileSync('app/api/admin/account/route.ts','utf8');
source=source.replace(/import \{ bnmServiceRate \}[^;]+;/,"const bnmServiceRate=async(month)=>globalThis.__bnm?.(month);")
.replace(/import \{ getChatGPTUser \}[^;]+;/,"const getChatGPTUser=async()=>globalThis.__actor;")
.replace(/import \{ supabaseRest \}[^;]+;/,"async function supabaseRest<T>(path:string):Promise<T> { return globalThis.__rest(path); }")
.replace(/import \{ accountRosterFallback, mergeAccountRoster \}[^;]+;/,"const accountRosterFallback=(...args)=>globalThis.__fallback?.(...args)??null; const mergeAccountRoster=(account,roster)=>account;")
.replaceAll("'../../../live-calendar-model'",`'${process.cwd()}/app/live-calendar-model.ts'`).replaceAll("'../../../account-settings-model'",`'${process.cwd()}/app/account-settings-model.ts'`).replaceAll("'../../../account-ledger'",`'${process.cwd()}/app/account-ledger.ts'`);
const compiled=execFileSync('node_modules/.bin/esbuild',['--bundle','--format=esm','--platform=node','--target=node20','--loader=ts'],{input:source});
const {GET}=await import(`data:text/javascript;base64,${compiled.toString('base64')}`);
const request=()=>new Request('https://example.test/api/admin/account?invoiceMonth=2026-10');
test('unauthenticated, inactive, non-superadmin and inactive tenant denied before ledger access',async()=>{
 globalThis.__actor=null;assert.equal((await GET(request())).status,401);
 for(const membership of [{active:false,role:'superadmin'},{active:true,role:'manager'},{active:true,role:'customer'}]) {
  globalThis.__actor={email:'ADMIN@example.test'};globalThis.__rest=async path=>{assert.ok(path.startsWith('customer_users?'));return [{...membership,tenant_id:'tenant-a'}];};assert.equal((await GET(request())).status,403);
 }
 globalThis.__rest=async path=>path.startsWith('customer_users?')?[{active:true,role:'superadmin',tenant_id:'tenant-a'}]:[{active:false}];assert.equal((await GET(request())).status,403);
});
test('every read uses server membership tenant; caller tenant cannot override; unknown is not_configured',async()=>{
 globalThis.__actor={email:'admin@example.test'};const paths=[];
 globalThis.__rest=async path=>{paths.push(path);if(path.startsWith('customer_users?'))return [{active:true,role:'superadmin',tenant_id:'tenant-a'}];if(path.startsWith('tenants?'))return [{active:true}];if(path.startsWith('stores?'))return [];assert.match(path,/tenant_id=eq.tenant-a/);throw new Error('Supabase REST 404: {"code":"PGRST205"}');};
 const response=await GET(new Request('https://example.test/api/admin/account?invoiceMonth=2026-10&tenantId=tenant-b'));assert.equal(response.status,200);const data=await response.json();assert.equal(data.status,'not_configured');assert.equal(data.summaries[0].billed,null);
});
test('permission and transport failure is not disguised as an empty account',async()=>{
 globalThis.__actor={email:'admin@example.test'};globalThis.__rest=async path=>{if(path.startsWith('customer_users?'))return [{active:true,role:'superadmin',tenant_id:'tenant-a'}];if(path.startsWith('tenants?'))return [{active:true}];throw new Error('403 secret internal details');};const response=await GET(request());assert.equal(response.status,503);assert.doesNotMatch(JSON.stringify(await response.json()),/secret/);
});
test('GET exposes full canonical current selector options including MY and SG, and disables saving when schema is absent',async()=>{
 globalThis.__actor={email:'admin@example.test'};globalThis.__rest=async path=>{if(path.startsWith('customer_users?'))return [{active:true,role:'superadmin',tenant_id:'tenant-a'}];if(path.startsWith('tenants?'))return [{active:true}];if(path.startsWith('stores?'))return [{id:'shopee-supu',name:'Supu',display_name:'SUPU • 食补',platform:'Shopee MY'},{id:'shopee-skindae-sg',name:'SkinDae SG',display_name:null,platform:'Shopee SG'},{id:'shopee-skindae-sg-by-ctg4u',name:'Alias',display_name:null,platform:'Shopee SG'}];throw new Error('Supabase REST 404: {"code":"PGRST205"}');};const response=await GET(request());assert.equal(response.status,200);const data=await response.json();assert.equal(data.settingsAvailable,false);assert.equal(data.storeOptions.length,2);assert.ok(data.storeOptions.some(s=>s.name==='SUPU • 食补'));assert.ok(data.storeOptions.some(s=>s.platform==='Shopee SG'));assert.ok(data.storeOptions.every(s=>s.id!=='shopee-skindae-sg-by-ctg4u'));assert.equal(data.summaries[0].collected,null);
});
test('source rate preview eligibility is stamped from authenticated tenant, never caller tenant or colliding roster identity',async()=>{
 globalThis.__actor={email:'admin@example.test'};
 try{for(const tenant of ['tenant-a','j-packaging']){
  globalThis.__fallback=()=>({invoiceMonth:'2026-10',today:'2026-10-27',stores:[{id:'roster-2026-10-my-3',rosterKey:'roster-2026-10-my-3',project:'DRSMILE',currency:'MYR',expectedNetFee:null,previewRateDefaultsEligible:true}],summaries:[]});
  globalThis.__rest=async path=>{if(path.startsWith('customer_users?'))return [{active:true,role:'superadmin',tenant_id:tenant}];if(path.startsWith('tenants?'))return [{active:true}];if(path.startsWith('stores?'))return [];throw new Error('Supabase REST 404: {"code":"PGRST205"}');};
  const response=await GET(new Request('https://example.test/api/admin/account?invoiceMonth=2026-10&tenantId=j-packaging'));assert.equal(response.status,200);const data=await response.json();assert.equal(data.stores[0].previewRateDefaultsEligible,tenant==='j-packaging');
 }}finally{delete globalThis.__fallback;}
});
test('only authorized exact Bonlife SG receives previous-service-month BNM evidence; caller fields cannot inject it',async()=>{
 globalThis.__actor={email:'admin@example.test'};
 let calls=0;
 try{for(const tenant of ['tenant-a','j-packaging']){
  globalThis.__fallback=()=>({invoiceMonth:'2026-10',today:'2026-10-27',stores:[{id:'bonlife',rosterKey:'roster-2026-10-sg-3',project:'BONLIFE SG',currency:'SGD',previewServiceFxRate:{rate:'999'}},{id:'other',rosterKey:'other',project:'OTHER SG',currency:'SGD',previewServiceFxRate:{rate:'999'}}],summaries:[]});
  globalThis.__bnm=async month=>{calls++;assert.equal(month,'2026-10');return {serviceMonth:'2026-09',rate:'3.197',policy:'bnm-service-average',verified:true,reference:'https://storage.data.gov.my/finsector/exr/monthly.csv'};};
  globalThis.__rest=async path=>{if(path.startsWith('customer_users?'))return [{active:true,role:'superadmin',tenant_id:tenant}];if(path.startsWith('tenants?'))return [{active:true}];if(path.startsWith('stores?'))return [];throw Error('Supabase REST 404: {"code":"PGRST205"}');};
  const response=await GET(request());assert.equal(response.status,200);const data=await response.json();assert.equal(data.stores[0].previewServiceFxRate?.rate,tenant==='j-packaging'?'3.197':undefined);assert.equal(data.stores[1].previewServiceFxRate,undefined);
 }assert.equal(calls,1);}finally{delete globalThis.__fallback;delete globalThis.__bnm;}
});
