import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {JSDOM} from 'jsdom';
const NativeMessageChannel=globalThis.MessageChannel,channels=[];
globalThis.MessageChannel=class extends NativeMessageChannel{constructor(){super();channels.push(this);}};
after(()=>{for(const channel of channels){channel.port1.close();channel.port2.close();}globalThis.MessageChannel=NativeMessageChannel;});
const compiled=execFileSync('node_modules/.bin/esbuild',['--bundle','--format=esm','--platform=node','--target=node20','--loader=tsx','--loader:.css=empty','--jsx=automatic','--banner:js=import {createRequire} from "node:module";const require=createRequire(process.cwd()+"/package.json");'],{input:`import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {renderToStaticMarkup} from 'react-dom/server';import {AccountXeroSettings,AccountXeroSummary,XeroRowAmounts,XeroInvoiceDetails} from './app/account-xero-settings';export {act,createRoot,renderToStaticMarkup,AccountXeroSettings,AccountXeroSummary,XeroRowAmounts,XeroInvoiceDetails};export const element=React.createElement;`,maxBuffer:20*1024*1024});
const ui=await import('data:text/javascript;base64,'+compiled.toString('base64'));
const fixture=()=>({invoiceMonth:'2026-10',today:'2026-11-01',stores:[{id:'u1',rosterKey:'r1',project:'Store SG',storeName:'SG shop',storeId:'s1',entity:'Company One',currency:'SGD'},{id:'u2',rosterKey:'r2',project:'Incomplete',storeName:'No store',storeId:null,entity:'Company Two',currency:'MYR'}],xero:{configured:true,connected:true,status:'ready',organisationName:'Wisdom Factory',month:'2026-10',groups:[{groupKey:'g1',contactId:'c1',categoryId:'cat',optionId:'op1',project:'Shopee Hub',companyName:'Company One',status:'candidate',mappedUnitKey:null,suggestedUnitKey:'r1',candidateUnitKeys:['r1'],expectedVersion:'0'},{groupKey:'g2',contactId:'c2',categoryId:'cat',optionId:'op1',project:'Shopee Hub',companyName:'Company Two',status:'candidate',mappedUnitKey:null,suggestedUnitKey:'r2',candidateUnitKeys:['r2'],expectedVersion:'0'}],unmappedInvoiceCount:1,unmappedTotals:[],totals:[{currency:'MYR',gross:'108.00',amountPaid:'40.00',amountDue:'48.00',tax:'8.00',amountCredited:'20.00'}],collections:[{currency:'MYR',todayCollected:'0.00',monthCollected:'30.00'}],outstanding:[]}});
test('source amounts stay in actual invoice currency and cash stays distinct from paid/applied',()=>{
 const data=fixture(),row={...data.stores[0],billed:'999.00',xeroActuals:{status:'mapped',byCurrency:[{currency:'MYR',invoiced:'108.00',received:'40.00',outstanding:'48.00'}],invoices:[]}};
 const html=ui.renderToStaticMarkup(ui.element(ui.XeroRowAmounts,{row,field:'invoiced',active:true}));assert.match(html,/MYR 108.00/);assert.doesNotMatch(html,/SGD|999/);
 const summary=ui.renderToStaticMarkup(ui.element(ui.AccountXeroSummary,{data}));assert.match(summary,/>Cash received</);assert.doesNotMatch(summary,/Cash received this month/);assert.match(summary,/MYR 30.00/);assert.doesNotMatch(summary,/MYR 40.00/);
 row.xeroActuals.status='not_synced';assert.doesNotMatch(ui.renderToStaticMarkup(ui.element(ui.XeroRowAmounts,{row,field:'invoiced',active:true})),/108|999/);
});
test('reviewed canonical targets remain selectable when the legacy row has no stored store ID',()=>{
 const data=fixture();data.stores[0].storeId=null;data.xero.targets=[{unitKey:'r1',name:'Store SG',entity:'Company One',storeName:'SG shop',storeId:'canonical-store'},{unitKey:'r2',name:'Ambiguous',entity:'Company Two',storeName:'Unknown',storeId:null}];
 const html=ui.renderToStaticMarkup(ui.element(ui.AccountXeroSettings,{data,onSaved:()=>{}}));assert.match(html,/value="r1"/);assert.doesNotMatch(html,/value="r2"/);assert.match(html,/Apply 1 exact matches/);
});
test('settings render an explicit Malaysian sync time without leaking internal errors',()=>{
 const data=fixture();data.xero.lastSyncedAt='2026-11-01T01:00:00Z';data.xero.lastError='DB_INTERNAL_PRIVATE_STACK';
 const html=ui.renderToStaticMarkup(ui.element(ui.AccountXeroSettings,{data,onSaved:()=>{}}));assert.match(html,/MYT/);assert.match(html,/Accounting sync needs attention/);assert.doesNotMatch(html,/DB_INTERNAL_PRIVATE_STACK/);
});
test('batch exact matches expose each eligible proposal before approval',()=>{
 const html=ui.renderToStaticMarkup(ui.element(ui.AccountXeroSettings,{data:fixture(),onSaved:()=>{}}));
 assert.match(html,/Suggested: Store SG/);assert.doesNotMatch(html,/Suggested: Incomplete/);assert.match(html,/Apply 1 exact matches/);
});
test('disabled integration has no source summary and cannot connect; configured failure stays unknown',()=>{
 const data=fixture();data.xero.configured=false;data.xero.connected=false;
 assert.equal(ui.renderToStaticMarkup(ui.element(ui.AccountXeroSummary,{data})), '');
 const settings=ui.renderToStaticMarkup(ui.element(ui.AccountXeroSettings,{data,onSaved:()=>{}}));assert.match(settings,/disabled=""[^>]*>Connect Xero/);assert.match(settings,/Xero setup is unavailable/);
 data.xero.configured=true;data.xero.totals=[];data.xero.collections=[];data.xero.lastError='private';data.summaries=[{currency:'MYR',billed:'999.00'}];
 const html=ui.renderToStaticMarkup(ui.element(ui.AccountXeroSummary,{data}));assert.match(html,/Accounting sync needs attention/);assert.doesNotMatch(html,/999|private/);
});
test('unknown company with several invoices requires individual invoice matching',()=>{
 const data=fixture();data.xero.groups=[{...data.xero.groups[0],status:'missing',candidateUnitKeys:[],suggestedUnitKey:null,invoiceCount:2,mappedInvoiceCount:0,invoiceChoices:[{invoiceId:'unknown-one',invoiceNumber:'UNKNOWN-1',currency:'MYR',invoiced:'100.00',status:'missing'},{invoiceId:'unknown-two',invoiceNumber:'UNKNOWN-2',currency:'MYR',invoiced:'200.00',status:'missing'}]}];
 const html=ui.renderToStaticMarkup(ui.element(ui.AccountXeroSettings,{data,onSaved:()=>{}}));assert.doesNotMatch(html,/>Save match</);assert.match(html,/Client for invoice UNKNOWN-1/);assert.match(html,/Client for invoice UNKNOWN-2/);
});
test('exact-match batch excludes incomplete targets, posts explicit replay-safe mapping and refreshes only after success',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://stage.test'});const saved=new Map();for(const key of ['window','document','navigator','HTMLElement','Event','MouseEvent']){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});}globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const oldFetch=globalThis.fetch,requests=[];let calls=0,refreshes=0;globalThis.fetch=async(url,init)=>{requests.push({url,body:JSON.parse(init.body)});calls++;return {ok:calls>1,json:async()=>calls>1?{ok:true}:{error:'Temporary sync error'}};};
 const root=ui.createRoot(document.querySelector('#root'));try{
 await ui.act(()=>root.render(ui.element(ui.AccountXeroSettings,{data:fixture(),onSaved:()=>refreshes++})));
 assert.equal(requests.length,0);assert.equal(document.querySelectorAll('option[value="r2"]').length,0);
 const apply=[...document.querySelectorAll('button')].find(b=>b.textContent==='Apply 1 exact matches');assert.ok(apply);
 await ui.act(()=>apply.dispatchEvent(new MouseEvent('click',{bubbles:true})));assert.equal(refreshes,0);assert.match(document.querySelector('[role="alert"]').textContent,/Temporary/);
 await ui.act(()=>apply.dispatchEvent(new MouseEvent('click',{bubbles:true})));assert.equal(refreshes,1);assert.equal(requests.length,2);assert.equal(requests[0].body.requestId,requests[1].body.requestId);assert.equal(requests[0].url,'/api/admin/account/xero-mapping');assert.deepEqual(requests[0].body.mappings,[{contactId:'c1',categoryId:'cat',optionId:'op1',unitKey:'r1',effectiveMonth:'2026-10',expectedVersion:'0'}]);
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 const row={...fixture().stores[0],xeroActuals:{invoices:[{invoiceId:'i1',invoiceNumber:'INV-1',currency:'MYR',project:'Shopee Hub Internal',gross:'108.00',amountPaid:'40.00',amountDue:'68.00',date:'2026-10-01'}]}};
 await ui.act(()=>root.render(ui.element(ui.XeroInvoiceDetails,{row})));await ui.act(()=>document.querySelector('.account-xero-invoice-open').dispatchEvent(new MouseEvent('click',{bubbles:true})));
 const dialog=document.querySelector('dialog');assert.equal(dialog.parentElement,document.body);assert.match(dialog.textContent,/Project/);assert.match(dialog.textContent,/Shopee Hub Internal/);assert.match(dialog.textContent,/INV-1/);
 const split=fixture();split.stores[1].storeId='s2';split.xero.groups=[{...split.xero.groups[0],status:'ambiguous',suggestedUnitKey:null,candidateUnitKeys:['r1','r2'],invoiceCount:2,mappedInvoiceCount:0,invoiceChoices:[{invoiceId:'inv-one',invoiceNumber:'WF-ONE',currency:'MYR',invoiced:'100.00',date:'2026-10-01',mappedUnitKey:null,status:'missing'},{invoiceId:'inv-two',invoiceNumber:'WF-TWO',currency:'MYR',invoiced:'200.00',date:'2026-10-02',mappedUnitKey:null,status:'missing'}]}];
 await ui.act(()=>root.render(ui.element(ui.AccountXeroSettings,{data:split,onSaved:()=>refreshes++})));
 assert.equal([...document.querySelectorAll('button')].filter(button=>button.textContent==='Save match').length,0);assert.match(document.body.textContent,/WF-ONE/);assert.match(document.body.textContent,/MYR 200.00/);
 const chooser=document.querySelector('[aria-label="Client for invoice WF-ONE"]');await ui.act(()=>{chooser.value='r1';chooser.dispatchEvent(new Event('change',{bubbles:true}));});
 const invoiceSave=[...document.querySelectorAll('button')].find(button=>button.textContent==='Save invoice match');assert.equal(invoiceSave.disabled,false);await ui.act(()=>invoiceSave.dispatchEvent(new MouseEvent('click',{bubbles:true})));
 assert.equal(requests.at(-1).body.mappings[0].invoiceId,'inv-one');assert.equal(requests.at(-1).body.mappings[0].expectedVersion,'0');assert.equal(requests.at(-1).body.mappings[0].unitKey,'r1');
 assert.ok([...document.querySelectorAll('button')].filter(button=>button.textContent==='Save invoice match').every(button=>button.disabled));
 }finally{await ui.act(()=>root.unmount());dom.window.close();globalThis.fetch=oldFetch;for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
});
