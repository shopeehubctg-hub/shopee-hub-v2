import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

const bundle=await build({entryPoints:['app/api/admin/store-exchange-rate/route.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'exchange-test-adapters',setup(build){
  build.onResolve({filter:/^(server-only|.*\/(chatgpt-auth|supabase-rest|account-fx-source))$/},args=>({path:args.path.split('/').at(-1),namespace:'exchange-test'}));
  build.onLoad({filter:/.*/,namespace:'exchange-test'},args=>({loader:'js',contents:args.path==='server-only'?'':args.path==='chatgpt-auth'?'export async function getChatGPTUser(){return globalThis.__fxActor;}':args.path==='supabase-rest'?'export async function supabaseRest(path,options){return globalThis.__fxRest(path,options);}':`export const BNM_MONTHLY_URL='https://storage.data.gov.my/finsector/exr/monthly.csv';export async function bnmMarketServiceRate(month,currency){return globalThis.__fxRate(month,currency);}`}));
}}]});
const {GET}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
let state;
beforeEach(()=>{
  state={member:{tenant_id:'tenant-a',active:true,role:'superadmin'},tenantActive:true,rateCalls:[],reads:[],available:true};
  globalThis.__fxActor={email:'Admin@Example.test'};
  globalThis.__fxRest=async(path,options)=>{assert.equal(options,undefined);state.reads.push(path);return path.startsWith('customer_users?')?[state.member]:[{active:state.tenantActive}];};
  globalThis.__fxRate=async(month,currency)=>{state.rateCalls.push({month,currency});return state.available?{rate:currency==='THB'?'0.1225':'0.065'}:undefined;};
});
const request=(query='market=TH&invoiceMonth=2026-10')=>new Request(`https://portal.test/api/admin/store-exchange-rate?${query}`);

test('TH/PH use authenticated read-only monthly policy and preserve exact rate units',async()=>{
  for(const [market,currency,rate] of [['TH','THB','0.1225'],['PH','PHP','0.065']]){
    const response=await GET(request(`market=${market}&invoiceMonth=2026-10&tenant=other&rate=999&currency=SGD`));
    assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private.*no-store/);
    assert.deepEqual(await response.json(),{status:'available',market,invoiceMonth:'2026-10',serviceMonth:'2026-09',policy:'bnm-service-average',currency,quotationUnit:1,rate,reference:'https://storage.data.gov.my/finsector/exr/monthly.csv'});
  }
  assert.deepEqual(state.rateCalls,[{month:'2026-10',currency:'THB'},{month:'2026-10',currency:'PHP'}]);
  assert.ok(state.reads.every(path=>!path.includes('other')));
  assert.ok(state.reads.some(path=>path.includes('id=eq.tenant-a')));
});
test('authentication, Super Admin and tenant activation fail before external rate access',async()=>{
  globalThis.__fxActor=null;assert.equal((await GET(request())).status,401);
  globalThis.__fxActor={email:'admin@test'};state.member.role='customer';assert.equal((await GET(request())).status,403);
  state.member.role='superadmin';state.member.active=false;assert.equal((await GET(request())).status,403);
  state.member.active=true;state.tenantActive=false;assert.equal((await GET(request())).status,403);
  assert.equal(state.rateCalls.length,0);
});
test('SG/MY fixed policies are untouched and invalid requests never fetch',async()=>{
  for(const query of ['market=SG&invoiceMonth=2026-10','market=MY&invoiceMonth=2026-10','market=XX&invoiceMonth=2026-10','market=TH&invoiceMonth=2026-13','market=PH&invoiceMonth=invalid'])assert.equal((await GET(request(query))).status,400);
  assert.equal(state.rateCalls.length,0);
});
test('missing service month stays pending; transport or membership errors remain errors',async()=>{
  state.available=false;const response=await GET(request('market=PH&invoiceMonth=2027-01'));const data=await response.json();
  assert.equal(data.status,'pending');assert.equal(data.rate,null);assert.equal(data.serviceMonth,'2026-12');
  globalThis.__fxRest=async()=>{throw Error('network failure');};assert.equal((await GET(request())).status,503);
});
