import test, {beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

const bundle=await build({entryPoints:['app/api/admin/users/route.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'permission-test-adapters',setup(build){
  build.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'permissions-test'}));
  build.onResolve({filter:/\/(chatgpt-auth|supabase-rest|store-directory|account-security-server)$/},args=>({path:args.path.split('/').at(-1),namespace:'permissions-test'}));
  build.onLoad({filter:/.*/,namespace:'permissions-test'},args=>({loader:'js',contents:args.path==='account-security-server'?'export async function accountSecurityGate(){return null;} export async function accountAccessGranted(){return true;}':args.path==='chatgpt-auth'?'export async function getChatGPTUser(){return globalThis.__permissionActor;}':args.path==='supabase-rest'?'export async function supabaseRest(path,options){return globalThis.__permissionRest(path,options);} export function supabaseConfig(){return {url:"https://auth.test",secret:"server-test-key"};}':args.path==='store-directory'?'export async function storeDirectory(){return [];} export function storeDetails(){return {};}':'export {};'}));
}}]});
const {GET,PATCH,POST}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
let state;
const request=(body,extra={})=>new Request('https://portal.test/api/admin/users',{method:'PATCH',headers:{origin:'https://portal.test','Content-Type':'application/json',...extra},body:JSON.stringify(body)});
beforeEach(()=>{
  const base={tenant_id:'tenant-a',active:true,module_access_mode:'custom',store_access_mode:'selected',display_name:null,created_at:'2026-10-28',permissions_version:0};
  state={tenantActive:true,reads:[],writes:[],users:[{...base,id:1,email:'owner@test.local',role:'superadmin',can_manage_permissions:false},{...base,id:2,email:'delegate@test.local',role:'manager',can_manage_permissions:true},{...base,id:3,email:'client@test.local',role:'customer',can_manage_permissions:false},{...base,id:4,email:'other@test.local',role:'customer',can_manage_permissions:false}],modules:['calculator','packages','advertising','actions'],stores:[{id:'store-a',name:'A',platform:'Shopee MY'},{id:'store-b',name:'B',platform:'Shopee MY'}],assignments:[{user_id:2,store_id:'store-a'},{user_id:3,store_id:'store-a'},{user_id:4,store_id:'store-b'}]};
  globalThis.__permissionActor={email:'owner@test.local'};
  globalThis.__permissionRest=async(path,options)=>{
    if(options?.method==='POST'&&path==='rpc/save_user_access'){state.writes.push({path,body:JSON.parse(options.body)});if(state.rpcError)throw Error(state.rpcError);return {saved:true};}
    if(options?.method==='POST'&&path==='customer_users'){state.writes.push({path,body:JSON.parse(options.body)});return;}
    assert.equal(options?.method===undefined||path==='rpc/account_store_setup_v2_available',true,`Unexpected mutation: ${path}`);
    state.reads.push(path);
    if(path.startsWith('customer_users?')){const email=path.match(/&email=eq\.([^&]+)/)?.[1];return email?state.users.filter(u=>u.email===decodeURIComponent(email)):state.users;}
    if(path.startsWith('tenants?'))return [{active:state.tenantActive}];
    if(path.startsWith('tenant_module_permissions?'))return ['overview','design','calculator','packages','advertising','orders','health','protection','actions','live_calendar'].map(module_id=>({module_id,enabled:state.modules.includes(module_id)}));
    if(path.startsWith('user_module_permissions?')){const id=Number(path.match(/&user_id=eq\.(\d+)/)?.[1]);return state.users.filter(u=>!id||u.id===id).flatMap(u=>state.modules.map(module_id=>({user_id:u.id,module_id,enabled:true})));}
    if(path.startsWith('stores?'))return state.stores;
    if(path.startsWith('user_store_access?')){assert.match(path,/enabled=eq.true/);const id=Number(path.match(/&user_id=eq\.(\d+)/)?.[1]);return state.assignments.filter(row=>!id||row.user_id===id);}
    if(path.startsWith('account_billing_unit_versions?'))return [];
    if(path==='rpc/account_store_setup_v2_available')return true;
    throw Error(`Unexpected path ${path}`);
  };
});

test('Super Admin can see the independent switch without adding a default client module',async()=>{
  const response=await GET();assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
  const data=await response.json();assert.equal(data.access.isSuperAdmin,true);assert.equal(data.users.find(u=>u.id===2).canManagePermissions,true);assert.equal(data.users.find(u=>u.id===3).canManagePermissions,false);
  assert.deepEqual(data.clientDefaults,state.modules);assert.equal(data.clientDefaults.includes('permission_settings'),false);assert.equal(data.users.find(u=>u.id===3).permissionsVersion,0);
});
test('Explicit delegate sees only manageable customer accounts and authorized stores',async()=>{
  globalThis.__permissionActor={email:'delegate@test.local'};const response=await GET();assert.equal(response.status,200);const data=await response.json();
  assert.deepEqual(data.users.map(u=>u.id),[3]);assert.deepEqual(data.stores.map(s=>s.id),['store-a']);assert.equal(data.access.isSuperAdmin,false);assert.equal(data.access.canManageDefaults,false);
  state.users[2].can_manage_permissions=true;assert.deepEqual((await (await GET()).json()).users,[]);
});
test('Grant is deny-by-default for every non-Super Admin, including manager role defaults',async()=>{
  globalThis.__permissionActor={email:'delegate@test.local'};state.users[1].can_manage_permissions=false;state.users[1].module_access_mode='role_default';
  assert.equal((await GET()).status,403);state.users[1].can_manage_permissions=true;state.users[1].active=false;assert.equal((await GET()).status,403);
  state.users[1].active=true;state.tenantActive=false;assert.equal((await GET()).status,403);globalThis.__permissionActor=null;assert.equal((await GET()).status,401);assert.equal(state.writes.length,0);
});
test('User save uses one atomic RPC and authenticated scope; client cannot inject tenant or actor',async()=>{
  const response=await PATCH(request({id:3,displayName:'Client',role:'customer',active:true,moduleAccessMode:'custom',enabledModules:state.modules,storeAccessMode:'selected',storeIds:['store-a'],canManagePermissions:true,expectedVersion:0,requestId:'e6454d2d-fcc2-4ce5-9de2-01e815d2a0ee',tenant:'evil',actor:'evil',email:'evil@test.local'}));
  assert.equal(response.status,200);assert.equal(state.writes.length,1);const write=state.writes[0];assert.equal(write.path,'rpc/save_user_access');assert.equal(write.body.p_tenant,'tenant-a');assert.equal(write.body.p_actor,'owner@test.local');assert.equal(write.body.p_target_id,3);assert.equal(write.body.p_payload.canManagePermissions,true);assert.equal('tenant' in write.body.p_payload,false);assert.equal('email' in write.body.p_payload,false);
});
test('Forged requests and malformed identifiers never mutate; RPC errors stay visible and private',async()=>{
  assert.equal((await PATCH(request({id:3},{origin:'https://evil.test'}))).status,403);assert.equal((await PATCH(request({id:'3'}))).status,400);assert.equal(state.writes.length,0);
  state.rpcError='PERMISSION_SCOPE: hidden database details';const response=await PATCH(request({id:3}));assert.equal(response.status,403);assert.doesNotMatch(JSON.stringify(await response.json()),/hidden database/);
});
test('Delegate cannot create a privileged role; duplicate login does not touch existing users',async()=>{
  globalThis.__permissionActor={email:'delegate@test.local'};
  assert.equal((await POST(request({email:'new@test.local',role:'superadmin'}))).status,403);
  assert.equal((await POST(request({email:'client@test.local',role:'customer'}))).status,409);assert.equal(state.writes.length,0);
});
