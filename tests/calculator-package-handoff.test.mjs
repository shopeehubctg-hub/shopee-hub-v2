import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';

const dir=new URL('../node_modules/.calculator-handoff-test/',import.meta.url);
await mkdir(dir,{recursive:true});
await build({entryPoints:[new URL('../app/page.tsx',import.meta.url).pathname],outfile:new URL('page.mjs',dir).pathname,bundle:true,format:'esm',platform:'browser',packages:'external',jsx:'automatic',logLevel:'silent'});
const {default:Home}=await import(new URL('page.mjs',dir));
const waitFor=async(check)=>{for(let i=0;i<150;i++){if(check())return;await act(async()=>new Promise(r=>setTimeout(r,10)));}assert.ok(check(),'expected handoff UI did not arrive');};
async function setup({open=()=>null,storageBlocked=false,modules=['calculator','packages'],storeId='test-store'}={}){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://local.test/?section=calculator'});
 const values={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,MouseEvent:dom.window.MouseEvent,crypto:dom.window.crypto,IS_REACT_ACT_ENVIRONMENT:true};
 const prior=Object.fromEntries([...Object.keys(values),'fetch'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const [k,v]of Object.entries(values))Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:v});
 dom.window.open=open;
 dom.window.scrollTo=()=>{};
 if(storageBlocked)Object.defineProperty(dom.window.Storage.prototype,'setItem',{value(){throw new dom.window.DOMException('Storage full','QuotaExceededError');}});
 const calls=[];
 globalThis.fetch=async(url,options={})=>{calls.push({url,options});const body=String(url).startsWith('/api/dashboard')?{environment:'staging',user:{email:'client@example.test'},access:{role:'customer',enabledModules:modules,clientEnabledModules:modules,canManagePermissions:false},stores:[{id:'test-store',name:'Test Store',platform:'Shopee MY',contacts:[]}],selectedStoreId:storeId,snapshot:null,actions:[],adPerformance:[],adBalance:null,productProfile:null,coFundVouchers:[]}:String(url).includes('inventory-skus')?{products:[],canEdit:false}:{packages:[],source:'database',canDelete:false};return{ok:true,status:200,json:async()=>body};};
 const {createRoot}=await import('react-dom/client');const root=createRoot(dom.window.document.getElementById('root'));
 await act(async()=>root.render(React.createElement(Home)));
 await waitFor(()=>dom.window.document.querySelector('.create-all-packages'));
 const click=async(text)=>{const b=[...dom.window.document.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(b,`missing ${text}`);await act(async()=>b.click());};
 return {dom,calls,click,close:async()=>{await act(async()=>root.unmount());dom.window.close();for(const[k,v]of Object.entries(prior)){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}}};
}

test('blocked popup transfers the full calculator batch to the same-tab package form',async()=>{
 const env=await setup();try{
  await env.click('Create All Ready (6)');await env.click('Confirm & Continue');
  await waitFor(()=>env.dom.window.document.querySelector('.package-modal.standalone'));
  assert.match(env.dom.window.document.body.textContent,/3 Calculator Packages Remaining/);
  const storage=env.dom.window.localStorage;
  const key=Object.keys(storage).find(k=>k.startsWith('package-draft:'));
  const batch=JSON.parse(storage.getItem(key));
  assert.equal(batch.storeId,'test-store');assert.equal(batch.prefills.length,6);
  assert.deepEqual([...new Set(batch.prefills.map(p=>p.name))],['Package A','Package B','Package C']);
  assert.equal(batch.prefills[0].calculatorSettings.pricingGoal,'sameCustomerPrice');
  assert.equal(batch.prefills[0].calculatorSettings.facebookPrice,289);
  assert.equal(batch.prefills[0].sellingPrice,289);
  assert.equal(env.dom.window.document.querySelector('[role="dialog"]'),null);
  assert.ok(env.calls.every(c=>!c.options.method),'handoff must not save packages');
 }finally{await env.close();}
});

test('allowed popup uses a persisted draft and clears its opener',async()=>{
 const opened=[];const tab={opener:{},location:{replace:url=>opened.push(url)}};
 const env=await setup({open:()=>tab});try{
  await env.click('Create All Ready (6)');await env.click('Confirm & Continue');
  assert.equal(opened.length,1);assert.equal(tab.opener,null);
  const key=new URL(opened[0],env.dom.window.location.origin).searchParams.get('packageDraft');
  assert.equal(JSON.parse(env.dom.window.localStorage.getItem('package-draft:'+key)).prefills.length,6);
  assert.ok(env.dom.window.document.querySelector('.price-calculator'));
 }finally{await env.close();}
});

test('a popup exception and unavailable storage still allow an in-memory single-package handoff',async()=>{
 const env=await setup({open:()=>{throw Error('Popup blocked');},storageBlocked:true});try{
  await env.click('Create Package');await env.click('Confirm & Continue');
  await waitFor(()=>env.dom.window.document.querySelector('.package-modal.standalone'));
  assert.equal(env.dom.window.document.querySelector('input[placeholder="Package name"]')?.value??env.dom.window.document.querySelector('input[value="Package A"]')?.value,'Package A');
  assert.match(env.dom.window.document.body.textContent,/Calculator Settings Attached/);
 }finally{await env.close();}
});

test('a store or package permission problem keeps the calculated data and explains how to continue',async()=>{
 for(const options of [{storeId:'all'},{modules:['calculator']}]){
  const env=await setup(options);try{
   await env.click('Create All Ready (6)');await env.click('Confirm & Continue');
   const dialog=env.dom.window.document.querySelector('[role="dialog"]');assert.ok(dialog);
   assert.match(dialog.querySelector('[role="alert"]').textContent,options.storeId?/select a store/i:/access to Packages/i);
   assert.equal(env.dom.window.document.querySelectorAll('.calculator-confirm-table tbody tr').length,6);
  }finally{await env.close();}
 }
});
