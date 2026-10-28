import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act,useState} from 'react';
const dir=new URL('../node_modules/.store-exchange-rate-test/',import.meta.url);
await mkdir(dir,{recursive:true});
await build({entryPoints:[new URL('../app/store-exchange-rate-field.tsx',import.meta.url).pathname],outfile:new URL('ui.mjs',dir).pathname,bundle:true,format:'esm',platform:'browser',jsx:'automatic',packages:'external',logLevel:'silent'});
const {StoreExchangeRateField}=await import(new URL('ui.mjs',dir));

test('BNM field hides stale rates on native month/market changes, ignores old responses, and handles pending/error retry',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://local.test/'});
 const values={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,MouseEvent:dom.window.MouseEvent,IS_REACT_ACT_ENVIRONMENT:true};
 const prior=Object.fromEntries([...Object.keys(values),'fetch'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
 const requests=[];
 globalThis.fetch=(url,options={})=>new Promise((resolve,reject)=>{requests.push({url,options,resolve,reject});});
 function Harness(){const [market,setMarket]=useState('TH');const [invoiceMonth,setMonth]=useState('2026-10');return React.createElement(React.Fragment,null,...['MY','SG','TH','PH'].map(code=>React.createElement('button',{key:code,onClick:()=>setMarket(code)},code)),React.createElement(StoreExchangeRateField,{market,invoiceMonth,onInvoiceMonthChange:setMonth,showInvoiceMonth:true}));}
 const {createRoot}=await import('react-dom/client');const root=createRoot(dom.window.document.getElementById('root'));const doc=dom.window.document;
 const response=(market,invoiceMonth,serviceMonth,rate,status='available')=>({status,market,currency:market==='TH'?'THB':'PHP',invoiceMonth,serviceMonth,policy:'bnm-service-average',rate,quotationUnit:1,reference:'Bank Negara Malaysia'});
 const deliver=async(index,data)=>act(async()=>requests[index].resolve({ok:true,json:async()=>data}));
 const month=async(value)=>{const input=doc.querySelector('input[type="month"]');await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));input.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});};
 const click=async(text)=>act(async()=>[...doc.querySelectorAll('button')].find(button=>button.textContent===text).click());
 try {
 await act(async()=>root.render(React.createElement(Harness)));
 assert.equal(requests.length,1);assert.match(requests[0].url,/market=TH&invoiceMonth=2026-10/);assert.match(doc.body.textContent,/Loading exchange rate/);
 await deliver(0,response('TH','2026-10','2026-09','0.12345678901234567890'));
 assert.equal(doc.querySelector('output').textContent,'1 THB = MYR 0.12345678901234567890');assert.match(doc.body.textContent,/Service month · 2026-09/);
 await month('2026-11');assert.equal(doc.querySelector('output'),null);assert.equal(requests[0].options.signal.aborted,true);assert.equal(requests.length,2);
 await month('2026-12');assert.equal(requests.length,3);assert.equal(requests[1].options.signal.aborted,true);
 await deliver(2,response('TH','2026-12','2026-11','0.13'));await deliver(1,response('TH','2026-11','2026-10','0.99'));
 assert.equal(doc.querySelector('output').textContent,'1 THB = MYR 0.13');
 await click('PH');assert.equal(doc.querySelector('output'),null);assert.match(doc.body.textContent,/Loading exchange rate/);assert.equal(requests.length,4);
 await deliver(3,response('PH','2026-12','2026-11',null,'pending'));assert.equal(doc.querySelector('output'),null);assert.match(doc.body.textContent,/Pending · Monthly average not yet published/);assert.match(doc.body.textContent,/2026-11/);
 await month('2026-11');assert.doesNotMatch(doc.body.textContent,/Pending/);await act(async()=>requests[4].reject(new Error('network')));assert.match(doc.querySelector('[role="alert"]').textContent,/could not be loaded/);
 await click('Retry exchange rate');assert.equal(doc.querySelector('[role="alert"]'),null);assert.match(doc.body.textContent,/Loading/);assert.equal(requests.length,6);
 await deliver(5,response('PH','2026-11','2026-10','0.07500000000000000001'));assert.equal(doc.querySelector('output').textContent,'1 PHP = MYR 0.07500000000000000001');
 // A response for a different month must never display a believable but incorrect rate.
 await month('2026-10');await deliver(6,response('PH','2026-11','2026-10','0.09'));assert.equal(doc.querySelector('output'),null);assert.ok(doc.querySelector('[role="alert"]'));
 await click('TH');await click('PH');assert.equal(doc.querySelector('output'),null);await deliver(8,response('PH','2026-10','2026-09','0.07'));await deliver(7,response('TH','2026-10','2026-09','0.9'));assert.equal(doc.querySelector('output').textContent,'1 PHP = MYR 0.07');
 await month('2026-11');await deliver(9,response('PH','2026-11','2026-09','0.08'));assert.equal(doc.querySelector('output'),null);assert.ok(doc.querySelector('[role="alert"]'));
 await click('Retry exchange rate');await deliver(10,response('PH','2026-11','2026-10','0.000'));assert.equal(doc.querySelector('output'),null);assert.ok(doc.querySelector('[role="alert"]'));
 await click('MY');assert.equal(doc.querySelector('.store-exchange-rate'),null);await click('SG');assert.equal(doc.querySelector('.store-exchange-rate'),null);assert.equal(requests.length,11);
 assert.ok(requests.every(request=>!request.options.method||request.options.method==='GET'));
 } finally {await act(async()=>root.unmount());dom.window.close();for(const [key,desc] of Object.entries(prior)){if(desc)Object.defineProperty(globalThis,key,desc);else delete globalThis[key];}}
});
