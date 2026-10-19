import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import React, { act } from 'react';

const outputDir = new URL('../node_modules/.long-term-package-test/', import.meta.url);
await mkdir(outputDir, { recursive: true });
await build({ entryPoints:[new URL('../app/package-control.tsx', import.meta.url).pathname], outfile:new URL('package-control.mjs', outputDir).pathname, bundle:true, format:'esm', platform:'browser', jsx:'automatic', packages:'external', logLevel:'silent' });
const { PackageControl } = await import(pathToFileURL(new URL('package-control.mjs', outputDir).pathname));

test('an existing package can become long-term and then receive an end date', async () => {
  const dom=new JSDOM('<div id="root"></div>',{url:'https://local.test/'});
  const keys=['window','document','navigator','HTMLElement','Event','MouseEvent','fetch'];
  const old=Object.fromEntries(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,MouseEvent:dom.window.MouseEvent})) Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  let version=1;
  let prices=[
    {market:'MY',priceType:'non_campaign',originalPrice:100,sellingPrice:90,promotionType:'custom',effectiveFrom:'2026-10-01',effectiveTo:'2026-10-31'},
    {market:'MY',priceType:'campaign',originalPrice:100,sellingPrice:90,promotionType:'custom',effectiveFrom:'2026-10-01',effectiveTo:'2026-10-31'},
  ];
  const submitted=[];
  globalThis.fetch=async (_url,options={})=>{
    if(options.method==='POST'){
      const body=JSON.parse(options.body);
      submitted.push(body);
      prices=body.priceSchedules;
      version++;
      return {ok:true,json:async()=>({ok:true,packageId:'pkg-1',version,status:'active'})};
    }
    return {ok:true,json:async()=>({source:'database',canCreate:true,canDelete:false,packages:[{
      id:'pkg-1',storeId:'store-1',storeName:'Test Store',packageSku:'TEST-SKU',name:'Test Package',market:'MY',status:'active',version,
      promotionType:'custom',originalPrice:10000,sellingPrice:9000,effectiveFrom:'2026-10-01',effectiveTo:prices.find(p=>p.priceType==='non_campaign').effectiveTo,samePricing:submitted.at(-1)?.samePricing??true,
      components:[{inventorySku:'ITEM-1',name:'Item',quantity:1,kind:'product'}],platforms:[{platform:'Shopee',packageSku:'TEST-SKU'}],priceSchedules:prices,recurringCampaign:submitted.at(-1)?.recurringCampaign??null,history:[],
    }]})};
  };
  const {createRoot}=await import('react-dom/client');
  const root=createRoot(dom.window.document.getElementById('root'));
  const click=async label=>{
    const button=[...dom.window.document.querySelectorAll('button')].find(node=>node.textContent.trim()===label);
    assert.ok(button,`Missing button: ${label}`);
    await act(async()=>button.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));
  };
  try{
    await act(async()=>root.render(React.createElement(PackageControl,{storeId:'store-1',storeName:'Test Store'})));
    await click('Edit / Modify');
    const topLevelCheckboxes=dom.window.document.querySelectorAll('.pricing-section > .same-pricing-toggle');
    assert.equal(topLevelCheckboxes.length,1,'only the shared pricing toggle remains above the date cards');
    const longTerm=dom.window.document.querySelector('.nonCampaign .promotion-toggle button:last-child');
    assert.equal(longTerm.textContent,'Long-term Package');
    assert.equal(longTerm.getAttribute('aria-pressed'),'false');
    await click('Long-term Package');
    assert.match(dom.window.document.querySelector('.package-modal').textContent,/End Date: Ongoing/);
    await click('Save Changes');
    assert.equal(submitted.length,1);
    assert.equal(submitted[0].longTerm,true);
    assert.equal(submitted[0].priceSchedules.find(line=>line.priceType==='non_campaign').effectiveTo,null);
    await click('Edit / Modify');
    const openEnded=dom.window.document.querySelector('.nonCampaign .promotion-toggle button:last-child');
    assert.equal(openEnded.getAttribute('aria-pressed'),'true');
    await click('Custom Dates');
    const end=[...dom.window.document.querySelectorAll('.scenario-editor input[type="date"]')].find(input=>input.closest('label')?.textContent==='End Date');
    assert.ok(end);
    await act(async()=>{
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(end,'2026-11-15');
      end.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
      end.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
    });
    await click('Save Changes');
    assert.equal(submitted.length,2);
    assert.equal(submitted[1].longTerm,false);
    assert.equal(submitted[1].priceSchedules.find(line=>line.priceType==='non_campaign').effectiveTo,'2026-11-15');
    await click('Edit / Modify');
    const samePricing=dom.window.document.querySelector('.same-pricing-toggle input');
    if(samePricing.checked) await act(async()=>samePricing.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));
    const campaignLongTerm=dom.window.document.querySelector('.campaign-duration button:last-child');
    assert.equal(campaignLongTerm.textContent,'Long-term Package');
    await act(async()=>campaignLongTerm.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));
    assert.match(dom.window.document.querySelector('.campaign .scenario-body').textContent,/Ongoing every month/);
    assert.deepEqual([...dom.window.document.querySelectorAll('.recurring-event-options b')].map(node=>node.textContent),['Double Day','Mid Month Madness','Payday']);
    assert.equal(dom.window.document.querySelector('.recurring-window-fields'),null);
    assert.equal(dom.window.document.querySelector('.recurring-event-options small'),null);
    assert.equal(dom.window.document.querySelectorAll('.campaign .market-price-grid input').length,2,'one Campaign price for MY');
    assert.equal(dom.window.document.querySelector('.campaign .recurring-end-date-control input'),null);
    await click('Save Changes');
    assert.equal(submitted[2].longTerm,false);
    assert.equal(submitted[2].campaignLongTerm,true);
    assert.equal(submitted[2].samePricing,false);
    assert.equal(submitted[2].priceSchedules.find(line=>line.priceType==='campaign').effectiveTo,null);
    assert.deepEqual(submitted[2].recurringCampaign.events.map(event=>event.id),['dday','mid_month','payday']);
    assert.deepEqual(submitted[2].recurringCampaign.events.map(event=>event.prices.MY.sellingPrice),[90,90,90]);
    const campaignSummary=dom.window.document.querySelectorAll('.package-market-price-row');
    assert.equal(campaignSummary.length,1,'same Normal and Campaign price appears only once');
    assert.match(campaignSummary[0].textContent,/Campaign Day & Normal Day Same Price/);
    assert.match(campaignSummary[0].textContent,/Double Day.*Mid Month Madness.*Payday/);
    assert.doesNotMatch(campaignSummary[0].textContent,/days before|day 14|2026-/);
    await click('Edit / Modify');
    assert.equal(dom.window.document.querySelector('.campaign-duration button:last-child').getAttribute('aria-pressed'),'true');
    const sharedCampaignPrice=dom.window.document.querySelectorAll('.campaign .market-price-grid input')[1];
    await act(async()=>{
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(sharedCampaignPrice,'88');
      sharedCampaignPrice.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
      sharedCampaignPrice.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
    });
    await click('Set End Date');
    const campaignEnd=[...dom.window.document.querySelectorAll('.campaign input[type="date"]')].find(input=>input.closest('label')?.textContent==='End Date');
    assert.ok(campaignEnd);
    await act(async()=>{
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(campaignEnd,'2026-12-15');
      campaignEnd.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
      campaignEnd.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
    });
    await click('Save Changes');
    assert.equal(submitted[3].campaignLongTerm,true);
    assert.equal(submitted[3].recurringCampaign.endDate,'2026-12-15');
    assert.deepEqual(submitted[3].recurringCampaign.events.map(event=>event.prices.MY.sellingPrice),[88,88,88]);
    assert.equal(submitted[3].priceSchedules.find(line=>line.priceType==='campaign').effectiveTo,'2026-12-15');
  } finally {
    await act(async()=>root.unmount());
    for(const key of keys) old[key]?Object.defineProperty(globalThis,key,old[key]):delete globalThis[key];
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    dom.window.close();
  }
});

test('package card separates MY and SG and merges repeated campaign prices', async () => {
  const dom=new JSDOM('<div id="root"></div>',{url:'https://local.test/'});
  const keys=['window','document','navigator','HTMLElement','Event','MouseEvent','fetch'];
  const old=Object.fromEntries(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,MouseEvent:dom.window.MouseEvent})) Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const line=(market,priceType,sellingPrice,effectiveFrom,effectiveTo)=>({market,priceType,originalPrice:market==='MY'?2494:500,sellingPrice,promotionType:'custom',effectiveFrom,effectiveTo});
  const priceSchedules=[
    line('MY','non_campaign',1005.76,'2026-10-01','2026-10-31'),
    line('MY','campaign',1122.5,'2026-10-08','2026-10-10'),
    line('MY','campaign',1122.5,'2026-10-14','2026-10-15'),
    line('MY','campaign',1122.5,'2026-10-24','2026-10-25'),
    line('SG','non_campaign',327,'2026-10-01','2026-10-31'),
    line('SG','campaign',327,'2026-10-08','2026-10-10'),
    line('SG','campaign',327,'2026-10-14','2026-10-15'),
    line('SG','campaign',327,'2026-10-24','2026-10-25'),
  ];
  globalThis.fetch=async()=>({ok:true,json:async()=>({source:'database',canCreate:true,canDelete:false,packages:[{
    id:'pkg-my-sg',storeId:'store-1',name:'Oct Promo B',market:'SG,MY',status:'active',version:3,
    promotionType:'custom',originalPrice:249400,sellingPrice:112250,effectiveFrom:'2026-10-01',effectiveTo:'2026-10-31',
    components:[],platforms:[],priceSchedules,history:[],
  }]})});
  const {createRoot}=await import('react-dom/client');
  const root=createRoot(dom.window.document.getElementById('root'));
  try {
    await act(async()=>root.render(React.createElement(PackageControl,{storeId:'store-1',storeName:'Test Store'})));
    const markets=[...dom.window.document.querySelectorAll('.package-market-column')];
    assert.deepEqual(markets.map(node=>node.querySelector('h4').textContent),['MY RM','SG S$']);
    const myRows=[...markets[0].querySelectorAll('.package-market-price-row')];
    const sgRows=[...markets[1].querySelectorAll('.package-market-price-row')];
    assert.equal(myRows.length,2);
    assert.match(myRows[0].textContent,/Normal Day PriceRM 1005\.76/);
    assert.match(myRows[1].textContent,/Campaign Day PriceRM 1122\.50/);
    assert.match(myRows[1].textContent,/Double Day.*Mid Month Madness.*Payday/);
    assert.equal(sgRows.length,1);
    assert.match(sgRows[0].textContent,/Campaign Day & Normal Day Same PriceS\$ 327\.00/);
    assert.doesNotMatch(dom.window.document.querySelector('.package-card').textContent,/2026-10-/);
  } finally {
    await act(async()=>root.unmount());
    for(const key of keys) old[key]?Object.defineProperty(globalThis,key,old[key]):delete globalThis[key];
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    dom.window.close();
  }
});
