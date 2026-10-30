import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
async function load(path){const b=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'esm'});return import(`data:text/javascript;base64,${Buffer.from(b.outputFiles[0].text).toString('base64')}`);}
const {effectiveAccessIds,PORTAL_MODULES}=await load('app/module-permissions.ts');
const {scopeLeaderboard}=await load('app/leaderboard-access-model.ts');
const basic='overview_leaderboard',all='overview_leaderboard_all_stores',storeSales='overview_store_sales';
const ids=(mode,custom,tenant=[])=>effectiveAccessIds('customer',mode,new Map(tenant),new Set(custom));
test('section defaults deny and requires all dependency grants',()=>{
 assert(!PORTAL_MODULES.some(m=>m.id===basic||m.id===all));
 assert(!ids('role_default',['overview',basic,all],[[basic,true],[all,true]]).includes(basic));
 assert(!ids('custom',[basic,all]).includes(basic));
 assert(!ids('custom',['overview',all]).includes(all));
 assert(ids('custom',['overview',basic]).includes(basic));
 assert(!ids('custom',['overview',basic]).includes(all));
 assert(ids('custom',['overview',basic,all]).includes(all));
 assert(effectiveAccessIds('superadmin','role_default',new Map(),new Set()).includes(all));
 assert(!PORTAL_MODULES.some(m=>m.id===storeSales));
 assert(!ids('role_default',['overview',storeSales]).includes(storeSales));
 assert(!ids('custom',[storeSales]).includes(storeSales));
 assert(ids('custom',['overview',storeSales]).includes(storeSales));
 assert(effectiveAccessIds('superadmin','role_default',new Map(),new Set()).includes(storeSales));
});
test('scoped board omits hidden names, sums, ranks and partial state',()=>{
 const board={currency:'MYR',status:'partial',updated:null,totalCents:150,pending:[{name:'Secret'}],shops:[{name:'Hidden',storeId:'h',salesCents:100,observed:true,rank:1},{name:'Mine',storeId:'m',salesCents:50,observed:true,rank:2},{name:'Secret',storeId:'s',salesCents:0,observed:false,rank:3}]};
 const scoped=scopeLeaderboard(board,false,new Set(['m']));
 assert.equal(scoped.totalCents,50);assert.equal(scoped.shops.length,1);assert.equal(scoped.shops[0].rank,1);assert.deepEqual(scoped.pending,[]);assert.equal(scoped.status,'complete');
 assert.equal(scopeLeaderboard(board,true,new Set()).shops.length,3);
 assert.equal(scopeLeaderboard(board,false,new Set()).shops.length,0);
});
test('unmapped rows never appear in assigned scope and pending stays unknown',()=>{
 const board={currency:'MYR',status:'pending',updated:null,totalCents:null,pending:[],shops:[{name:'Unknown',storeId:null,salesCents:0,observed:false,rank:0},{name:'Mine',storeId:'m',salesCents:0,observed:false,rank:0}]};
 const scoped=scopeLeaderboard(board,false,new Set(['m']));assert.equal(scoped.shops.length,1);assert.equal(scoped.totalCents,null);assert.equal(scoped.shops[0].rank,0);
});
