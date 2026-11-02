import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
const dir=new URL('../node_modules/.package-start-date-test/',import.meta.url);await mkdir(dir,{recursive:true});
await build({entryPoints:['app/package-control.tsx'],outfile:new URL('ui.mjs',dir).pathname,bundle:true,platform:'browser',format:'esm',jsx:'automatic',packages:'external',logLevel:'silent'});
const {PackageControl}=await import(new URL('ui.mjs',dir));

test('Edit keeps started origins read-only, offers End Date, and leaves future/draft starts editable in Grid and All Stores List',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://local.test/'}),RealDate=globalThis.Date;
 const values={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,MouseEvent:dom.window.MouseEvent,IS_REACT_ACT_ENVIRONMENT:true};
 const prior=Object.fromEntries([...Object.keys(values),'fetch'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));for(const [k,v] of Object.entries(values))Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:v});
 globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-11-01T16:30:00Z']));}static now(){return new RealDate('2026-11-01T16:30:00Z').getTime();}};
 const line=(type,start,end=null)=>({market:'MY',priceType:type,originalPrice:120,sellingPrice:90,promotionType:'custom',effectiveFrom:start,effectiveTo:end});
 const base=(id,start,status='active',platform='Shopee MY')=>({id,name:id,storeId:'store',storeName:'Test Store',storePlatform:platform,packageSku:id,market:'MY',status,version:1,promotionType:'custom',originalPrice:12000,sellingPrice:9000,effectiveFrom:start,effectiveTo:null,components:[{inventorySku:'ITEM',name:'Item',quantity:1,kind:'product'}],platforms:[{platform:'Shopee',packageSku:id}],sheetSyncStatus:'synced',samePricing:false,priceSchedules:[line('non_campaign',start),line('campaign',start)]});
 const packages=[base('Started','2026-10-01'),base('Future','2026-12-01','scheduled'),base('Draft','2026-10-01','draft'),base('TH boundary','2026-11-02','scheduled','Shopee TH'),base('MY boundary','2026-11-02','active')];
 globalThis.fetch=async()=>({ok:true,json:async()=>({source:'database',canCreate:true,canDelete:false,canExportKits:false,packages})});
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root')),doc=document;
 const click=async(text,scope=doc)=>{const b=[...scope.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(b,text);await act(async()=>b.click());};
 const open=async(name)=>{const card=[...doc.querySelectorAll('.package-card')].find(c=>c.querySelector('h3')?.textContent===name);await click(name==='Draft'?'Edit Draft':'Edit / Modify',card);};
 const starts=()=>[...doc.querySelectorAll('.scenario-editor input[type="date"]')].filter(x=>x.closest('label')?.textContent.startsWith('Start Date'));
 try{
  await act(async()=>root.render(React.createElement(PackageControl,{storeId:'store',storeName:'Store',storePlatform:'Shopee MY'})));
  await open('Started');assert.equal(starts().length,2);assert.ok(starts().every(x=>x.disabled));
  const normal=doc.querySelector('.scenario-editor.nonCampaign');await click('Set End Date',normal);
  assert.equal(normal.querySelector('input[type="date"]').disabled,true);assert.equal([...normal.querySelectorAll('input[type="date"]')][1].disabled,false);assert.equal([...normal.querySelectorAll('input[type="date"]')][0].value,'2026-10-01');
  await click('Cancel');await open('Future');assert.ok(starts().every(x=>!x.disabled));await click('Cancel');
  await open('Draft');assert.ok(starts().every(x=>!x.disabled));await click('Cancel');
  // All Stores uses each row's owning store, even though all price cards are MY.
  await act(async()=>root.render(React.createElement(PackageControl,{storeId:'all',storeName:'All Stores'})));
  await click('List View');
  for(const [name,locked] of [['TH boundary',false],['MY boundary',true]]){
   const b=doc.querySelector(`[aria-label="Edit package ${name}"]`);assert.ok(b);await act(async()=>b.click());assert.ok(starts().every(x=>x.disabled===locked),name);await click('Cancel');
  }
 }finally{await act(async()=>root.unmount());dom.window.close();globalThis.Date=RealDate;for(const [k,v]of Object.entries(prior)){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}}
});
