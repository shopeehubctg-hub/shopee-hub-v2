import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';

const dir=new URL('../node_modules/.manual-uniform-price-test/',import.meta.url);
await mkdir(dir,{recursive:true});
await build({entryPoints:[new URL('../app/package-control.tsx',import.meta.url).pathname],outfile:new URL('ui.mjs',dir).pathname,bundle:true,format:'esm',platform:'browser',jsx:'automatic',packages:'external',logLevel:'silent'});
const {PackageControl}=await import(new URL('ui.mjs',dir));

async function setup(prefills=[]){
  const dom=new JSDOM('<div id="root"></div>',{url:'https://local.test/'}),doc=dom.window.document,posts=[];
  const values={window:dom.window,document:doc,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,MouseEvent:dom.window.MouseEvent,crypto:dom.window.crypto,IS_REACT_ACT_ENVIRONMENT:true};
  const prior=Object.fromEntries([...Object.keys(values),'fetch'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  globalThis.fetch=async(url,options={})=>{
    if(options.method==='POST'){posts.push(JSON.parse(options.body));return {ok:true,json:async()=>({ok:true,packageId:'test-package',version:1,status:'draft'})};}
    if(String(url).includes('inventory-skus'))return {ok:true,json:async()=>({products:[],canEdit:false})};
    return {ok:true,json:async()=>({packages:[],source:'database',canDelete:false})};
  };
  const {createRoot}=await import('react-dom/client'),root=createRoot(doc.getElementById('root'));
  const click=async(label,scope=doc)=>{const button=[...scope.querySelectorAll('button')].find(node=>node.textContent===label);assert.ok(button,`Missing button: ${label}`);await act(async()=>button.click());};
  const set=async(selector,value)=>{const element=doc.querySelector(selector);assert.ok(element,`Missing field: ${selector}`);await act(async()=>{Object.getOwnPropertyDescriptor(element.constructor.prototype,'value').set.call(element,value);element.dispatchEvent(new dom.window.Event('input',{bubbles:true}));element.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});};
  await act(async()=>root.render(React.createElement(PackageControl,{storeId:'test-store',storeName:'Test Store',prefills})));
  return {dom,doc,posts,click,set,cleanup:async()=>{await act(async()=>root.unmount());dom.window.close();for(const [key,descriptor] of Object.entries(prior)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}};
}

async function completeDetails(h){
  await h.set('.package-detail-grid input','Test Uniform Price');
  await h.set('[aria-label="Shopee Listing 1 SKU"]','TEST-UNIFORM');
  await h.set('.nonCampaign .market-price-card input','999');
  await h.set('.nonCampaign input[type="month"]','2026-11');
  await h.set('[aria-label="Search Product / Inventory SKU 1"]','TEST-ITEM');
  await h.click('+ Add New Product');
  await h.set('[aria-label="Product Name 1"]','Test Product');
}

test('manual Same Price All Month has no source selector and submits one entered price for both day types',async()=>{
  const h=await setup();
  try{
    await h.click('Create Single Package');
    await h.click('Same Price All Month',h.doc.querySelector('.pricing-mode-options'));
    assert.equal(h.doc.querySelector('[aria-label="Whole-month Price From"]'),null);
    await completeDetails(h);
    await h.set('.nonCampaign .market-price-card label:nth-of-type(2) input','88');
    await h.click('Save Draft');
    assert.equal(h.posts.length,1,h.doc.querySelector('.package-form-errors')?.textContent);
    const body=h.posts[0];
    assert.equal(body.pricingMode,'uniform');
    assert.equal(body.calculatorSettings,null);
    assert.equal(body.priceApplication,undefined);
    assert.equal(body.priceSchedules.length,2);
    assert.deepEqual(new Set(body.priceSchedules.map(line=>Number(line.sellingPrice))),new Set([88]));
    assert.ok(body.priceSchedules.every(line=>line.effectiveFrom==='2026-11-01'&&line.effectiveTo==='2026-11-30'));
  }finally{await h.cleanup();}
});

test('Calculator recommendations still require a source and retain it with the original snapshots',async()=>{
  const prefills=['normal_1_15','campaign','normal_16_end'].map((period,index)=>({
    requestId:index+1,calculatorGroupId:'calculator-package',name:'Calculator Test',sellingPrice:80+index*10,
    calculatorSettings:{source:'Shopee Pricing Calculator',calculationKind:'three_period_recommendations',pricingSchemaVersion:2,pricingMode:'split_normal',pricingPeriod:period,packageName:'Calculator Test',category:'Beauty',serviceScenario:period==='campaign'?'Campaign Day':'Non-Campaign Day',facebookPrice:70,suggestedShopeePrice:80+index*10,customerVoucherPrice:70,commissionRate:0,serviceRate:0,actualPayout:70},
  }));
  const h=await setup(prefills);
  try{
    await h.click('Same Price All Month',h.doc.querySelector('.pricing-mode-options'));
    assert.ok(h.doc.querySelector('[aria-label="Whole-month Price From"]'));
    await completeDetails(h);
    await h.click('Save Draft');
    assert.equal(h.posts.length,0);
    assert.match(h.doc.body.textContent,/Choose which price to use for the whole month/);
    await h.set('[aria-label="Whole-month Price From"]','normal_16_end');
    await h.click('Save Draft');
    assert.equal(h.posts.length,1,h.doc.querySelector('.package-form-errors')?.textContent);
    assert.deepEqual(h.posts[0].priceApplication,{mode:'uniform',sourcePeriod:'normal_16_end'});
    assert.deepEqual(new Set(h.posts[0].priceSchedules.map(line=>Number(line.sellingPrice))),new Set([100]));
    assert.equal(h.posts[0].calculatorSettings.scenarios.length,3);
    assert.equal(h.posts[0].calculatorSettings.scenarios[0].suggestedShopeePrice,80);
  }finally{await h.cleanup();}
});
