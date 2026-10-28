import assert from 'node:assert/strict';
import {test} from 'node:test';
import {execFileSync} from 'node:child_process';

const {JSDOM}=await import(process.env.BD_DOM_TEST_JSDOM??'jsdom');
const source=`import React,{act} from 'react';import {createRoot} from 'react-dom/client';
import {FeePlansProvider} from './app/fee-plan-context';import {PermissionSettings} from './app/permission-settings';
export {React,act,createRoot};export const App=()=> <FeePlansProvider><PermissionSettings initialEnabledModules={[]}/></FeePlansProvider>;`;
const compiled=execFileSync('node_modules/.bin/esbuild',['--bundle','--format=esm','--platform=node','--target=node22','--loader=tsx','--loader:.css=empty','--jsx=automatic'],{input:source,maxBuffer:10*1024*1024});
const {React,act,createRoot,App}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

const user=(overrides={})=>({id:2,email:'customer@example.test',displayName:'Customer',role:'customer',active:true,moduleAccessMode:'custom',storeAccessMode:'selected',enabledModules:['overview'],storeIds:['shopee-one'],createdAt:'2026-10-01',canManagePermissions:false,editable:true,permissionsVersion:1,...overrides});
const data=(superAdmin,overrides={})=>({users:[user()],stores:[{id:'shopee-one',name:'One',platform:'Shopee MY'}],clientDefaults:[],accountSettingsAvailable:false,
  access:{isSuperAdmin:superAdmin,canManageStores:superAdmin,canManageDefaults:superAdmin,grantableModules:['overview'],...overrides}});

async function withApp(fetchMock,run){
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://portal.test/'});
 const keys=['window','document','navigator','HTMLElement','Event','MouseEvent','MessageChannel','requestAnimationFrame','IS_REACT_ACT_ENVIRONMENT'];
 const saved=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const NativeChannel=globalThis.MessageChannel;const channels=[];
 const previousFetch=globalThis.fetch;
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='requestAnimationFrame'?callback=>callback():key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
 globalThis.MessageChannel=class extends NativeChannel{constructor(){super();channels.push(this);}};
 globalThis.fetch=fetchMock;
 const root=createRoot(document.querySelector('#root'));
 const click=async element=>act(async()=>{element.dispatchEvent(new MouseEvent('click',{bubbles:true}));await Promise.resolve();});
 const change=async(element,value)=>act(()=>{if(element.type==='checkbox')element.checked=value;else element.value=value;element.dispatchEvent(new Event('change',{bubbles:true}));});
 try{await act(()=>root.render(React.createElement(App)));await act(async()=>{});await run({click,change});}
 finally{await act(()=>root.unmount());for(const channel of channels){channel.port1.close();channel.port2.close();}globalThis.fetch=previousFetch;for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}dom.window.close();}
}

test('Super Admin can independently grant Permission Settings; default is off',async()=>{
 const response=data(true);let posted=null;
 await withApp(async(url,init={})=>{
  if(url==='/api/admin/users'&&init.method==='PATCH'){posted=JSON.parse(init.body);return Response.json({...response,users:[user({canManagePermissions:true})]});}
  if(url==='/api/admin/users')return Response.json(response);
  throw Error(`Unexpected fetch ${url}`);
 },async({click,change})=>{
  assert.ok([...document.querySelectorAll('.access-tabs button')].some(button=>button.textContent.trim()==='Stores'));
  await click(document.querySelector('.user-access-row .edit-access'));
  const toggle=[...document.querySelectorAll('.access-modal label')].find(label=>label.textContent.includes('Permission Settings'))?.querySelector('input');
  assert.ok(toggle);assert.equal(toggle.checked,false);
  assert.equal(document.querySelectorAll('.access-check-grid.modules label').length,10);
  await click(toggle);
  assert.equal(toggle.checked,true);
  await click([...document.querySelectorAll('.access-modal button')].find(button=>button.textContent.trim()==='Save user access'));
  await act(async()=>{});
  assert.equal(posted.canManagePermissions,true);
  assert.equal(posted.expectedVersion,1);
  assert.match(posted.requestId,/^[0-9a-f-]{36}$/);
  assert.equal(posted.moduleAccessMode,'custom');
  assert.equal(posted.enabledModules.includes('permission_settings'),false);
 });
});

test('delegate sees only assigned people and grantable modules, with restricted role and scope controls',async()=>{
 const response=data(false);response.users.push(user({id:3,email:'protected@example.test',editable:false}));
 let posted=null;
 await withApp(async(url,init={})=>{
  if(url==='/api/admin/users'&&init.method==='PATCH'){posted=JSON.parse(init.body);return Response.json(response);}
  return url==='/api/admin/users'?Response.json(response):Promise.reject(Error(`Unexpected fetch ${url}`));
 },async({click})=>{
  const tabs=[...document.querySelectorAll('.access-tabs button')].map(button=>button.textContent.trim());
  assert.deepEqual(tabs,['Users & roles']);
  assert.equal(document.querySelectorAll('.user-access-row .edit-access')[1].disabled,true);
  await click(document.querySelector('.user-access-row .edit-access'));
  const modal=document.querySelector('.access-modal');
  assert.equal(modal.textContent.includes('Permission Settings'),false);
  assert.equal([...modal.querySelectorAll('label')].some(label=>label.textContent.trim()==='Role'),false);
  assert.equal(modal.textContent.includes('Role defaults'),false);
  assert.equal(modal.textContent.includes('All stores'),false);
  assert.equal(modal.querySelectorAll('.access-check-grid.modules label').length,1);
  await click([...modal.querySelectorAll('button')].find(button=>button.textContent.trim()==='Save user access'));
  assert.equal(posted.moduleAccessMode,'custom');assert.equal(posted.storeAccessMode,'selected');
  assert.deepEqual(posted.enabledModules,['overview']);
  assert.equal('role' in posted,false);assert.equal('canManagePermissions' in posted,false);
  await click([...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='+ Add user'));
  assert.equal([...document.querySelectorAll('.access-modal label')].some(label=>label.textContent.trim()==='Role'),false);
 });
});

test('load and save errors stay visible and keep the editor usable',async()=>{
 let loadCount=0;let saveCount=0;const requestIds=[];
 await withApp(async(url,init={})=>{
  if(url==='/api/admin/users'&&init.method==='PATCH'){
   requestIds.push(JSON.parse(init.body).requestId);
   saveCount++;if(saveCount===1)return Response.json({error:'Access changed. Refresh first.'},{status:409});
   throw Error('Network unavailable');
  }
  if(url==='/api/admin/users'){
   loadCount++;return loadCount===1?Response.json({error:'Unable to load users'},{status:503}):Response.json(data(true));
  }
  throw Error(`Unexpected fetch ${url}`);
 },async({click})=>{
  assert.match(document.querySelector('[role="alert"]').textContent,/Unable to load users/);
  await click([...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='Retry'));
  await act(async()=>{});
  assert.equal(document.querySelector('.permission-page>.access-error'),null);
  await click(document.querySelector('.user-access-row .edit-access'));
  const save=()=>[...document.querySelectorAll('.access-modal button')].find(button=>button.textContent.trim()==='Save user access');
  await click(save());await act(async()=>{});
  assert.match(document.querySelector('.access-modal [role="alert"]').textContent,/Access changed/);
  assert.ok(document.querySelector('.access-modal'));assert.equal(save().disabled,false);
  await click(save());await act(async()=>{});
  assert.match(document.querySelector('.access-modal [role="alert"]').textContent,/try again/);
  assert.ok(document.querySelector('.access-modal'));assert.equal(save().disabled,false);
  assert.equal(requestIds[0],requestIds[1]);
 });
});

test('initial permissions request shows loading instead of zero users or premature actions',async()=>{
 let resolveRequest;
 await withApp(()=>new Promise(resolve=>{resolveRequest=resolve;}),async()=>{
  assert.match(document.body.textContent,/Loading permissions/);
  assert.doesNotMatch(document.body.textContent,/0 portal users|Add user/);
  await act(async()=>resolveRequest(Response.json(data(true))));
  assert.doesNotMatch(document.body.textContent,/Loading permissions/);
  assert.match(document.body.textContent,/1 portal users/);
 });
});
