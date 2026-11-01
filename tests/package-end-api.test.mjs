import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const schema = `const table=name=>new Proxy({_name:name},{get:(t,k)=>k==='_name'?t[k]:{table:name,key:k}});
export const packages=table('packages'),packageVersions=table('versions'),packagePrices=table('prices'),packagePlatformSkus=table('skus'),packageAuditLog=table('audit'),stores=table('stores');`;
const built=await build({entryPoints:[new URL('../app/api/packages/end-package.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm',packages:'external',plugins:[{name:'end-test-dependencies',setup(b){
  b.onResolve({filter:/db\/schema$/},()=>({path:'schema',namespace:'test'}));
  b.onResolve({filter:/^drizzle-orm$/},()=>({path:'drizzle',namespace:'test'}));
  b.onResolve({filter:/\.\/history-sync$/},()=>({path:'sync',namespace:'test'}));
  b.onLoad({filter:/.*/,namespace:'test'},({path})=>({contents:path==='schema'?schema:path==='drizzle'?`export const eq=(column,value)=>row=>row[column.key]===value; export const isNull=column=>row=>row[column.key]==null; export const and=(...filters)=>row=>filters.every(f=>f(row)); export const desc=column=>column;`:`export async function syncHistoryToGoogleSheet(payload){globalThis.endTest.deliveries.push(payload);return globalThis.endTest.sync;}`}));
}}]});
const {endPackage}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

function fixture({sync='synced',status='active',sheetSyncStatus='synced'}={}){
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur'}).format(new Date());
  const state={deliveries:[],sync:sync==='synced'?{status:'synced'}:{status:'failed',reason:'test outage'},
    packages:[{id:'p',tenantId:'tenant',storeId:'store',name:'Package A',status}],
    versions:[{id:'v1',packageId:'p',version:1,components:[{inventorySku:'SKU',name:'Item',quantity:3,kind:'product'}],sheetSyncStatus,calculatorSettings:{_longTermLifecycle:true}}],
    prices:['MY','SG'].map(market=>({id:market,packageId:'p',versionId:'v1',market,currency:market==='SG'?'SGD':'MYR',priceType:'non_campaign',promotionType:'custom',originalPrice:10000,sellingPrice:9000,effectiveFrom:'2026-01-01',effectiveTo:null})),
    skus:[{id:'sku',packageId:'p',versionId:'v1',storeId:'store',platform:'Shopee',packageSku:'KIT-A'}],audit:[],stores:[{id:'store',name:'Store A'}]};
  globalThis.endTest=state;
  const db={select(){let table,filter=()=>true,limit=Infinity,sort=false;const q={from(t){table=t._name;return q;},where(f){filter=f;return q;},orderBy(){sort=true;return q;},for(){return q;},limit(n){limit=n;return q;},then(resolve,reject){let rows=state[table].filter(filter);if(sort)rows=rows.toSorted((a,b)=>b.version-a.version);return Promise.resolve(rows.slice(0,limit)).then(resolve,reject);}};return q;},
    insert(t){return {values(value){const rows=Array.isArray(value)?value:[value];let applied=false;const apply=()=>{if(!applied){state[t._name].push(...structuredClone(rows));applied=true;}return rows;};return {returning:()=>Promise.resolve(apply()),then:(yes,no)=>Promise.resolve(apply()).then(yes,no)};}};},
    update(t){return {set(values){return {where(filter){state[t._name].filter(filter).forEach(row=>Object.assign(row,values));return Promise.resolve();}};}};},
    async transaction(fn){const before=structuredClone(state);try{return await fn(db);}catch(error){Object.assign(state,before);throw error;}}};
  return {db,state,today};
}

test('ending commits a new snapshot and Expired before delivering History; retries are idempotent',async()=>{
  const {db,state,today}=fixture({sync:'failed'});
  const result=await endPackage(db,'tenant','p','customer@example.com',1);
  const body=await result.json();
  assert.equal(result.status,200);assert.equal(body.status,'expired');assert.match(body.warning,/pending/);
  assert.equal(state.packages[0].status,'expired');
  assert.equal(state.versions.length,2);assert.equal(state.audit.length,1);
  assert.equal(state.versions[0].sheetSyncStatus,'synced');
  const ended=state.versions[1];
  assert.equal(ended.effectiveTo,today);assert.equal(ended.createdBy,'customer@example.com');
  assert.deepEqual(ended.components,state.versions[0].components);
  assert.equal(state.prices.filter(p=>p.versionId===ended.id).length,2);
  assert.ok(state.prices.filter(p=>p.versionId===ended.id).every(p=>p.effectiveTo===today&&p.sellingPrice===9000));
  assert.equal(state.deliveries[0].action,'Package Ended');
  assert.equal(state.deliveries[0].changedBy,'customer@example.com');
  assert.equal((await endPackage(db,'tenant','p','customer@example.com',1)).status,200);
  assert.equal(state.versions.length,2);assert.equal(state.deliveries.length,1);
});

test('stale versions, another tenant, drafts and unsynced edits cannot be ended',async()=>{
  for(const [options,tenant,version,expected] of [[{},'tenant',2,409],[{},'other',1,404],[{status:'draft'},'tenant',1,409],[{sheetSyncStatus:'failed'},'tenant',1,409]]){
    const {db,state}=fixture(options);
    assert.equal((await endPackage(db,tenant,'p','actor@example.com',version)).status,expected);
    assert.equal(state.versions.length,1);assert.equal(state.audit.length,0);assert.equal(state.deliveries.length,0);
  }
});
