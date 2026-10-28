import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
const dir=new URL('../node_modules/.package-four-market-test/',import.meta.url);
await mkdir(dir,{recursive:true});
await build({entryPoints:[new URL('../app/package-control.tsx',import.meta.url).pathname],outfile:new URL('ui.mjs',dir).pathname,bundle:true,format:'esm',platform:'browser',jsx:'automatic',packages:'external',logLevel:'silent'});
const {PackageControl}=await import(new URL('ui.mjs',dir));

test('four-market creation, draft editing and recurring prices preserve currencies, defaults and filtered List columns',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://local.test/'});
 const values={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,MouseEvent:dom.window.MouseEvent,IS_REACT_ACT_ENVIRONMENT:true};
 const prior=Object.fromEntries([...Object.keys(values),'fetch'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
 const markets=['MY','SG','TH','PH'];
 const base={id:'legacy-th',name:'Legacy Thailand',storeId:'store',packageSku:'TH-SKU',market:'TH',status:'active',version:1,promotionType:'custom',originalPrice:10000,sellingPrice:9000,effectiveFrom:'2026-10-01',effectiveTo:null,components:[{inventorySku:'TH-INV',name:'Product',quantity:1,kind:'product'}],platforms:[{platform:'Shopee',packageSku:'TH-SKU'}],sheetSyncStatus:'synced'};
 let packages=[base];const submitted=[];
 globalThis.fetch=async(url,options={})=>{if(options.method==='POST'){const body=JSON.parse(options.body);submitted.push(body);const item={...base,...body,id:'four',name:body.name,market:body.markets.join(','),status:body.mode==='draft'?'draft':'active',version:submitted.length,priceSchedules:body.priceSchedules.map(line=>({...line,originalPrice:Number(line.originalPrice),sellingPrice:Number(line.sellingPrice)}))};packages=[base,item];return {ok:true,json:async()=>({ok:true,packageId:'four',version:item.version,status:item.status})};}return {ok:true,json:async()=>({source:'database',packages})};};
 const {createRoot}=await import('react-dom/client');const root=createRoot(dom.window.document.getElementById('root'));const doc=dom.window.document;
 const click=async(text,scope=doc)=>{const button=[...scope.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(button,`button ${text}`);await act(async()=>button.click());};
 const set=async(input,value)=>{assert.ok(input);await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));input.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});};
 const marketChecks=()=>[...doc.querySelectorAll('.market-selector label')].map(label=>[label.querySelector('b').textContent,label.querySelector('input')]);
 try {
 await act(async()=>root.render(React.createElement(PackageControl,{storeId:'store',storeName:'Thailand Store',storePlatform:'Shopee TH'})));
 assert.match(doc.querySelector('.package-card').textContent,/฿ 90.00/);
 await click('+ New Package');assert.deepEqual(marketChecks().filter(([,input])=>input.checked).map(([code])=>code),['TH']);
 for(const [,input] of marketChecks())if(!input.checked)await act(async()=>input.click());
 await set(doc.querySelector('input[placeholder="e.g. Golden Package 肾心健康"]')??doc.querySelector('.package-detail-grid input'),'Four Markets');
 await set(doc.querySelector('.listing-skus input'),'FOUR-SKU');
 await act(async()=>doc.querySelector('.same-pricing-toggle input').click());
 for(const [index,card] of [...doc.querySelectorAll('.nonCampaign .market-price-card')].entries()){const inputs=card.querySelectorAll('input');await set(inputs[0],String(100+index*100));await set(inputs[1],String(90+index*100));}
 await set(doc.querySelector('.nonCampaign input[type="month"]'),'2026-11');
 await set(doc.querySelector('input[placeholder="OXM Inventory SKU"]'),'FOUR-INV');await set(doc.querySelector('input[placeholder="Item Name"]'),'Four market product');
 await click('Save Draft');assert.equal(submitted.length,1,doc.querySelector('.package-form-errors')?.textContent);
 assert.deepEqual([...submitted[0].markets].sort(),markets.slice().sort());
 assert.equal(submitted[0].mode,'draft');assert.equal(submitted[0].priceSchedules.length,8);
 for(const market of markets){const normal=submitted[0].priceSchedules.find(line=>line.market===market&&line.priceType==='non_campaign');const campaign=submitted[0].priceSchedules.find(line=>line.market===market&&line.priceType==='campaign');assert.equal(campaign.sellingPrice,normal.sellingPrice);}
 await click('Edit Draft');assert.deepEqual(marketChecks().filter(([,input])=>input.checked).map(([code])=>code),markets);
 assert.equal([...doc.querySelectorAll('.nonCampaign .market-price-card')].find(card=>card.querySelector('strong').textContent.startsWith('TH')).querySelectorAll('input')[1].value,'90');
 await act(async()=>doc.querySelector('.same-pricing-toggle input').click());
 await click('Long-term Package',doc.querySelector('.campaign-duration'));
 for(const card of doc.querySelectorAll('.campaign .market-price-card')){const [original,selling]=card.querySelectorAll('input');await set(original,'500');await set(selling,card.querySelector('strong').textContent.startsWith('PH')?'350':'400');}
 await click('Create Package',doc.querySelector('.form-actions'));assert.equal(submitted.length,2,doc.querySelector('.package-form-errors')?.textContent);
 assert.equal(submitted[1].mode,'publish');assert.equal(submitted[1].campaignLongTerm,true);
 for(const event of submitted[1].recurringCampaign.events){assert.deepEqual(Object.keys(event.prices),markets);assert.equal(event.prices.PH.sellingPrice,350);assert.equal(event.prices.TH.sellingPrice,400);}
 const four=[...doc.querySelectorAll('.package-card')].find(card=>card.querySelector('h3')?.textContent==='Four Markets');assert.match(four.textContent,/฿/);assert.match(four.textContent,/₱ 350.00/);assert.match(four.textContent,/S\$/);assert.match(four.textContent,/RM/);
 await click('Edit / Modify',four);const ph=[...doc.querySelectorAll('.campaign .market-price-card')].find(card=>card.querySelector('strong').textContent.startsWith('PH'));assert.equal(ph.querySelectorAll('input')[1].value,'350');await set(ph.querySelectorAll('input')[1],'330');await click('Long-term Package',doc.querySelector('.nonCampaign .promotion-toggle'));await click('Save Changes');assert.equal(submitted[2].recurringCampaign.events[0].prices.PH.sellingPrice,330);assert.equal(submitted[2].longTerm,true);assert.ok(submitted[2].priceSchedules.filter(line=>line.priceType==='non_campaign').every(line=>line.effectiveTo===null));
 await click('List View');assert.deepEqual([...doc.querySelectorAll('.package-sheet thead th')].filter(n=>n.textContent.includes('prices')).map(n=>n.textContent),['MY · RM prices','SG · S$ prices','TH · ฿ prices','PH · ₱ prices']);
 await set(doc.querySelector('[aria-label="Search package or platform SKU"]'),'Legacy Thailand');assert.deepEqual([...doc.querySelectorAll('.package-sheet thead th')].filter(n=>n.textContent.includes('prices')).map(n=>n.textContent),['TH · ฿ prices']);assert.match(doc.querySelector('.package-sheet').textContent,/฿ 90.00/);
 await act(async()=>doc.querySelector('[aria-label="View details for Legacy Thailand"]').click());assert.equal(doc.querySelector('.package-sheet-detail td').colSpan,9);
 } finally {await act(async()=>root.unmount());dom.window.close();for(const [key,desc] of Object.entries(prior)){if(desc)Object.defineProperty(globalThis,key,desc);else delete globalThis[key];}}
});
