import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const {JSDOM}=await import(process.env.BD_DOM_TEST_JSDOM??'jsdom');
const compiled=execFileSync('node_modules/.bin/esbuild',['--bundle','--format=esm','--platform=node','--target=node20','--loader=tsx','--jsx=automatic'],{maxBuffer:10*1024*1024,input:`
import React,{act,useState} from 'react';import {createRoot} from 'react-dom/client';
import {FeePlansProvider,useFeePlans} from './app/fee-plan-context';
import {AccountSetupFields,emptyAccountSetup,resetAccountSetupSelection,accountSetupPayload} from './app/store-account-setup-fields';
function Harness(){const {plans,archivePlan}=useFeePlans();const [market,setMarket]=useState('MY');const [draft,setDraft]=useState(()=>({...emptyAccountSetup(),legalEntity:'Test entity',effectiveMonth:'2026-10'}));const [result,setResult]=useState('');return <><button id="switch" onClick={()=>{const next=market==='MY'?'SG':'MY';setMarket(next);setDraft(resetAccountSetupSelection(draft,next));}}>Switch market</button><button id="archive" onClick={()=>archivePlan(draft.planId)}>Delete selected card</button><AccountSetupFields draft={draft} market={market} update={patch=>setDraft(current=>({...current,...patch}))}/><button id="validate" onClick={()=>{try{setResult(JSON.stringify(accountSetupPayload(draft,market,plans,'2026-10')));}catch(error){setResult(error.message);}}}>Validate</button><output id="draft">{JSON.stringify(draft)}</output><output id="result">{result}</output></>}
export {act,createRoot};export const App=()=> <FeePlansProvider><Harness/></FeePlansProvider>;
`});
test('Add Store uses compact shared Rate cards, native month input, SG policies, tier caps and deleted-card invalidation',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://test.local/'});const saved=new Map();const channels=[];const NativeChannel=globalThis.MessageChannel;
 for(const key of ['window','document','navigator','HTMLElement','Event','MouseEvent','FormData','MessageChannel']){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:dom.window[key]});}
 globalThis.MessageChannel=class extends NativeChannel{constructor(){super();channels.push(this);}};globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const {act,createRoot,App}=await import(`data:text/javascript;base64,${compiled.toString('base64')}`);const root=createRoot(document.querySelector('#root'));
 const click=async selector=>act(()=>document.querySelector(selector).dispatchEvent(new MouseEvent('click',{bubbles:true})));const change=async(selector,value,event='change')=>act(()=>{const element=document.querySelector(selector);element.value=value;element.dispatchEvent(new Event(event,{bubbles:true}));});const draft=()=>JSON.parse(document.querySelector('#draft').textContent);
 try{
  await act(()=>root.render(App()));assert.equal(document.querySelector('[aria-label="Account rate card"]').disabled,true);assert.equal(document.querySelector('.store-account-custom').open,false);
  await change('[aria-label="Account client type"]','Internal');await change('[aria-label="Account rate card"]','internal-new');assert.match(document.querySelector('[aria-label="Selected rate card summary"]').textContent,/Whole-month tiers.*cap MYR 4000/);assert.equal(document.querySelector('.store-account-custom .account-rate-fields'),null);
  await change('[name="accountEffectiveInvoiceMonth"]','2026-11','input');assert.equal(draft().effectiveMonth,'2026-11');assert.equal(draft().planId,'internal-new');assert.equal(draft().planVersion,1);
  await click('#switch');assert.equal(draft().legalEntity,'Test entity');assert.equal(draft().effectiveMonth,'2026-11');assert.equal(draft().planId,'');assert.match(document.querySelector('fieldset').textContent,/Sales currency: SGD · Fee currency: MYR/);assert.match(document.querySelector('fieldset').textContent,/SGD 1 = MYR 3.2/);
  await change('[aria-label="Account rate card"]','internal-new');await click('#validate');let result=JSON.parse(document.querySelector('#result').textContent);assert.equal(result.inputCurrency,'SGD');assert.equal(result.feeRule.tiers[4].cap,'4000.00');assert.equal(result.fxRate,'3.2');
  await change('[aria-label="Account client type"]','External');assert.equal(draft().planId,'');assert.equal(document.querySelector('[aria-label="Account SGD exchange rate policy"]').value,'');await change('[aria-label="Account rate card"]','external-10');await click('#validate');assert.match(document.querySelector('#result').textContent,/exchange rate policy/);
  await change('[aria-label="Account SGD exchange rate policy"]','bnm-service-average');await click('#validate');result=JSON.parse(document.querySelector('#result').textContent);assert.equal(result.fxPolicy,'bnm-service-average');assert.equal(result.fxRate,undefined);
  await click('#archive');assert.equal(document.querySelector('[aria-label="Account rate card"]').value,'');assert.equal([...document.querySelector('[aria-label="Account rate card"]').options].some(option=>option.value==='external-10'),false);await click('#validate');assert.match(document.querySelector('#result').textContent,/available MYR rate card/);
 }finally{await act(()=>root.unmount());dom.window.close();for(const channel of channels){channel.port1.close();channel.port2.close();}for(const [key,value] of saved){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
});
