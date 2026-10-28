import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

const result=await build({entryPoints:['app/api/dashboard/route.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'dashboard-facts',setup(build){
  build.onResolve({filter:/^(server-only|.*\/(chatgpt-auth|supabase-rest|store-directory|deployment-isolation|product-catalog|store-snapshots|db))$/},args=>({path:args.path.split('/').at(-1),namespace:'dashboard-test'}));
  build.onLoad({filter:/.*/,namespace:'dashboard-test'},args=>({loader:'js',contents:args.path==='chatgpt-auth'?'export async function getChatGPTUser(){return globalThis.__dashboardActor;}':args.path==='supabase-rest'?'export async function supabaseRest(path,init){return globalThis.__dashboardRest(path,init);}':args.path==='deployment-isolation'?'export function deploymentTarget(){return globalThis.__dashboardState.environment;}':args.path==='store-directory'?'export async function storeDirectory(){return {byId:new Map(),links:new Map()};}':args.path==='store-snapshots'?'export const storeSnapshots={"Store A":{overview:[["Sales","RM 999999"]]}};':args.path==='product-catalog'?'export function sourceShopNameFor(name){return name;} export async function readProductCatalogSheet(){globalThis.__dashboardState.sheetCalls++;return null;}':args.path==='db'?'export async function getDb(){globalThis.__dashboardState.dbCalls++;throw Error("Use guarded REST");}':'export {};'}));
}}]});
const {GET}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
let n=0,state;const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const req=query=>new Request(`https://dashboard.test/api/dashboard?${query}`);
beforeEach(()=>{
  process.env.VERCEL='1';process.env.SUPABASE_URL='https://staging.test';
  state=globalThis.__dashboardState={environment:'staging',tenant:`tenant-${++n}`,member:{id:1,role:'superadmin',active:true,can_manage_permissions:false,module_access_mode:'custom',store_access_mode:'all'},modules:['calculator','packages','advertising','actions'],stores:[{id:'store-a',name:'Store A',bigseller_name:'Store A',platform:'Shopee MY'},{id:'store-b',name:'Store B',bigseller_name:'Store B',platform:'Shopee MY'}],calls:[],dbCalls:0,sheetCalls:0,rows:[{store_id:'store-a',performance_date:today,spend:'10',sales:'200',views:100,clicks:10,conversions:2,sold:3,synced_at:new Date().toISOString()},{store_id:'store-b',performance_date:today,spend:'30',sales:'300',views:300,clicks:20,conversions:3,sold:4,synced_at:new Date().toISOString()}],balances:[{store_id:'store-a',source_store_name:'Store A',balance_cents:1200,balance_date:today,imported_at:new Date().toISOString()},{store_id:'store-b',source_store_name:'Store B',balance_cents:7000,balance_date:today,imported_at:new Date().toISOString()}]};
  globalThis.__dashboardActor={email:'owner@test.local'};
  globalThis.__dashboardRest=async(path,init)=>{
    assert.equal(init?.method,undefined,'Dashboard may never mutate facts');state.calls.push(path);const url=new URL(path,'https://rest.test/');const table=url.pathname.slice(1);const p=url.searchParams;
    if(table==='customer_users')return [{...state.member,tenant_id:state.tenant}];
    if(table==='tenants')return [{active:true}];
    if(table==='tenant_module_permissions')return state.modules.map(module_id=>({module_id,enabled:true}));
    if(table==='user_module_permissions')return state.modules.map(module_id=>({module_id,enabled:true}));
    if(table==='user_store_access')return [{store_id:'store-a'}];
    if(table==='stores')return state.stores;
    assert.equal(p.get('tenant_id')===`eq.${state.tenant}`||table==='project_product_catalog',true,'All fact queries must retain the authenticated tenant');
    if(table==='dashboard_snapshots')return [];
    if(table==='co_fund_vouchers')return [{id:1,campaign_name:'Monthly campaign',campaign_date:today,campaign_start_at:null,campaign_end_at:null,voucher_name:'Store voucher',discount_amount:'5.00',currency:'MYR',quantity:3}];
    if(table==='management_actions')return [];
    if(table==='project_product_catalog')return [{item_id:'sku-1',product_name:'Product A',product_category:'A',commission_fee_rate_bps:970,main_product:true,synced_at:new Date().toISOString()}];
    if(table==='ad_balances')return state.balances;
    if(table==='ad_performance_daily'){const ids=p.get('store_id').slice(4,-1).split(',');return state.rows.filter(row=>ids.includes(row.store_id)).slice(Number(p.get('offset')),Number(p.get('offset'))+Number(p.get('limit')));}
    throw Error(`Unexpected table ${table}`);
  };
});

test('Bootstrap and self-fetch modules never read advertising, catalog, snapshots, vouchers or Sheets',async()=>{
  for(const section of ['bootstrap','packages','permissions','account','live_calendar','design']){
    const response=await GET(req(`section=${section}`));assert.equal(response.status,200);const body=await response.json();
    assert.equal(body.environment,'staging');assert.equal(body.stores.length,2);assert.deepEqual(body.adPerformance,[]);assert.equal(body.snapshot,null);assert.equal(body.productProfile,null);assert.match(response.headers.get('server-timing'),/dashboard;dur=/);
  }
  assert.ok(state.calls.every(path=>!/^ad_|^project_product_catalog|^dashboard_snapshots|^co_fund/.test(path)));assert.equal(state.sheetCalls,0);assert.equal(state.dbCalls,0);
});
test('Calculator retains its catalog, snapshot and CoFund inputs, without FullAd or balance Sheets',async()=>{
  const response=await GET(req('section=calculator&storeId=store-a'));const body=await response.json();assert.equal(response.status,200);assert.equal(body.productProfile.products[0].commissionFeeRate,9.7);assert.equal(body.snapshot,null,'Stage must not fall back to a bundled Production snapshot');
  assert.equal(state.calls.filter(path=>path.startsWith('project_product_catalog?')).length,1);assert.equal(body.coFundVouchers[0].discountAmount,'5.00');assert.equal(body.coFundVouchers[0].quantity,3);assert.ok(state.calls.every(path=>!path.startsWith('ad_')));assert.equal(state.sheetCalls,0);
});
test('Overview and Client Action Center retain authorized ad top-up facts; revocation removes them',async()=>{
  for(const section of ['overview','actions']){
    const response=await GET(req(`section=${section}&storeId=store-a`));const body=await response.json();assert.equal(response.status,200);assert.equal(body.adBalance.balance,12);assert.equal(body.adPerformance[0].spend,10);
  }
  state.member.role='customer';state.modules=['actions'];state.calls=[];
  const body=await(await GET(req('section=actions&storeId=store-a'))).json();assert.equal(body.adBalance,null);assert.deepEqual(body.adPerformance,[]);assert.ok(state.calls.every(path=>!path.startsWith('ad_')));
});
test('Advertising uses authorized database balances and weighted totals; no cross-store facts',async()=>{
  const all=await (await GET(req('section=advertising'))).json();assert.equal(all.adPerformance[0].spend,40);assert.equal(all.adPerformance[0].sales,500);assert.equal(all.adPerformance[0].roas,12.5);assert.equal(all.adTopUpOverview.totalStoreCount,2);
  state.member.role='customer';state.member.store_access_mode='selected';
  const own=await (await GET(req('section=advertising'))).json();assert.equal(own.stores.length,1);assert.equal(own.adPerformance[0].spend,10);assert.equal(own.adTopUpOverview,null);
  const denied=await GET(req('section=advertising&storeId=store-b'));assert.equal(denied.status,403);assert.equal(state.sheetCalls,0);
});
test('30-second source cache shares facts only; explicit refresh, project and permission changes are honored',async()=>{
  await GET(req('section=advertising'));await GET(req('section=advertising'));
  assert.equal(state.calls.filter(path=>path.startsWith('ad_performance_daily?')).length,1);
  state.rows[0]={...state.rows[0],spend:'20'};const fresh=await (await GET(req('section=advertising&refresh=1'))).json();assert.equal(fresh.adPerformance[0].spend,50);
  assert.equal(state.calls.filter(path=>path.startsWith('ad_performance_daily?')).length,2);
  state.environment='production';process.env.SUPABASE_URL='https://production.test';await GET(req('section=advertising'));assert.equal(state.calls.filter(path=>path.startsWith('ad_performance_daily?')).length,3);
  state.member.role='customer';state.modules=['calculator'];const denied=await GET(req('section=advertising'));assert.equal(denied.status,403);
  assert.equal(state.calls.filter(path=>path.startsWith('ad_performance_daily?')).length,3,'Revocation must be checked before reusing source facts');
});
test('Unknown modules, signed-out accounts and disabled memberships fail before heavy reads',async()=>{
  assert.equal((await GET(req('section=unknown'))).status,400);globalThis.__dashboardActor=null;assert.equal((await GET(req('section=bootstrap'))).status,401);
  globalThis.__dashboardActor={email:'owner@test.local'};state.member.active=false;assert.equal((await GET(req('section=advertising'))).status,403);assert.ok(state.calls.every(path=>path.startsWith('customer_users?')));
});
