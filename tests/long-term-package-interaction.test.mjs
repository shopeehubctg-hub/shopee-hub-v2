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
      promotionType:'custom',originalPrice:10000,sellingPrice:9000,effectiveFrom:'2026-10-01',effectiveTo:prices.find(p=>p.priceType==='non_campaign').effectiveTo,
      components:[{inventorySku:'ITEM-1',name:'Item',quantity:1,kind:'product'}],platforms:[{platform:'Shopee',packageSku:'TEST-SKU'}],priceSchedules:prices,history:[],
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
  } finally {
    await act(async()=>root.unmount());
    for(const key of keys) old[key]?Object.defineProperty(globalThis,key,old[key]):delete globalThis[key];
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    dom.window.close();
  }
});
