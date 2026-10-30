import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();

async function compile(entry){return (await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'mock',setup(b){
 b.onResolve({filter:/permission-management|chatgpt-auth|supabase-rest/},a=>({path:a.path,namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},a=>({loader:'js',contents:a.path.includes('permission-management')?`export const samePermissionOrigin=()=>globalThis.sameOrigin;export const permissionManagement=()=>globalThis.manage();export const permissionSaveError=e=>Response.json({error:'failed'},{status:503});`:a.path.includes('chatgpt-auth')?`export const getChatGPTUser=()=>globalThis.actor;`:`export const supabaseRest=(p,o)=>globalThis.rest(p,o);`}));
 }}]})).outputFiles[0].text;}

test('bulk release is SA-only, validates capability and derives tenant and actor server-side',async()=>{
 const code=await compile('app/api/admin/feature-release/route.ts');const ctx={module:{exports:{}},exports:{},Response,Request,URL,crypto,sameOrigin:true,writes:[],manage:async()=>({member:{tenant_id:'tenant-a'},actor:'owner@example.test',isSuperAdmin:true}),rest:async(p,o)=>{ctx.writes.push({p,o});return {granted:4,skipped:1,alreadyEnabled:2};}};vm.runInNewContext(code,ctx);const post=body=>ctx.module.exports.POST(new Request('https://test/api/admin/feature-release',{method:'POST',headers:{origin:'https://test','content-type':'application/json'},body:JSON.stringify(body)}));
 let response=await post({moduleId:'packages',requestId:'4bcb2c62-f394-4ae8-8e60-e5d194aed183',tenant:'evil'});assert.equal(response.status,200);assert.equal(ctx.writes.length,1);assert.equal(ctx.writes[0].p,'rpc/grant_feature_to_all');const payload=JSON.parse(ctx.writes[0].o.body);assert.equal(payload.p_tenant,'tenant-a');assert.equal(payload.p_actor,'owner@example.test');assert.equal(payload.p_module,'packages');assert.equal(payload.p_request_id,'4bcb2c62-f394-4ae8-8e60-e5d194aed183');assert.equal('tenant' in payload,false);
 response=await post({moduleId:'overview_leaderboard_all_stores',requestId:crypto.randomUUID()});assert.equal(response.status,400);
 ctx.manage=async()=>({member:{tenant_id:'tenant-a'},actor:'delegate@example.test',isSuperAdmin:false});assert.equal((await post({moduleId:'packages',requestId:crypto.randomUUID()})).status,403);
});

test('feature notification reads and acknowledgements are scoped to authenticated member',async()=>{
 const code=await compile('app/api/feature-announcements/route.ts');const ctx={module:{exports:{}},exports:{},Response,Request,URL,sameOrigin:true,actor:{email:'user@example.test'},writes:[],rest:async(p,o)=>{if(p.startsWith('customer_users?'))return [{id:7,tenant_id:'tenant-a',active:true}];if(p.startsWith('tenants?'))return [{active:true}];if(p.startsWith('feature_grant_notifications?'))return [{id:11,module_id:'packages',granted_at:'2026-10-30T00:00:00Z'}];ctx.writes.push({p,o});return {acknowledged:1};}};vm.runInNewContext(code,ctx);const {GET,PATCH}=ctx.module.exports;
 let response=await GET();assert.equal(response.status,200);assert.deepEqual((await response.json()).features.map(x=>x.moduleId),['packages']);
 response=await PATCH(new Request('https://test/api/feature-announcements',{method:'PATCH',headers:{origin:'https://test','content-type':'application/json'},body:JSON.stringify({ids:[11],userId:999})}));assert.equal(response.status,200);assert.equal(ctx.writes[0].p,'rpc/ack_feature_grant_notifications');const payload=JSON.parse(ctx.writes[0].o.body);assert.equal(payload.p_user_id,7);assert.equal(payload.p_tenant,'tenant-a');assert.deepEqual(payload.p_ids,[11]);assert.equal('userId' in payload,false);
});

test('server module checks include additive grants for role defaults',async()=>{
 const source=await fs.readFile(path.join(root,'app/module-access.ts'),'utf8');
 assert.match(source,/effectiveAccessIds/);assert.match(source,/additiveGrant/);
 const calendar=await fs.readFile(path.join(root,'app/api/live-calendar/route.ts'),'utf8');
 assert.match(calendar,/additive_grant/);assert.match(calendar,/const additive=/);
});
