import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
const dir=new URL('../node_modules/.package-list-test/',import.meta.url);
await mkdir(dir,{recursive:true});
await build({entryPoints:[new URL('../app/package-control.tsx',import.meta.url).pathname],outfile:new URL('ui.mjs',dir).pathname,bundle:true,format:'esm',platform:'browser',jsx:'automatic',packages:'external',logLevel:'silent'});
const {PackageControl}=await import(new URL('ui.mjs',dir));

test('Grid and spreadsheet List share filters, bounded rows, selection, history and action guards',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://local.test/'});
 const values={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,MouseEvent:dom.window.MouseEvent,IS_REACT_ACT_ENVIRONMENT:true};
 const prior=Object.fromEntries([...Object.keys(values),'fetch'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
 const schedule=(market,type,end)=>({market,priceType:type,originalPrice:100,sellingPrice:market==='MY'?90:30,promotionType:'custom',effectiveFrom:'2026-10-01',effectiveTo:end});
 const base=(id,extra={})=>({id,name:id,storeId:'store',storeName:'Test Store',packageSku:`SKU-${id}`,market:'MY',status:'active',version:1,promotionType:'custom',originalPrice:10000,sellingPrice:9000,effectiveFrom:'2026-10-01',effectiveTo:'2026-10-31',components:[{inventorySku:'INV',name:'Product',quantity:2,kind:'product'}],platforms:[{platform:'Shopee',packageSku:`SKU-${id}`}],sheetSyncStatus:'synced',...extra});
 const packages=[base('Long',{priceSchedules:[schedule('MY','non_campaign',null),schedule('SG','non_campaign',null)]}),base('Monthly',{priceSchedules:[schedule('MY','non_campaign','2026-10-31'),schedule('MY','campaign',null)]}),base('Campaign only',{priceSchedules:[schedule('MY','campaign',null)]}),base('Legacy',{effectiveTo:null}),base('Unknown',{effectiveTo:undefined}),base('Pending',{pendingVersion:2}),base('Draft',{status:'draft'}),base('Scheduled',{status:'scheduled'}),...Array.from({length:30},(_,i)=>base(`Extra ${i}`))];
 const writes=[];
 globalThis.fetch=async(url,options={})=>{if(options.method){writes.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({packageCount:1,rowCount:1,signature:'s'})};}return {ok:true,json:async()=>({source:'database',canExportKits:true,canDelete:true,packages})};};
 dom.window.confirm=()=>false;
 const {createRoot}=await import('react-dom/client');const root=createRoot(dom.window.document.getElementById('root'));
 const doc=dom.window.document;
 const click=async(text)=>{const button=[...doc.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(button,`button ${text}`);await act(async()=>button.click());};
 const named=label=>doc.querySelector(`[aria-label="${label}"]`);
 const card=name=>[...doc.querySelectorAll('.package-card')].find(c=>c.querySelector('h3')?.textContent===name);
 try {
 await act(async()=>root.render(React.createElement(PackageControl,{storeId:'store',storeName:'Store'})));
 assert.equal(doc.querySelectorAll('.package-card').length,30);
 await act(async()=>named('Select Long for fulfillment sheet').click());
 await click('List View');
 assert.equal(doc.querySelectorAll('.package-sheet tbody>tr').length,30);
 assert.equal(named('Select Long for fulfillment sheet').checked,true);
 assert.match(doc.querySelector('.package-sheet').textContent,/RM 90.00/);assert.match(doc.querySelector('.package-sheet').textContent,/S\$ 30.00/);
 assert.ok(!doc.querySelector('.package-sheet th').textContent.includes('Store'));
 await act(async()=>named('View history for Long').click());assert.ok(doc.querySelector('.version-history'));
 await act(async()=>named('View details for Long').click());assert.match(doc.querySelector('.package-sheet-detail').textContent,/Product/);
 assert.equal(named('End package Pending').disabled,true);assert.equal(named('Select Pending for fulfillment sheet').disabled,true);assert.equal(named('Edit package Pending'),null);assert.ok(named('Retry Google Sheet sync for Pending version 2'));assert.ok(named('Create package Draft'));
 await click('Active');await click('Long Term');
 assert.equal(doc.querySelectorAll('.package-sheet tbody>tr').length,2);assert.equal(named('Select Long for fulfillment sheet').checked,false);
 assert.deepEqual([...doc.querySelectorAll('.package-sheet-name>strong')].map(n=>n.textContent),['Long','Legacy']);
 await click('Monthly');assert.ok(!doc.querySelector('.package-sheet').textContent.includes('Not recorded'));assert.ok(doc.querySelector('.package-sheet').textContent.includes('Monthly'));
 await click('All types');await click('All');await click('Grid View');
 assert.equal(doc.querySelectorAll('.package-card').length,30);await click('Show more packages (8 remaining)');assert.equal(doc.querySelectorAll('.package-card').length,38);
 // Native input events must reach React, including its value tracking.
 const input=named('Search package or platform SKU');
 await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'SKU-Long');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
 assert.equal(doc.querySelectorAll('.package-card').length,1);assert.ok(card('Long'));
 await act(async()=>named('Select Long for fulfillment sheet').click());await click('List View');assert.equal(named('Select Long for fulfillment sheet').checked,true);
 await act(async()=>root.render(React.createElement(PackageControl,{storeId:'all',storeName:'All Stores'})));
 assert.equal(doc.querySelector('button.kit-export-button'),null);assert.ok([...doc.querySelectorAll('.package-sheet thead th')].some(n=>n.textContent==='Store'));
 assert.equal(writes.length,0);
 } finally {await act(async()=>root.unmount());dom.window.close();for(const [key,desc] of Object.entries(prior)){if(desc)Object.defineProperty(globalThis,key,desc);else delete globalThis[key];}}
});

test('Staging samples stay separate from real packages and expose no mutation or export actions',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://shopee-hub-v2-260731-git-cod-e05b8d-shopeehubctg-5199s-projects.vercel.app/?section=packages&packageSamples=1'});
 const values={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,MouseEvent:dom.window.MouseEvent,IS_REACT_ACT_ENVIRONMENT:true};
 const prior=Object.fromEntries([...Object.keys(values),'fetch'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
 const requests=[];
 globalThis.fetch=async(url,options={})=>{requests.push({url,method:options.method??'GET'});return {ok:true,json:async()=>({source:'database',canDelete:true,canExportKits:true,packages:[{id:'real',storeId:'store',name:'Real saved package',packageSku:'REAL',market:'MY',status:'active',version:1,promotionType:'monthly',originalPrice:10000,sellingPrice:8000,effectiveFrom:'2026-10-01',effectiveTo:'2026-10-31',components:[],platforms:[],sheetSyncStatus:'synced'}]})};};
 const {createRoot}=await import('react-dom/client'),root=createRoot(dom.window.document.getElementById('root')),doc=dom.window.document;
 const click=async(label)=>{const button=[...doc.querySelectorAll('button')].find(b=>b.textContent===label);assert.ok(button,label);await act(async()=>button.click());};
 try{
  await act(async()=>root.render(React.createElement(PackageControl,{storeId:'store',storeName:'Store'})));
  assert.equal(doc.querySelectorAll('.package-card').length,8);assert.match(doc.body.textContent,/Sample data · Read only/);assert.doesNotMatch(doc.body.textContent,/Real saved package/);
  for(const label of ['+ New Package','Create Package','Edit Draft','Edit / Modify','Migrate & Edit','End Package','Remove Package','Retry Sheet Sync'])assert.equal([...doc.querySelectorAll('button')].find(b=>b.textContent===label),undefined,label);
  assert.equal(doc.querySelector('.kit-export-button'),null);assert.equal(doc.querySelector('.kit-package-selector'),null);
  await click('List View');assert.match(doc.querySelector('.package-sheet').textContent,/S\$ 49.90/);assert.match(doc.querySelector('.package-sheet').textContent,/DEMO-GIFT/);
  await click('Long Term');assert.equal(doc.querySelectorAll('.package-sheet tbody>tr').length,2);
  await click('All types');await click('Draft');assert.equal(doc.querySelectorAll('.package-sheet tbody>tr').length,1);
  await click('Back to real data');assert.match(doc.body.textContent,/Real saved package/);assert.doesNotMatch(doc.body.textContent,/Daily Wellness/);
  assert.ok(requests.every(r=>r.method==='GET'));
  // Production must ignore the sample query even for Super Admin.
  await act(async()=>root.unmount());
  dom.reconfigure({url:'https://shopee-hub-v2-260731.vercel.app/?packageSamples=1'});
  const productionRoot=createRoot(doc.getElementById('root'));
  await act(async()=>productionRoot.render(React.createElement(PackageControl,{storeId:'store',storeName:'Store'})));
  assert.match(doc.body.textContent,/Real saved package/);assert.doesNotMatch(doc.body.textContent,/View sample data|Daily Wellness/);
  await act(async()=>productionRoot.unmount());
 }finally{dom.window.close();for(const [key,desc]of Object.entries(prior)){if(desc)Object.defineProperty(globalThis,key,desc);else delete globalThis[key];}}
});
