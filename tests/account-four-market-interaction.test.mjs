import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';

const dir=new URL('../node_modules/.account-market-test/',import.meta.url);
await mkdir(dir,{recursive:true});
await build({stdin:{contents:`import React from 'react';import {AccountPanel} from './app/account-panel';import {FeePlansProvider,useFeePlans} from './app/fee-plan-context';
function Harness(){const context=useFeePlans();return <><button id="add-fixed" onClick={()=>context.upsertPlan({id:'test-fixed',name:'Fixed MYR 200',clientType:'Internal',currency:'MYR',effectiveMonth:'2026-10',rule:{type:'fixed',currency:'MYR',basis:'fixed_monthly',fixedAmount:'200.00'}})}>Add fixed test card</button><AccountPanel/><output id="preview-memory">{JSON.stringify(context.previewMemory)}</output></>};export const App=()=> <FeePlansProvider><Harness/></FeePlansProvider>;`,resolveDir:process.cwd(),loader:'tsx'},outfile:new URL('ui.mjs',dir).pathname,bundle:true,format:'esm',platform:'browser',jsx:'automatic',packages:'external',loader:{'.css':'empty'},logLevel:'silent'});
const {App}=await import(new URL('ui.mjs',dir));
const row=(id,market,currency,extra={})=>({id,rosterKey:`store:${id}`,storeId:`shopee-${id}`,storeName:`${id} Store`,project:`${id} client`,entity:`${id} Co`,market,currency,statementMonth:'2026-09',invoiceMonth:'2026-10',servicePeriodStart:null,servicePeriodEnd:null,status:'pending_terms',expectedNetFee:null,billed:null,collected:null,outstanding:null,mappingStatus:'resolved',candidates:[],...extra});
const summary=currency=>({currency,expectedNetFee:null,billed:null,collected:null,outstanding:null,overpaid:null,todayCollected:null,monthCollected:null,pendingStores:0});

test('Account country sections, TH/PH MYR rate previews and visible-only selection stay connected',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://local.test/'});
 const values={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,MouseEvent:dom.window.MouseEvent,FormData:dom.window.FormData,IS_REACT_ACT_ENVIRONMENT:true};
 const prior=Object.fromEntries([...Object.keys(values),'fetch'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const [key,value]of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const rows=[row('MY','MY','MYR'),row('SG','SG','SGD'),row('TH','TH','MYR',{salesCurrency:'THB',previewMarketFxEligible:true,billed:'120.00',previewServiceFxRate:{serviceMonth:'2026-09',rate:'0.1225',policy:'bnm-service-average',verified:true,reference:'https://storage.data.gov.my/finsector/exr/monthly.csv',currency:'THB',quotationUnit:1}}),row('PH','PH','PHP',{salesCurrency:'PHP',previewMarketFxEligible:true})];
 const data={invoiceMonth:'2026-10',statementMonth:'2026-09',today:'2026-10-28',timezone:'Asia/Kuala_Lumpur',status:'not_configured',updatedAt:null,settingsAvailable:false,stores:rows,storeOptions:rows.map(r=>({id:r.storeId,name:r.storeName,platform:`Shopee ${r.market}`})),summaries:['MYR','SGD','THB','PHP'].map(summary)};
 data.summaries[3].todayCollected='7.00';
 const requests=[];globalThis.fetch=async(url,options={})=>{requests.push({url,method:options.method??'GET'});assert.match(url,/^\/api\/admin\/account\?/);return {ok:true,json:async()=>structuredClone(data)};};
 const {createRoot}=await import('react-dom/client');const root=createRoot(dom.window.document.getElementById('root')),doc=dom.window.document;
 const byLabel=label=>doc.querySelector(`[aria-label="${label}"]`);
 const change=async(element,value)=>act(async()=>{element.value=value;element.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
 const input=async(element,value)=>act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(element,value);element.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
 const click=async(element)=>{assert.ok(element);await act(async()=>element.click());};
 const button=text=>[...doc.querySelectorAll('button')].find(node=>node.textContent.trim()===text);
 const dialog=()=>doc.querySelector('.fp-workspace-dialog');
 try{
  await act(async()=>root.render(React.createElement(App)));
  assert.deepEqual([...doc.querySelectorAll('.account-market-section h4')].map(node=>node.textContent.replace(/\s*1$/,'')),['Malaysia','Singapore','Thailand','Philippines']);
  assert.ok(byLabel('MYR income overview'));assert.ok(byLabel('SGD income overview'));assert.equal(byLabel('THB income overview'),null);assert.match(byLabel('PHP income overview').textContent,/₱ 7.00/);
  const thRow=doc.querySelector('#account-market-TH').parentElement.querySelector('tbody tr');assert.match(thRow.textContent,/RM 120.00/);assert.doesNotMatch(thRow.textContent,/฿ 120/);
  await click(byLabel('Select TH client'));assert.match(doc.querySelector('.account-selection-bar').textContent,/1 selected/);
  await change(byLabel('Billing country'),'PH');assert.equal(doc.querySelector('.account-selection-bar'),null);assert.equal(doc.querySelectorAll('.account-market-section').length,1);assert.match(doc.querySelector('.account-market-section h4').textContent,/Philippines/);
  await change(byLabel('Billing country'),'all');await input(doc.querySelector('#account-record-search'),'TH Co');assert.equal(doc.querySelectorAll('tbody tr').length,1);assert.equal(doc.querySelector('.account-market-section h4').textContent,'Thailand 1');
  await click(byLabel('View details for TH client'));assert.match(doc.querySelector('.account-record-dialog header').textContent,/Thailand · MYR/);assert.match(doc.querySelector('.account-record-fields').textContent,/Sales currencyTHB/);await click(byLabel('Close billing record'));
  await input(doc.querySelector('#account-record-search'),'');await change(byLabel('Billing country'),'TH');
  await click(byLabel('Edit monthly rate for TH client'));await change(dialog().querySelector('[aria-label="Rate card client type"]'),'External');await change(dialog().querySelector('[aria-label="Rate card"]'),'external-10');await input(dialog().querySelector('[aria-label="Preview calculation amount"]'),'100000');
  assert.match(dialog().textContent,/THB sales · preview/);assert.match(dialog().textContent,/THB × 0.1225 = RM 12,250.00/);assert.equal(dialog().querySelector('.fp-calculation strong').textContent,'RM 1,225.00');await click(button('Cancel'));
  await click(doc.querySelector('#add-fixed'));await change(byLabel('Billing country'),'PH');await click(byLabel('Edit monthly rate for PH client'));await change(dialog().querySelector('[aria-label="Rate card client type"]'),'Internal');await change(dialog().querySelector('[aria-label="Rate card"]'),'test-fixed');
  assert.equal(dialog().querySelector('.fp-calculation strong').textContent,'RM 200.00');assert.doesNotMatch(dialog().textContent,/Exchange rate pending/);assert.equal(dialog().querySelector('[aria-label="Preview calculation amount"]'),null);await click(button('Cancel'));
  await change(byLabel('Billing country'),'all');await click(byLabel('Select TH client'));await click(byLabel('Select PH client'));await click(button('Update rate card'));
  await change(dialog().querySelector('[aria-label="Rate card client type"]'),'Internal');await change(dialog().querySelector('[aria-label="Rate card"]'),'internal-new');assert.equal(button('Apply preview for 2 records').disabled,false);await click(button('Apply preview for 2 records'));
  assert.match(dialog().textContent,/Applied Internal NEW/);await click(button('Cancel'));
  const memory=JSON.parse(doc.querySelector('#preview-memory').textContent);assert.deepEqual(Object.keys(memory['fee-preview-assignments-v2']).sort(),['store:PH','store:TH']);
  await change(byLabel('Billing country'),'MY');assert.equal(doc.querySelector('.account-selection-bar'),null);assert.equal(byLabel('Edit monthly rate for MY client').textContent.trim(),'Set rate');
  data.stores=rows.slice(0,2);data.summaries=['MYR','SGD','THB','PHP'].map(summary);
  await click(button('Refresh'));await change(byLabel('Billing country'),'TH');
  assert.match(doc.querySelector('.account-market-section').textContent,/Thailand.*No billing records for Thailand/);
  assert.equal(byLabel('Edit monthly rate for TH client'),null);assert.equal(byLabel('THB income overview'),null);assert.equal(byLabel('PHP income overview'),null);
  assert.ok([...byLabel('Billing country').options].some(option=>option.value==='PH'));
  assert.ok(requests.every(request=>request.method==='GET'));
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,descriptor]of Object.entries(prior)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});
