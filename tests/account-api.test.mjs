import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const rosterSource=readFileSync('app/account-roster.ts','utf8').replace("import 'server-only';",'').replaceAll("'./account-roster-data.json'",`'${process.cwd()}/app/account-roster-data.json'`).replaceAll("'./account-selector'",`'${process.cwd()}/app/account-selector.ts'`).replaceAll("'./account-ledger'",`'${process.cwd()}/app/account-ledger.ts'`).replaceAll("'./live-calendar-model'",`'${process.cwd()}/app/live-calendar-model.ts'`).replaceAll("'./markets'",`'${process.cwd()}/app/markets.ts'`);
const rosterCompiled=execFileSync('node_modules/.bin/esbuild',['--bundle','--format=esm','--platform=node','--target=node20','--loader=ts'],{input:rosterSource});
globalThis.__appendMarketStores=(await import(`data:text/javascript;base64,${rosterCompiled.toString('base64')}`)).appendAccountMarketStores;
let source=readFileSync('app/api/admin/account/route.ts','utf8');
source=source.replace(/import \{ bnmServiceRate, bnmMarketServiceRate \}[^;]+;/,"const bnmServiceRate=async(month)=>globalThis.__bnm?.(month);const bnmMarketServiceRate=async(month,currency)=>globalThis.__bnmMarket?.(month,currency);")
.replace(/import \{ getChatGPTUser \}[^;]+;/,"const getChatGPTUser=async()=>globalThis.__actor;")
.replace(/import \{ supabaseRest \}[^;]+;/,"async function supabaseRest<T>(path:string):Promise<T> { return globalThis.__rest(path); }")
.replace(/import \{ accountRosterFallback, mergeAccountRoster, appendAccountMarketStores \}[^;]+;/,"const accountRosterFallback=(...args)=>globalThis.__fallback?.(...args)??null; const mergeAccountRoster=(account,roster)=>account;const appendAccountMarketStores=(...args)=>globalThis.__appendMarketStores(...args);")
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
  globalThis.__fallback=()=>({invoiceMonth:'2026-10',today:'2026-10-27',stores:[{id:'bonlife',rosterKey:'roster-2026-10-sg-3',project:'BONLIFE SG',currency:'SGD',market:'SG',salesCurrency:'SGD',previewServiceFxRate:{rate:'999'}},{id:'other',rosterKey:'other',project:'OTHER SG',currency:'SGD',previewServiceFxRate:{rate:'999'}}],summaries:[]});
  globalThis.__bnm=async month=>{calls++;assert.equal(month,'2026-10');return {serviceMonth:'2026-09',rate:'3.197',policy:'bnm-service-average',verified:true,reference:'https://storage.data.gov.my/finsector/exr/monthly.csv'};};
  globalThis.__rest=async path=>{if(path.startsWith('customer_users?'))return [{active:true,role:'superadmin',tenant_id:tenant}];if(path.startsWith('tenants?'))return [{active:true}];if(path.startsWith('stores?'))return [];throw Error('Supabase REST 404: {"code":"PGRST205"}');};
  const response=await GET(request());assert.equal(response.status,200);const data=await response.json();assert.equal(data.stores[0].previewServiceFxRate?.rate,tenant==='j-packaging'?'3.197':undefined);assert.equal(data.stores[1].previewServiceFxRate,undefined);
 }assert.equal(calls,1);}finally{delete globalThis.__fallback;delete globalThis.__bnm;}
});
test('TH/PH actual tenant stores appear without ledger as pending units with isolated verified BNM evidence',async()=>{
 globalThis.__actor={email:'admin@example.test'};delete globalThis.__fallback;const called=[];
 globalThis.__bnmMarket=async(month,currency)=>{called.push([month,currency]);return {serviceMonth:'2026-09',rate:currency==='THB'?'0.1225':'0.065',policy:'bnm-service-average',verified:true,reference:'https://storage.data.gov.my/finsector/exr/monthly.csv',currency,quotationUnit:1};};
 globalThis.__rest=async path=>{if(path.startsWith('customer_users?'))return [{active:true,role:'superadmin',tenant_id:'tenant-th-ph'}];if(path.startsWith('tenants?'))return [{active:true}];assert.match(path,/tenant_id=eq.tenant-th-ph/);if(path.startsWith('stores?'))return [{id:'th',name:'Thai',display_name:'Thailand Shop',platform:'Shopee TH'},{id:'ph',name:'PH',display_name:null,platform:'Shopee PH'},{id:'my',name:'MY',display_name:null,platform:'Shopee MY'},{id:'sg',name:'SG',display_name:null,platform:'Shopee SG'},{id:'shopee-skindae-sg-by-ctg4u',name:'Alias',display_name:null,platform:'Shopee TH'}];throw Error('Supabase REST 404: {"code":"PGRST205"}');};
 try{const response=await GET(new Request('https://example.test/api/admin/account?invoiceMonth=2026-10&tenantId=other'));assert.equal(response.status,200);const data=await response.json();assert.equal(data.settingsAvailable,false);assert.equal(data.stores.length,2);assert.deepEqual(data.stores.map(row=>row.rosterKey).sort(),['store:ph','store:th']);assert.ok(data.stores.every(row=>row.entity===undefined&&row.rateRule===undefined&&row.termsVersion===undefined&&row.expectedNetFee===null&&row.billed===null&&row.collected===null&&row.outstanding===null));for(const row of data.stores){assert.equal(row.salesCurrency,row.currency);assert.equal(row.previewServiceFxRate.currency,row.currency);assert.equal(row.previewServiceFxRate.quotationUnit,1);assert.equal(row.previewServiceFxRate.serviceMonth,'2026-09');assert.equal(row.previewMarketFxEligible,true);assert.equal(row.previewRateDefaultsEligible,false);}assert.deepEqual(called.sort(),[['2026-10','PHP'],['2026-10','THB']]);assert.equal(data.summaries.find(summary=>summary.currency==='MYR').monthCollected,null);
  globalThis.__bnmMarket=async()=>({serviceMonth:'2026-08',rate:'3.197',policy:'bnm-service-average',verified:true,reference:'test',currency:'SGD',quotationUnit:1});const pending=await (await GET(request())).json();assert.ok(pending.stores.every(row=>row.previewServiceFxRate===undefined));
 }finally{delete globalThis.__bnmMarket;}
});
test('THB/PHP receipts remain in original-currency summaries; actual MYR billing on a Thailand store stays MYR',async()=>{
 globalThis.__actor={email:'admin@example.test'};delete globalThis.__fallback;const updated='2026-10-01T00:00:00Z';const currencyById={th:'THB',ph:'PHP',thmyr:'MYR'};
 const stores=[{id:'th',name:'TH',display_name:null,platform:'Shopee TH'},{id:'ph',name:'PH',display_name:null,platform:'Shopee PH'},{id:'thmyr',name:'TH billed MYR',display_name:null,platform:'Shopee TH'}];
 const tableRows={account_billing_cycles:[{id:'cycle',statement_month:'2026-09-01',invoice_month:'2026-10-01',service_period_start:null,service_period_end:null,updated_at:updated}],account_store_terms:Object.entries(currencyById).map(([id,currency])=>({id,roster_key:'store:'+id,roster_project:id,store_id:id,currency,confirmed:true,effective_from:'2026-01-01',effective_to:null,updated_at:updated})),account_assessments:Object.keys(currencyById).map(id=>({id:'a-'+id,cycle_id:'cycle',term_id:id,expected_net_fee:'100.00',status:'verified',updated_at:updated})),account_invoices:Object.keys(currencyById).map(id=>({id:'i-'+id,assessment_id:'a-'+id,gross_amount:'100.00',credit_amount:'0.00',status:'issued',updated_at:updated})),account_receipts:Object.entries(currencyById).map(([id,currency])=>({id:'r-'+id,collection_date:'2026-10-01',currency,amount:id==='th'?'50.00':id==='ph'?'20.00':'30.00',kind:'receipt',status:'verified',updated_at:updated})),account_receipt_allocations:Object.keys(currencyById).map(id=>({id:'l-'+id,invoice_id:'i-'+id,receipt_id:'r-'+id,amount:id==='th'?'50.00':id==='ph'?'20.00':'30.00',updated_at:updated}))};
 globalThis.__rest=async path=>{if(path.startsWith('customer_users?'))return [{active:true,role:'superadmin',tenant_id:'tenant-ledger'}];if(path.startsWith('tenants?'))return [{active:true}];if(path.startsWith('stores?'))return stores;if(path.startsWith('account_billing_unit_versions?'))return [];return tableRows[path.split('?')[0]]??[];};
 const response=await GET(request());assert.equal(response.status,200);const data=await response.json();assert.equal(data.stores.length,3);for(const [id,currency] of Object.entries(currencyById)){const row=data.stores.find(row=>row.storeId===id);assert.equal(row.currency,currency);assert.equal(row.market,id==='ph'?'PH':'TH');assert.equal(row.salesCurrency,id==='ph'?'PHP':'THB');}
 for(const [currency,collected] of [['THB','50.00'],['PHP','20.00'],['MYR','30.00']]){const summary=data.summaries.find(summary=>summary.currency===currency);assert.equal(summary.collected,collected);assert.equal(summary.billed,'100.00');}assert.equal(data.summaries.find(summary=>summary.currency==='SGD').collected,null);
});

test('a Bonlife roster incorrectly bound to a Thailand store cannot reuse Singapore BNM evidence',async()=>{
 globalThis.__actor={email:'admin@example.test'};let sgCalls=0;
 globalThis.__fallback=()=>({invoiceMonth:'2026-10',statementMonth:'2026-09',today:'2026-10-28',stores:[{id:'bonlife',rosterKey:'roster-2026-10-sg-3',storeId:'thai-store',project:'BONLIFE SG',currency:'SGD',market:'SG',salesCurrency:'SGD'}],summaries:[]});
 globalThis.__bnm=async()=>{sgCalls++;return {serviceMonth:'2026-09',rate:'3.197'};};globalThis.__bnmMarket=async(month,currency)=>({serviceMonth:'2026-09',rate:'0.1225',policy:'bnm-service-average',verified:true,reference:'public-bnm',currency,quotationUnit:1});
 globalThis.__rest=async path=>{if(path.startsWith('customer_users?'))return [{active:true,role:'superadmin',tenant_id:'j-packaging'}];if(path.startsWith('tenants?'))return [{active:true}];if(path.startsWith('stores?'))return [{id:'thai-store',name:'TH',display_name:null,platform:'Shopee TH'}];throw Error('Supabase REST 404: {"code":"PGRST205"}');};
 try{const response=await GET(request());assert.equal(response.status,200);const data=await response.json();assert.equal(data.stores.length,1);assert.equal(data.stores[0].currency,'SGD');assert.equal(data.stores[0].market,'TH');assert.equal(data.stores[0].salesCurrency,'THB');assert.equal(data.stores[0].previewServiceFxRate.currency,'THB');assert.equal(sgCalls,0);}finally{delete globalThis.__fallback;delete globalThis.__bnm;delete globalThis.__bnmMarket;}
});
