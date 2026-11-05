import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';

const dir=new URL('../node_modules/.package-same-price-summary-test/',import.meta.url);
await mkdir(dir,{recursive:true});
await build({entryPoints:[new URL('../app/package-control.tsx',import.meta.url).pathname],outfile:new URL('ui.mjs',dir).pathname,bundle:true,format:'esm',platform:'browser',jsx:'automatic',packages:'external',logLevel:'silent'});
const {PackageControl}=await import(new URL('ui.mjs',dir));

const amount=(sellingPrice=128.7,originalPrice=369)=>({originalPrice,sellingPrice});
const normal=(market='MY',from='2026-11-06',to=null)=>({market,priceType:'non_campaign',...amount(),promotionType:'custom',effectiveFrom:from,effectiveTo:to});
const recurring=(prices={MY:amount()})=>({schema:1,startDate:'2026-11-06',endDate:null,events:[{id:'dday',daysBefore:2,daysAfter:0,prices},{id:'mid_month',startDay:14,endDay:15,prices},{id:'payday',startDay:24,endDay:25,prices}]});
const settings=(prices={MY:{early:amount(),late:amount()}})=>({_pricingMode:'split_normal',_normalMonthlyRule:{schema:1,prices}});
const base=(name,extra={})=>({id:name,name,storeId:'test',packageSku:name,market:'MY',status:'scheduled',version:1,promotionType:'custom',...amount(),effectiveFrom:'2026-11-06',effectiveTo:null,components:[{inventorySku:'INV',name:'Product',quantity:1,kind:'product'}],platforms:[{platform:'Shopee',packageSku:name}],sheetSyncStatus:'synced',priceSchedules:[normal()],recurringCampaign:recurring(),calculatorSettings:settings(),...extra});

test('equal saved prices render once in Grid and List without changing schedules or history',async(t)=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://local.test/'});
 const values={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,MouseEvent:dom.window.MouseEvent,IS_REACT_ACT_ENVIRONMENT:true};
 const prior=Object.fromEntries([...Object.keys(values),'fetch'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
 const monthlyNormals=[normal('MY','2026-11-01','2026-11-30'),normal('MY','2026-12-01','2026-12-31')].map(line=>({...line,promotionType:'monthly'}));
 const items=[
  base('Same Long Term',{history:[{version:1,calculatorSettings:settings(),changeNote:'Original calculation'}]}),
  base('Same Multiple Months',{priceSchedules:[...monthlyNormals,...['2026-11','2026-12'].map(month=>({...normal('MY',`${month}-08`,`${month}-10`),priceType:'campaign'}))],recurringCampaign:null}),
  base('Different Periods',{calculatorSettings:settings({MY:{early:amount(),late:amount(135)}}),recurringCampaign:recurring({MY:amount(120)})}),
  base('Different Original',{recurringCampaign:recurring({MY:amount(128.7,399)})}),
  base('Different Late Original',{calculatorSettings:settings({MY:{early:amount(),late:amount(128.7,399)}})}),
  base('MY Same SG Different',{market:'MY,SG',priceSchedules:[normal(),{...normal('SG'),...amount(30,100)}],calculatorSettings:settings({MY:{early:amount(),late:amount()},SG:{early:amount(30,100),late:amount(35,100)}}),recurringCampaign:recurring({MY:amount(),SG:amount(32,100)})}),
  base('Legacy Same',{calculatorSettings:null}),
  base('No Campaign',{recurringCampaign:null}),
  base('Different Later Campaign',{recurringCampaign:{...recurring(),events:recurring().events.map((event,index)=>index===2?{...event,prices:{MY:amount(120)}}:event)}}),
 ];
 const original=structuredClone(items),writes=[];
 globalThis.fetch=async(url,options={})=>{if(options.method){writes.push(url);throw Error('Display must not write');}return {ok:true,json:async()=>({source:'database',packages:items})};};
 const {createRoot}=await import('react-dom/client');const root=createRoot(dom.window.document.getElementById('root')),doc=dom.window.document;
 const click=async(text)=>{const button=[...doc.querySelectorAll('button')].find(button=>button.textContent===text);assert.ok(button,text);await act(async()=>button.click());};
 const summary=(name,market='MY',list=false)=>{
  const container=list?[...doc.querySelectorAll('.package-sheet tbody>tr')].find(row=>row.querySelector('.package-sheet-name strong')?.textContent===name):[...doc.querySelectorAll('.package-card')].find(card=>card.querySelector('h3')?.textContent===name);
  assert.ok(container,name);
  return [...container.querySelectorAll('.package-market-column')].find(column=>column.querySelector('h4')?.textContent.startsWith(market));
 };
 const expectShared=(column,period)=>{
  assert.ok(column);assert.equal(column.querySelectorAll('.package-market-price-row').length,1);
  assert.equal(column.querySelectorAll('.package-market-price-values strong').length,1);
  assert.equal(column.querySelectorAll('del').length,1);
  assert.match(column.textContent,/Campaign Day & Normal Day Same Price/);
  assert.equal(column.querySelectorAll('.package-normal-period').length,1);
  assert.equal(column.querySelector('.package-normal-period').textContent,period);
  assert.equal(column.querySelector('.package-campaign-months'),null);
  assert.doesNotMatch(column.textContent,/Every month|1st–15th|16th–End/);
 };
 try{
  await act(async()=>root.render(React.createElement(PackageControl,{storeId:'test',storeName:'Test Store',storePlatform:'Shopee MY'})));
  await t.test('long-term same price shows one price and one ongoing period',()=>expectShared(summary('Same Long Term'),'Period: 06/11/2026–Ongoing'));
  await t.test('multiple months share one price without repeating campaign rows',()=>expectShared(summary('Same Multiple Months'),'Period: Nov 2026 | Dec 2026'));
  await t.test('different periods retain all three prices',()=>{
   const column=summary('Different Periods');assert.equal(column.querySelectorAll('.package-market-price-row').length,3);
   assert.deepEqual([...column.querySelectorAll('.package-market-price-values strong')].map(node=>node.textContent),['RM 128.70','RM 120.00','RM 135.00']);
  });
  await t.test('different original prices, missing campaign and differing recurring events are never collapsed',()=>{
   for(const name of ['Different Original','Different Late Original','No Campaign','Different Later Campaign'])assert.equal(summary(name).querySelectorAll('.package-market-price-row').length,3,name);
  });
  await t.test('MY and SG are grouped independently',()=>{
   expectShared(summary('MY Same SG Different'),'Period: 06/11/2026–Ongoing');
   assert.deepEqual([...summary('MY Same SG Different','SG').querySelectorAll('.package-market-price-values strong')].map(node=>node.textContent),['S$ 30.00','S$ 32.00','S$ 35.00']);
  });
  await t.test('legacy same-price cards retain their existing compact display',()=>expectShared(summary('Legacy Same'),'Period: 06/11/2026–Ongoing'));
  await click('List View');
  await t.test('List reuses the same compact three-period summary',()=>{
   expectShared(summary('Same Long Term','MY',true),'Period: 06/11/2026–Ongoing');
   expectShared(summary('Same Multiple Months','MY',true),'Period: Nov 2026 | Dec 2026');
   assert.equal(summary('Different Periods','MY',true).querySelectorAll('.package-market-price-row').length,3);
   assert.equal(summary('MY Same SG Different','SG',true).querySelectorAll('.package-market-price-row').length,3);
  });
  await t.test('rendering both views leaves all stored data unchanged and makes no writes',()=>{assert.deepEqual(items,original);assert.deepEqual(writes,[]);});
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,descriptor] of Object.entries(prior)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});
