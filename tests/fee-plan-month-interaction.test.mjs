import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const {JSDOM}=await import(process.env.BD_DOM_TEST_JSDOM??'jsdom');
const sourceRates=JSON.parse(readFileSync('app/account-rate-mapping-preview.json','utf8'));
const compiled=execFileSync('node_modules/.bin/esbuild',['--bundle','--format=esm','--platform=node','--target=node20','--loader=tsx','--loader:.css=empty','--jsx=automatic'],{maxBuffer:10*1024*1024,input:`
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {FeePlansProvider,useFeePlans,monthlyFeePreview} from './app/fee-plan-context';
import {FeePlansPreview} from './app/fee-plans-preview';
import {RateCell} from './app/account-settings-ui';
const defaultRow={id:'unit',rosterKey:'unit',project:'Test company',currency:'MYR'};
function Harness({row:record=defaultRow,month='2026-10'}){const row=record;const c=useFeePlans();return <><button id="open" onClick={()=>c.openFeeWorkspace({view:'assignment',month,unitKey:row.rosterKey})}>Open</button><RateCell row={row} month={month} onEdit={()=>c.openFeeWorkspace({view:'assignment',month,unitKey:row.rosterKey})}/><output id="memory">{JSON.stringify(c.previewMemory)}</output><output id="plans">{JSON.stringify(c.plans)}</output><output id="oct">{monthlyFeePreview(row,'2026-10',c.plans,c.previewMemory).plan?.name??'Unassigned'}</output><output id="nov">{monthlyFeePreview(row,'2026-11',c.plans,c.previewMemory).plan?.name??'Unassigned'}</output><output id="scheduled">{monthlyFeePreview(row,'2026-10',c.plans,c.previewMemory).nextEffectiveMonth}</output><FeePlansPreview rows={[row]} month={month}/></>}
export {act,createRoot};export const App=(props={})=> <FeePlansProvider key={props.row?.rosterKey??'unit'}><Harness {...props}/></FeePlansProvider>;
`});

test('native month input and submit guard preserve October and schedule November; editor also honors input-only month',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://test.local/'});
 const channels=[];const NativeMessageChannel=globalThis.MessageChannel;
 const saved=new Map();for(const key of ['window','document','navigator','HTMLElement','Event','MouseEvent','FormData','MessageChannel']){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key],writable:true});}
 globalThis.MessageChannel=class extends NativeMessageChannel{constructor(){super();channels.push(this);}};
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const {act,createRoot,App}=await import(`data:text/javascript;base64,${compiled.toString('base64')}`);
 const root=createRoot(document.querySelector('#root'));
 const click=async(el)=>act(()=>el.dispatchEvent(new MouseEvent('click',{bubbles:true})));
 const change=async(el,value,event='change')=>act(()=>{el.value=value;el.dispatchEvent(new Event(event,{bubbles:true}));});
 const submit=async()=>act(()=>document.querySelector('.fp-assignment-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 const memory=()=>JSON.parse(document.querySelector('#memory').textContent);
 try{
  await act(()=>root.render(App()));await click(document.querySelector('#open'));
  await change(document.querySelector('[aria-label="Rate card client type"]'),'External');
  const card=document.querySelector('[aria-label="Rate card"]');const cards=[...card.options].filter(o=>o.value);
  await change(card,cards[0].value);await submit();const oct=document.querySelector('#oct').textContent;assert.notEqual(oct,'Unassigned');
  // Native input alone must update React even when its change plugin never fires.
  await change(document.querySelector('[name="effectiveInvoiceMonth"]'),'2026-11','input');
  await change(document.querySelector('[aria-label="Rate card"]'),cards[1].value);await submit();
  assert.equal(document.querySelector('#oct').textContent,oct);
  assert.notEqual(document.querySelector('#nov').textContent,oct);
  assert.equal(document.querySelector('#scheduled').textContent,'2026-11');
  assert.equal(memory()['fee-preview-application-history'][0].effectiveMonth,'2026-11');
  // A visible DOM month changed without any event must never commit stale state.
  const before=JSON.stringify(memory());document.querySelector('[name="effectiveInvoiceMonth"]').value='2026-12';
  await submit();assert.equal(JSON.stringify(memory()),before);assert.match(document.querySelector('[role="alert"]').textContent,/2026-12.*Review/);
  await submit();assert.equal(memory()['fee-preview-application-history'][0].effectiveMonth,'2026-12');
  await click([...document.querySelectorAll('[role="tab"]')].find(el=>el.textContent==='Rate cards'));
  await click(document.querySelector('.fp-plan .fp-secondary'));
  const form=document.querySelector('.fp-editor');const planCount=JSON.parse(document.querySelector('#plans').textContent).length;
  await change(form.querySelector('[name="effectiveInvoiceMonth"]'),'2026-11','input');
  await act(()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  const plans=JSON.parse(document.querySelector('#plans').textContent);assert.equal(plans.length,planCount+1);assert.equal(plans.at(-1).effectiveMonth,'2026-11');
  const internalCard=[...document.querySelectorAll('.fp-plan')].find(card=>card.querySelector('h4').textContent==='Internal NEW');
  await click(internalCard.querySelector('.fp-secondary'));
  const internalForm=document.querySelector('.fp-editor');assert.equal(internalForm.querySelector('[aria-label="Tier 5 fee cap"]').value,'4000');
  assert.equal(internalForm.querySelector('[aria-label="Tier 4 fee cap"]').value,'');
  await act(()=>internalForm.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  const savedInternal=JSON.parse(document.querySelector('#plans').textContent).at(-1);assert.equal(savedInternal.rule.tiers[4].cap,'4000.00');assert.equal(savedInternal.rule.tiers[3].cap,undefined);
  // SG source defaults use MYR cards, but show SGD input and MYR fee explicitly.
  const sgSource=sourceRates.records.find(record=>record.currency==='SGD'&&record.planId==='internal-new');
  const sgRow={id:sgSource.rosterKey,rosterKey:sgSource.rosterKey,project:sgSource.project,currency:'SGD',previewRateDefaultsEligible:true};
  await act(()=>root.render(App({row:sgRow})));await click(document.querySelector('#open'));
  assert.match(document.querySelector('.account-rate-field').textContent,/SGD → MYR.*3.2/);
  assert.match(document.querySelector('.fp-calculation-input').textContent,/SGD sales/);
  await change(document.querySelector('[aria-label="Preview calculation amount"]'),'62500','input');
  assert.match(document.querySelector('.fp-calculation strong').textContent,/RM 4,000.00/);
  assert.match(document.querySelector('.fp-assignment-form').textContent,/RM 200,000.00/);
  await submit();await click([...document.querySelectorAll('button')].find(button=>button.textContent==='Lock applied preview'));
  const sgSnapshot=memory()['fee-preview-history'][0];assert.equal(sgSnapshot.amount,'62500');assert.equal(sgSnapshot.conversion.fxRate,'3.2');assert.equal(sgSnapshot.conversion.serviceMonth,'2026-09');assert.equal(sgSnapshot.conversion.convertedAmount,'200000.00');
  const bonlife=sourceRates.records.find(record=>record.currency==='SGD'&&record.fxPolicy==='bnm-service-average');
  await act(()=>root.render(App({row:{...sgRow,id:bonlife.rosterKey,rosterKey:bonlife.rosterKey,project:bonlife.project},month:'2026-11'})));await click(document.querySelector('#open'));
  await change(document.querySelector('[aria-label="Preview calculation amount"]'),'1000','input');await submit();
  assert.match(document.querySelector('.fp-assignment-form').textContent,/Exchange rate pending.*2026-10/);
  assert.equal(document.querySelector('.fp-calculation strong').textContent,'—');
  assert.equal([...document.querySelectorAll('button')].find(button=>button.textContent==='Lock applied preview').disabled,true);
  assert.equal(memory()['fee-preview-history'],undefined);


 }finally{await act(()=>root.unmount());dom.window.close();for(const channel of channels){channel.port1.close();channel.port2.close();}for(const [key,value] of saved){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
});
