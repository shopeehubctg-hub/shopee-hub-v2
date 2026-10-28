import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const schema=`const table=name=>new Proxy({_name:name},{get:(t,k)=>k==='_name'?t[k]:{table:name,key:k}});export const customerUsers=table('members'),packages=table('packages'),packageVersions=table('versions'),packagePrices=table('prices'),packagePlatformSkus=table('skus'),packageAuditLog=table('audit'),stores=table('stores'),userStoreAccess=table('access');`;
const built=await build({entryPoints:['app/api/packages/route.ts'],bundle:true,write:false,platform:'node',format:'esm',packages:'external',plugins:[{name:'route-fixtures',setup(b){
 b.onResolve({filter:/\.\/compact-read$/},()=>({path:'compact',namespace:'fixture'}));
 b.onResolve({filter:/\/deployment-isolation$/},()=>({path:"isolation",namespace:"fixture"}));b.onResolve({filter:/\/db\/schema$/},()=>({path:'schema',namespace:'fixture'}));b.onResolve({filter:/\/db$/},()=>({path:'db',namespace:'fixture'}));b.onResolve({filter:/^drizzle-orm$/},()=>({path:'drizzle',namespace:'fixture'}));b.onResolve({filter:/\/chatgpt-auth$/},()=>({path:'auth',namespace:'fixture'}));b.onResolve({filter:/\/module-access$/},()=>({path:'access',namespace:'fixture'}));b.onResolve({filter:/\.\/history-sync$/},()=>({path:'sync',namespace:'fixture'}));b.onResolve({filter:/\.\/version-change-summary$/},()=>({path:'summary',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:({compact:`export async function readCompactPackageRows(db,ids){const s=globalThis.marketFixture;const selected=new Set();for(const id of ids){const v=s.versions.filter(v=>v.packageId===id).toSorted((a,b)=>b.version-a.version);for(const row of [v[0],v.find(v=>v.sheetSyncStatus==='synced'),v[0]?.calculatorSettings?._packageEnded===true?v[1]:null])if(row)selected.add(row.id);}return [s.versions.filter(v=>ids.includes(v.packageId)&&selected.has(v.id)).toSorted((a,b)=>b.version-a.version),s.prices.filter(p=>ids.includes(p.packageId)&&selected.has(p.versionId)).toSorted((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))),s.skus.filter(p=>ids.includes(p.packageId)&&selected.has(p.versionId))];}`,isolation:`export const deploymentTarget=()=>globalThis.marketFixture?.environment??"local";`,schema,db:`export const getDb=async()=>globalThis.marketFixture.db;`,auth:`export const getChatGPTUser=async()=>globalThis.marketFixture.actor;`,access:`export const canAccessModule=async(db,m)=>m.active&&globalThis.marketFixture.moduleAllowed;export const canAccessStore=async(db,m,id)=>m.active&&globalThis.marketFixture.stores.some(s=>s.id===id&&s.tenantId===m.tenantId);`,drizzle:`export const eq=(c,v)=>r=>r[c.key]===v;export const isNull=c=>r=>r[c.key]==null;export const and=(...f)=>r=>f.every(x=>x(r));export const inArray=(c,v)=>r=>v.includes(r[c.key]);export const desc=c=>({column:c,direction:-1});`,sync:`export async function syncHistoryToGoogleSheet(payload){globalThis.marketFixture.deliveries.push(payload);return {status:'synced'};}`,summary:`export const versionChangeSummary=async()=> 'Package update';`})[path]}));
}}]});
const {POST,GET,PATCH}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
function fixture(market='TH'){
 const state={actor:{email:'admin@example.test'},moduleAllowed:true,members:[{id:1,email:'admin@example.test',tenantId:'tenant',role:'superadmin',active:true,storeAccessMode:'all',moduleAccessMode:'role_default'}],stores:[{id:'store',tenantId:'tenant',name:'Test store',displayName:'Test store',platform:`Shopee ${market}`}],packages:[],versions:[],prices:[],skus:[],audit:[],access:[],deliveries:[]};
 const db={select(){let table,filter=()=>true,limit=Infinity,orders=[];const q={from(t){table=t._name;return q;},where(f){filter=f;return q;},innerJoin(){return q;},orderBy(...o){orders=o;return q;},for(){return q;},limit(n){limit=n;return q;},then(resolve,reject){let rows=state[table].filter(filter);for(const order of orders.toReversed())rows=rows.toSorted((a,b)=>((a[order.column.key]??'')>(b[order.column.key]??'')?1:(a[order.column.key]??'')<(b[order.column.key]??'')?-1:0)*order.direction);return Promise.resolve(rows.slice(0,limit)).then(resolve,reject);}};return q;},insert(t){return {values(values){const rows=(Array.isArray(values)?values:[values]).map(row=>({createdAt:new Date().toISOString(),...(t._name==='packages'?{deletedAt:null}:{}),...structuredClone(row)}));let applied=false;const apply=()=>{if(!applied){state[t._name].push(...rows);applied=true;}return rows;};return {returning:()=>Promise.resolve(apply()),then:(yes,no)=>Promise.resolve(apply()).then(yes,no)};}};},update(t){return {set(values){return {where(filter){state[t._name].filter(filter).forEach(row=>Object.assign(row,structuredClone(values)));return Promise.resolve([]);}};}};},async transaction(fn){const before=structuredClone({...state,db:undefined});try{return await fn(db);}catch(error){Object.assign(state,before);state.db=db;throw error;}}};state.db=db;globalThis.marketFixture=state;return state;
}
const payload=(markets=['TH'])=>({mode:'draft',storeId:'store',name:'TH/PH test',markets,platforms:[{platform:'Shopee',packageSku:'TEST-SKU'}],components:[{inventorySku:'ITEM',name:'Item',quantity:1,kind:'product'}],priceSchedules:markets.flatMap(market=>['non_campaign','campaign'].map(priceType=>({market,priceType,promotionType:'custom',originalPrice:'123.45',sellingPrice:'99.99',effectiveFrom:'2026-01-01',effectiveTo:'2030-12-31'})))});
const request=body=>new Request('https://test.local/api/packages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const read=async()=>{const response=await GET(new Request('https://test.local/api/packages?storeId=store'));assert.equal(response.status,200);return (await response.json()).packages;};
const patch=body=>PATCH(request(body));
process.env.GOOGLE_SHEETS_HISTORY_WEBHOOK_URL='https://history.test';process.env.GOOGLE_SHEETS_HISTORY_SECRET='test';
test('TH/PH save cents, read and edit immutable versions; draft emits no Sheet, publish and End remain idempotent',async()=>{
 for(const [market,currency] of [['TH','THB'],['PH','PHP']]){
  const state=fixture(market);let response=await POST(request(payload([market])));assert.equal(response.status,201,JSON.stringify(await response.clone().json()));let created=await response.json();assert.equal(state.deliveries.length,0);assert.equal(state.prices[0].currency,currency);assert.equal(state.prices[0].originalPrice,12345);assert.equal(state.prices[0].sellingPrice,9999);
  let rows=await read();assert.equal(rows[0].priceSchedules[0].market,market);assert.equal(rows[0].priceSchedules[0].sellingPrice,99.99);
  response=await POST(request({...payload([market]),packageId:created.packageId,expectedVersion:1,name:'Edited',priceSchedules:payload([market]).priceSchedules.map(price=>({...price,sellingPrice:'88.88'}))}));assert.equal(response.status,201);assert.equal(state.versions.length,2);assert.equal(state.prices.find(price=>price.versionId===state.versions[0].id).sellingPrice,9999);assert.equal(state.deliveries.length,0);
  response=await patch({action:'publish',packageId:created.packageId});assert.equal(response.status,200,JSON.stringify(await response.clone().json()));assert.equal(state.deliveries.length,1);assert.match(state.deliveries[0].promotionType,new RegExp(market+' Campaign'));assert.equal(state.deliveries[0].changeId,created.packageId+'-v2');
  rows=await read();assert.equal(rows[0].history.length,2);assert.equal(rows[0].history[0].priceSchedules[0].market,market);assert.equal(rows[0].priceSchedules[0].sellingPrice,88.88);
  response=await patch({action:'end',packageId:created.packageId,expectedVersion:2});assert.equal(response.status,200,JSON.stringify(await response.clone().json()));assert.equal(state.versions.length,3);assert.equal(state.deliveries.at(-1).action,'Package Ended');assert.match(state.versions.at(-1).changeNote,new RegExp(market==='TH'?'Thailand':'Philippines'));
  assert.equal((await patch({action:'end',packageId:created.packageId,expectedVersion:2})).status,200);assert.equal(state.versions.length,3);assert.equal(state.deliveries.length,2);
 }
});
test('mixed MY SG TH PH preserve currencies and shared dates; invalid or divergent markets cannot mutate',async()=>{
 const state=fixture();const body=payload(['MY','SG','TH','PH']);assert.equal((await POST(request(body))).status,201);assert.deepEqual([...new Set(state.prices.map(price=>price.currency))].sort(),['MYR','PHP','SGD','THB']);assert.deepEqual([...new Set((await read())[0].priceSchedules.map(price=>price.market))].sort(),['MY','PH','SG','TH']);
 for(const invalid of [payload(['VN']),{...payload(['MY','SG','TH','PH']),priceSchedules:body.priceSchedules.map(price=>price.market==='PH'?{...price,effectiveTo:'2030-12-30'}:price)}]){const before=state.prices.length;const response=await POST(request(invalid));assert.equal(response.status,400);assert.equal(state.prices.length,before);}
});
test('currency remains authoritative for historical TH/PH rows, and tenant/module access checks still apply',async()=>{
 const state=fixture();assert.equal((await POST(request(payload(['TH','PH'])))).status,201);state.prices.forEach(price=>price.market='MY');const rows=await read();assert.deepEqual([...new Set(rows[0].priceSchedules.map(price=>price.market))].sort(),['PH','TH']);assert.deepEqual([...new Set(rows[0].history[0].priceSchedules.map(price=>price.market))].sort(),['PH','TH']);
 state.stores[0].tenantId='other';assert.equal((await POST(request(payload()))).status,403);state.stores[0].tenantId='tenant';state.moduleAllowed=false;assert.equal((await POST(request(payload()))).status,403);state.actor=null;assert.equal((await POST(request(payload()))).status,401);
});
test('store timezone determines lifecycle and End day, even for a shared four-market package',async()=>{
 const RealDate=globalThis.Date;globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-10-28T16:30:00Z']));}static now(){return new RealDate('2026-10-28T16:30:00Z').getTime();}};
 try{for(const [market,status] of [['TH','active'],['PH','expired']]){const state=fixture(market);const body={...payload(['MY','SG','TH','PH']),mode:'publish'};body.priceSchedules=body.priceSchedules.map(price=>({...price,effectiveFrom:'2026-10-28',effectiveTo:'2026-10-28'}));const response=await POST(request(body));assert.equal(response.status,201,JSON.stringify(await response.clone().json()));assert.equal(state.packages[0].status,status);assert.equal((await read())[0].status,status);if(market==='TH'){const ended=await patch({action:'end',packageId:state.packages[0].id,expectedVersion:1});assert.equal(ended.status,200);assert.equal((await ended.json()).endedDate,'2026-10-28');}}}finally{globalThis.Date=RealDate;}
});


test('compact list retains current pricing and lifecycle but loads one authorized history on demand',async()=>{
 const state=fixture('MY');await POST(request(payload(['MY'])));const id=state.packages[0].id;
 const full=await (await GET(new Request('https://portal.test/api/packages?storeId=store'))).json();
 const compact=await (await GET(new Request('https://portal.test/api/packages?storeId=store&compact=1'))).json();
 assert.equal(full.packages[0].history.length,1);assert.equal(compact.packages[0].history,undefined);assert.equal(compact.packages[0].historyLoaded,false);
 for(const key of ['status','version','durationType','priceSchedules','components','pendingVersion'])assert.deepEqual(compact.packages[0][key],full.packages[0][key]);
 assert.ok(JSON.stringify(compact).length<JSON.stringify(full).length);
 const historyResponse=await GET(new Request(`https://portal.test/api/packages?storeId=store&packageId=${id}&history=1`));assert.equal(historyResponse.status,200);const history=await historyResponse.json();assert.equal(history.packageId,id);assert.deepEqual(history.history,full.packages[0].history);
 state.packages[0].deletedAt=new Date().toISOString();assert.equal((await GET(new Request(`https://portal.test/api/packages?storeId=store&packageId=${id}&history=1`))).status,404);
 state.packages[0].deletedAt=null;state.packages[0].tenantId='other';assert.equal((await GET(new Request(`https://portal.test/api/packages?storeId=store&packageId=${id}&history=1`))).status,404);
 state.moduleAllowed=false;assert.equal((await GET(new Request(`https://portal.test/api/packages?storeId=store&packageId=${id}&history=1`))).status,403);
});
test('Staging empty packages do not use Production migration samples, and history rejects missing scope',async()=>{
 const state=fixture('MY');state.environment='staging';assert.deepEqual((await (await GET(new Request('https://portal.test/api/packages?storeId=store'))).json()).packages,[]);
 assert.equal((await GET(new Request('https://portal.test/api/packages?storeId=store&history=1'))).status,400);
 assert.equal((await GET(new Request('https://portal.test/api/packages?packageId=unknown&history=1'))).status,400);
 assert.equal((await GET(new Request('https://portal.test/api/packages?storeId=other&packageId=unknown&history=1'))).status,403);
});

 test('bounded compact reads preserve published, pending, ended and draft behavior',async()=>{
 for(const status of ['active','scheduled','expired','draft','review'])for(const sync of ['pending','failed','not_sent','synced'])for(const ended of [false,true])for(const hasPublished of [false,true]){
 const state=fixture('MY');await POST(request(payload(['MY'])));const base=state.versions[0],price=state.prices[0],sku=state.skus[0],pkg=state.packages[0];
 pkg.status=status;
 state.versions=Array.from({length:4},(_,i)=>({...base,id:'v'+(i+1),version:i+1,sheetSyncStatus:i===3?sync:i===1&&hasPublished?'synced':'not_sent',calculatorSettings:i===3&&ended?{_packageEnded:true}:null}));
 state.prices=state.versions.map(v=>({...price,id:'p'+v.id,versionId:v.id,sellingPrice:v.version*1000,priceType:'non_campaign',effectiveTo:v.version===3?null:price.effectiveTo}));
 state.skus=state.versions.map(v=>({...sku,id:'s'+v.id,versionId:v.id,packageSku:'sku-'+v.id}));
 const full=(await(await GET(new Request('https://test.local/api/packages?storeId=store'))).json()).packages[0];
 const compact=(await(await GET(new Request('https://test.local/api/packages?storeId=store&compact=1'))).json()).packages[0];
 for(const key of ['status','version','durationType','priceSchedules','components','pendingVersion','platforms','calculatorSettings'])assert.deepEqual(compact[key],full[key],JSON.stringify({status,sync,ended,key}));
 if(ended)assert.equal(compact.durationType,'long_term');
 }
 });
