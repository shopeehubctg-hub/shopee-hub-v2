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
async function setup({open=()=>null,storageBlocked=false,modules=['calculator','packages'],storeId='test-store',environment='staging'}={}){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://local.test/?section=calculator'});
 const values={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,MouseEvent:dom.window.MouseEvent,crypto:dom.window.crypto,IS_REACT_ACT_ENVIRONMENT:true};
 const prior=Object.fromEntries([...Object.keys(values),'fetch'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const [k,v]of Object.entries(values))Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:v});
 dom.window.open=open;
 dom.window.scrollTo=()=>{};
 if(storageBlocked)Object.defineProperty(dom.window.Storage.prototype,'setItem',{value(){throw new dom.window.DOMException('Storage full','QuotaExceededError');}});
 const calls=[];
 globalThis.fetch=async(url,options={})=>{calls.push({url,options});const body=String(url).startsWith('/api/dashboard')?{environment,user:{email:'client@example.test'},access:{role:'customer',enabledModules:modules,clientEnabledModules:modules,canManagePermissions:false},stores:[{id:'test-store',name:'Test Store',platform:'Shopee MY',contacts:[]}],selectedStoreId:storeId,snapshot:null,actions:[],adPerformance:[],adBalance:null,productProfile:null,platformVoucher:{early:0,campaign:0,late:5,updatedAt:"2026-11-05T00:00:00Z"},coFundVouchers:[]}:String(url).includes('inventory-skus')?{products:[],canEdit:false}:{packages:[],source:'database',canDelete:false};return{ok:true,status:200,json:async()=>body};};
 const {createRoot}=await import('react-dom/client');const root=createRoot(dom.window.document.getElementById('root'));
 await act(async()=>root.render(React.createElement(Home)));
 await waitFor(()=>dom.window.document.querySelector('.calculator-selection-bar'));
 const late=dom.window.document.querySelector('[aria-label="normalLate Platform Voucher percentage"]');
 await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(late,'5');late.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
 const click=async(text)=>{const b=[...dom.window.document.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(b,`missing ${text}`);await act(async()=>b.click());};
 return {dom,calls,click,close:async()=>{await act(async()=>root.unmount());dom.window.close();for(const[k,v]of Object.entries(prior)){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}}};
}

const rowNames = doc => [...doc.querySelectorAll('input[aria-label$="Package · Package Name"]')].map(cell=>cell.value);
const choose = async(env, id)=>act(async()=>env.dom.window.document.querySelector('[aria-label="Select Calculator package '+id+'"]').click());
test('selected packages open directly in the same Dashboard grid with three Calculator prices', async()=>{
 const env=await setup({open:()=>assert.fail('Unexpected popup')});
 try{
  const doc=env.dom.window.document;
  assert.doesNotMatch(doc.body.textContent,/Download Excel/);
  await choose(env,2);await choose(env,3);
  await env.click('Create Selected Packages (2)');
  await waitFor(()=>doc.querySelector('.batch-entry-table'));
  assert.deepEqual(rowNames(doc),['Package B','Package C']);
  assert.equal(doc.querySelector('input[aria-label="Row 1 · MY · RM · Normal · 1st–15th"]').value,'358.00');
  assert.equal(doc.querySelector('input[aria-label="Row 1 · MY · RM · Campaign Day"]').value,'358.00');
  assert.ok(Number(doc.querySelector('input[aria-label="Row 1 · MY · RM · Normal · 16th–End"]').value)>358);
  assert.doesNotMatch(doc.body.textContent,/Import Excel|Replace File/);
  assert.equal(doc.querySelector('input[type=file]'),null);
  assert.equal(doc.querySelector('.batch-entry-table').closest('.batch-workspace').querySelectorAll('select')[1].value,'product');
  assert.ok(env.calls.every(c=>!c.options.method),'opening the grid must not create packages or save pricing records');
 }finally{await env.close();}
});
test('single creation works in memory when session storage is unavailable',async()=>{
 const env=await setup({storageBlocked:true});
 try{
  await env.click('Create Package');
  await waitFor(()=>env.dom.window.document.querySelector('.batch-entry-table'));
  assert.deepEqual(rowNames(env.dom.window.document),['Package A']);
 }finally{await env.close();}
});
test('accounts without package access stay in Calculator and see the reason',async()=>{
 const env=await setup({modules:['calculator']});
 try{
  await choose(env,1);await env.click('Create Selected Packages (1)');
  assert.match(env.dom.window.document.querySelector('[role=alert]').textContent,/access to Packages/);
  assert.ok(env.dom.window.document.querySelector('.price-calculator'));
  assert.ok(env.calls.every(c=>!c.options.method));
 }finally{await env.close();}
});
