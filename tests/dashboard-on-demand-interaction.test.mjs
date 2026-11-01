import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act,useState} from 'react';
const dir=new URL('../node_modules/.dashboard-on-demand-test/',import.meta.url);await mkdir(dir,{recursive:true});
const built=await build({entryPoints:{page:new URL('../app/page.tsx',import.meta.url).pathname,plans:new URL('../app/fee-plan-context.tsx',import.meta.url).pathname},outdir:dir.pathname,bundle:true,splitting:true,format:'esm',platform:'browser',packages:'external',jsx:'automatic',metafile:true,logLevel:'silent'});
const {default:Home}=await import(new URL('page.js',dir));const {FeePlansProvider,useFeePlans}=await import(new URL('plans.js',dir));
async function setup(url='https://local.test/'){
 const dom=new JSDOM('<div id="root"></div>',{url});const values={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,MouseEvent:dom.window.MouseEvent,IS_REACT_ACT_ENVIRONMENT:true};const prior=Object.fromEntries([...Object.keys(values),'fetch'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});const {createRoot}=await import('react-dom/client');const root=createRoot(dom.window.document.getElementById('root'));return {dom,root,doc:dom.window.document,close:async()=>{await act(async()=>root.unmount());dom.window.close();for(const [key,desc] of Object.entries(prior)){if(desc)Object.defineProperty(globalThis,key,desc);else delete globalThis[key];}}};
}
const waitFor=async(predicate)=>{for(let i=0;i<50;i++){if(predicate())return;await act(async()=>new Promise(resolve=>setTimeout(resolve,10)));}assert.ok(predicate(),'expected UI state did not arrive');};

test('page build keeps seven heavy module implementations behind dynamic imports',()=>{
 const entry=Object.entries(built.metafile.outputs).find(([,output])=>output.entryPoint?.endsWith('app/page.tsx'));
 assert.ok(entry);const dynamic=entry[1].imports.filter(item=>item.kind==='dynamic-import');assert.equal(dynamic.length,7);
 const initial=new Set();const visit=path=>{for(const input of Object.keys(built.metafile.outputs[path].inputs))initial.add(input);for(const link of built.metafile.outputs[path].imports)if(!link.external&&link.kind==='import-statement')visit(link.path);};visit(entry[0]);
 for(const module of ['package-control','price-calculator','design-checker','fake-seller-report','permission-settings','live-calendar','account-panel'])assert.ok(![...initial].some(input=>input.endsWith(`app/${module}.tsx`)),`${module} must not be eager`);
});

test('shell boots first, scoped data loads on demand and stale concurrent store/module responses cannot repaint it',async()=>{
 const env=await setup();const {root,doc}=env;const requests=[];const packageRequests=[];
 globalThis.fetch=(url,options={})=>{if(String(url).startsWith('/api/packages')){packageRequests.push(url);return Promise.resolve({ok:true,json:async()=>({packages:[],source:'database'})});}return new Promise((resolve,reject)=>requests.push({url,options,resolve,reject}));};
 const stores=['A','B','C'].map(id=>({id,name:`Store ${id}`,platform:'Shopee MY',contacts:[]}));
 const payload=(id,metric)=>({user:{email:'client@example.test'},access:{role:'client',enabledModules:['overview','advertising','packages','calculator'],clientEnabledModules:['overview','advertising','packages','calculator'],canManagePermissions:false},stores,selectedStoreId:id,snapshot:metric?{payload:{noSample:true,overview:[['Valid Order Sales',metric,'']],orders:[],clientActions:[]},importedAt:'2026-10-28'}:null,adBalance:null,adPerformance:[],actions:[],productProfile:null,coFundVouchers:[]});
 const deliver=async(index,data,status=200)=>act(async()=>requests[index].resolve({ok:status===200,status,json:async()=>data}));
 const store=async(id)=>act(async()=>{const select=doc.querySelector('.toolbar select');assert.equal(select.disabled,false);select.value=id;select.dispatchEvent(new env.dom.window.Event('change',{bubbles:true}));});
 const nav=async(name)=>act(async()=>[...doc.querySelectorAll('nav button')].find(button=>button.textContent.endsWith(name)).click());
 try{
 await act(async()=>root.render(React.createElement(Home)));assert.equal(requests.length,1);assert.equal(requests[0].url,'/api/dashboard?section=bootstrap');assert.equal(doc.querySelector('nav'),null);
 await deliver(0,payload('A'));assert.ok(doc.querySelector('nav'));assert.equal(doc.querySelector('header h1').textContent,'Store A');assert.equal(requests.length,2);assert.match(requests[1].url,/section=overview&storeId=A/);assert.match(doc.body.textContent,/Loading module/);assert.doesNotMatch(doc.body.textContent,/Permission Settings|Super Admin access/);
 await store('B');assert.equal(requests[1].options.signal.aborted,true);await store('C');assert.equal(requests[2].options.signal.aborted,true);assert.equal(doc.querySelector('header h1').textContent,'Store C');
 await deliver(3,payload('C','C source metric'));assert.match(doc.body.textContent,/C source metric/);await deliver(2,payload('B','B stale metric'));await deliver(1,payload('A','A stale metric'));assert.doesNotMatch(doc.body.textContent,/A stale metric|B stale metric/);assert.match(doc.body.textContent,/C source metric/);
 await nav('Advertising');assert.match(requests[4].url,/section=advertising&storeId=C/);assert.doesNotMatch(doc.body.textContent,/C source metric/);await deliver(4,{},500);assert.match(doc.querySelector('[role="alert"]').textContent,/Unable to load this module/);
 await act(async()=>[...doc.querySelectorAll('button')].find(button=>button.textContent==='Retry module').click());await deliver(5,payload('C'));assert.match(doc.body.textContent,/Individual ad data is temporarily unavailable/);
 // Refresh permission/bootstrap data may not overwrite a later store choice.
 await act(async()=>[...doc.querySelectorAll('button')].find(button=>button.textContent==='Update data').click());assert.match(requests[6].url,/section=bootstrap/);await store('B');assert.equal(requests[6].options.signal.aborted,true);await deliver(7,payload('B'));await deliver(6,payload('C'));assert.equal(doc.querySelector('header h1').textContent,'Store B');
 await store('A');await deliver(8,payload('C','Foreign store metric'));assert.equal(doc.querySelector('header h1').textContent,'Store A');assert.match(doc.querySelector('[role="alert"]').textContent,/verify this module/);assert.doesNotMatch(doc.body.textContent,/Foreign store metric/);await act(async()=>[...doc.querySelectorAll('button')].find(button=>button.textContent==='Retry module').click());await deliver(9,payload('A'));
 await act(async()=>[...doc.querySelectorAll('button')].find(button=>button.textContent==='Update data').click());await deliver(10,payload('A'));assert.match(requests[11].url,/section=advertising&storeId=A&refresh=1/);await deliver(11,payload('A'));assert.ok(!requests[1].url.includes('refresh=1'));assert.ok(!requests[7].url.includes('refresh=1'));
 const count=requests.length;await nav('Packages & Pricing');await waitFor(()=>packageRequests.length===1);assert.equal(requests.length,count,'self-fetching Packages needs no dashboard snapshot');assert.match(packageRequests[0],/storeId=A/);assert.ok(!requests.some(request=>request.url==='/api/admin/account/rate-cards'));assert.equal(doc.querySelector('nav').textContent.includes('Account'),false);
 }finally{await env.close();}
});

test('lazy persistent Rate Cards fetch only for consumers and coalesce concurrent consumers/manual refreshes',async()=>{
 const env=await setup();const requests=[];globalThis.fetch=(url,options={})=>new Promise(resolve=>requests.push({url,options,resolve}));
 function Consumer(){const {catalogStatus,refreshPlans}=useFeePlans();return React.createElement('div',null,React.createElement('output',null,catalogStatus),React.createElement('button',{onClick:()=>{void refreshPlans().catch(()=>{});void refreshPlans().catch(()=>{});}},'Refresh cards'));}
 function Harness(){const [show,setShow]=useState(false);return React.createElement(FeePlansProvider,{persistent:true,deferLoad:true},React.createElement('button',{onClick:()=>setShow(value=>!value)},'Toggle consumers'),show?React.createElement(React.Fragment,null,React.createElement(Consumer),React.createElement(Consumer)):null);}
 const click=async(text)=>act(async()=>[...env.doc.querySelectorAll('button')].find(button=>button.textContent===text).click());
 const deliver=async(index,status=200)=>act(async()=>requests[index].resolve({ok:status===200,json:async()=>status===200?{available:true,plans:[]}:{error:'Unavailable'}}));
 try{
 await act(async()=>env.root.render(React.createElement(Harness)));assert.equal(requests.length,0);
 await click('Toggle consumers');assert.equal(requests.length,1);await deliver(0);assert.deepEqual([...env.doc.querySelectorAll('output')].map(output=>output.textContent),['ready','ready']);
 await click('Toggle consumers');await click('Toggle consumers');assert.equal(requests.length,1);
 await click('Refresh cards');assert.equal(requests.length,2);await deliver(1,503);assert.deepEqual([...env.doc.querySelectorAll('output')].map(output=>output.textContent),['unavailable','unavailable']);
 await click('Refresh cards');assert.equal(requests.length,3);await deliver(2);assert.ok(requests.every(request=>request.url==='/api/admin/account/rate-cards'&&!request.options.method));
 }finally{await env.close();}
});

test('Staging never falls back to production snapshots, sample facts or history/Drive links',async()=>{
 const env=await setup();const {root,doc}=env;const requests=[];
 globalThis.fetch=(url,options={})=>new Promise(resolve=>requests.push({url,options,resolve}));
 const fixture=(snapshot=null,environment='staging')=>({environment,user:{email:'stage@example.test'},access:{role:'client',enabledModules:['overview','orders','health','protection','actions','packages'],clientEnabledModules:['overview','orders','health','protection','actions','packages'],canManagePermissions:false},stores:[{id:'stage-store',name:'Mizino Premium',sourceName:'Mizino Premium',platform:'Shopee MY',contacts:[]}],selectedStoreId:'stage-store',snapshot,adBalance:null,adPerformance:[],actions:[],coFundVouchers:[],productProfile:null});
 const deliver=async(index,data)=>act(async()=>requests[index].resolve({ok:true,status:200,json:async()=>data}));
 const nav=async(name)=>act(async()=>[...doc.querySelectorAll('nav button')].find(button=>button.textContent.endsWith(name)).click());
 const noProductionFacts=()=>assert.doesNotMatch(doc.body.textContent,/54,350.94|18,711.82|120,000|82,080|126,430|260717K3M8Q1|4,286|2152273|2152232/);
 try{
  await act(async()=>root.render(React.createElement(Home)));await deliver(0,fixture());assert.ok(doc.querySelector('[data-environment="staging"]'));await deliver(1,fixture());assert.match(doc.body.textContent,/No Staging snapshot/);noProductionFacts();
  await nav('Orders & Inventory');await deliver(2,fixture());assert.match(doc.body.textContent,/No Staging snapshot/);noProductionFacts();
  await nav('Store Health');await deliver(3,fixture({payload:{},importedAt:'2026-10-28'}));assert.match(doc.body.textContent,/No store health metrics/);noProductionFacts();
  await nav('Fake Seller Reports');await deliver(4,fixture({payload:{},importedAt:'2026-10-28'}));assert.match(doc.body.textContent,/No Staging snapshot/);noProductionFacts();
  await nav('Client Action Center');await deliver(5,fixture());assert.equal(doc.querySelector('.action-list'),null);assert.equal(doc.querySelector('a[href*="drive.google.com"]'),null);noProductionFacts();
  await nav('Overview');await deliver(6,fixture({payload:{overview:[['Stage source','MYR 42.00','']]},importedAt:'2026-10-28'}));assert.match(doc.body.textContent,/MYR 42.00/);assert.match(doc.body.textContent,/暂无数据/);noProductionFacts();
  await nav('Orders & Inventory');await deliver(7,fixture({payload:{orders:[{id:'Stage order',buyer:'Stage buyer',product:'Stage product',time:'10:00',value:'MYR 9.00',expire:'18:00',left:'8h',status:'Urgent'}]},importedAt:'2026-10-28'}));assert.match(doc.body.textContent,/Stage order/);noProductionFacts();
  await nav('Overview');await deliver(8,fixture({payload:{overview:[['Foreign metric','Production value','']]},importedAt:'2026-10-28'},'production'));assert.match(doc.querySelector('[role="alert"]').textContent,/verify this module/);assert.ok(doc.querySelector('[data-environment="staging"]'));assert.doesNotMatch(doc.body.textContent,/Production value/);
  await nav('Packages & Pricing');await waitFor(()=>doc.querySelector('.package-hero'));assert.equal(doc.querySelector('a[href*="1mpB7KVCGzP_9IXYVbhJZsLsndM4ladU3cJre5cfALAA"]'),null);assert.doesNotMatch(doc.querySelector('.package-hero').textContent,/Google Sheet History/);
 }finally{await env.close();}
});

test('an empty Staging store scope shows no-data guidance without a forever module loader',async()=>{
 const env=await setup();let count=0;
 globalThis.fetch=async()=>{count++;return {ok:true,status:200,json:async()=>({environment:'staging',user:{email:'stage@example.test'},access:{role:'client',enabledModules:['overview'],clientEnabledModules:['overview'],canManagePermissions:false},stores:[],selectedStoreId:null,snapshot:null,adBalance:null})};};
 try{await act(async()=>env.root.render(React.createElement(Home)));assert.equal(count,1);assert.match(env.doc.body.textContent,/No stores are available/);assert.doesNotMatch(env.doc.body.textContent,/Loading module|J Packaging|18,711.82/);assert.ok(env.doc.querySelector('[data-environment="staging"]'));}finally{await env.close();}
});

test('fixed Staging entry rejects a bootstrap claiming Production before exposing navigation or records',async()=>{
 const env=await setup('https://shopee-hub-v2-260731-git-cod-e05b8d-shopeehubctg-5199s-projects.vercel.app/');let count=0;
 globalThis.fetch=async()=>{count++;return {ok:true,status:200,json:async()=>({environment:'production',user:{email:'wrong-environment@example.test'},access:{role:'superadmin',enabledModules:['overview'],clientEnabledModules:['overview'],canManagePermissions:true},stores:[{id:'production-store',name:'Production Store',platform:'Shopee MY',contacts:[]}],selectedStoreId:'production-store',snapshot:{payload:{overview:[['Sales','Production value','']]},importedAt:'2026-10-28'},adBalance:null})};};
 try{await act(async()=>env.root.render(React.createElement(Home)));assert.equal(count,1);assert.equal(env.doc.querySelector('nav'),null);assert.match(env.doc.querySelector('[role="alert"]').textContent,/verify the Staging environment/);assert.doesNotMatch(env.doc.body.textContent,/Production value|Production Store|wrong-environment@example.test/);}finally{await env.close();}
});

test('debugLoad emits only opt-in load timings, with cancellation never reported as success and no business values',async()=>{
 const info=console.info;const logs=[];console.info=value=>logs.push(value);
 async function run(debug){
  const env=await setup(`https://local.test/${debug?'?debugLoad=1':''}`);const requests=[];
  globalThis.fetch=(url,options={})=>new Promise(resolve=>requests.push({url,options,resolve}));
  const payload=id=>({environment:'local',user:{email:'private-user@example.test'},access:{role:'client',enabledModules:['overview'],clientEnabledModules:['overview'],canManagePermissions:false},stores:['A','B'].map(id=>({id,name:'Private store '+id,platform:'Shopee MY',contacts:[]})),selectedStoreId:id,snapshot:{payload:{noSample:true,overview:[['Sensitive financial value','PRIVATE-12345','']]},importedAt:'2026-10-28'},adBalance:null});
  const deliver=async(index,id)=>act(async()=>requests[index].resolve({ok:true,status:200,json:async()=>payload(id)}));
  try{
   await act(async()=>env.root.render(React.createElement(Home)));await deliver(0,'A');
   await act(async()=>{const select=env.doc.querySelector('.toolbar select');select.value='B';select.dispatchEvent(new env.dom.window.Event('change',{bubbles:true}));});
   await deliver(2,'B');await deliver(1,'A');
  }finally{await env.close();}
 }
 try{
  await run(false);assert.equal(logs.length,0);
  await run(true);assert.equal(logs.length,3);const timings=logs.map(value=>JSON.parse(value));
  assert.deepEqual(timings.map(item=>[item.requestKind,item.section,item.storeId,item.success,item.cancelled]),[['bootstrap','bootstrap','default',true,false],['module','overview','B',true,false],['module','overview','A',false,true]]);
  for(const timing of timings){assert.equal(timing.event,'dashboard.load');assert.ok(timing.startMs>=0);assert.ok(timing.endMs>=timing.startMs);assert.equal(timing.durationMs,timing.endMs-timing.startMs);}
  assert.doesNotMatch(logs.join(' '),/private-user|Private store|PRIVATE-12345|Sensitive financial|token/i);
 }finally{console.info=info;}
});
