import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, {act} from 'react';

const dir=new URL('../node_modules/.package-end-test/',import.meta.url);
await mkdir(dir,{recursive:true});
await build({entryPoints:[new URL('../app/package-control.tsx',import.meta.url).pathname],outfile:new URL('ui.mjs',dir).pathname,bundle:true,format:'esm',platform:'browser',jsx:'automatic',packages:'external',logLevel:'silent'});
const {PackageControl}=await import(new URL('ui.mjs',dir));

test('only Active cards show End Package; cancelling does nothing and confirming moves it to Expired',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'https://local.test'});
  const globals={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,MouseEvent:dom.window.MouseEvent};
  const keys=[...Object.keys(globals),'fetch','IS_REACT_ACT_ENVIRONMENT'];
  const prior=Object.fromEntries(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  Object.entries(globals).forEach(([k,value])=>Object.defineProperty(globalThis,k,{configurable:true,writable:true,value}));
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  let allow=false,ended=false;
  const requests=[];
  dom.window.confirm=()=>allow;
  const item=(id,status)=>({id,name:id,storeId:'store',packageSku:id,market:'MY',status,version:1,promotionType:'custom',originalPrice:10000,sellingPrice:9000,effectiveFrom:'2026-01-01',effectiveTo:null,components:[],platforms:[{platform:'Shopee',packageSku:id}],sheetSyncStatus:'synced',history:[]});
  globalThis.fetch=async(_url,options={})=>{
    if(options.method==='PATCH'){
      requests.push(JSON.parse(options.body));ended=true;
      return {ok:true,json:async()=>({ok:true,status:'expired',endedDate:'2026-10-26',version:2})};
    }
    return {ok:true,json:async()=>({source:'database',packages:[item('Active Package',ended?'expired':'active'),item('Expired Package','expired'),item('Scheduled Package','scheduled'),item('Draft Package','draft')]})};
  };
  const {createRoot}=await import('react-dom/client');
  const root=createRoot(dom.window.document.getElementById('root'));
  try{
    await act(async()=>root.render(React.createElement(PackageControl,{storeId:'store',storeName:'Store'})));
    const buttons=()=>[...dom.window.document.querySelectorAll('button')];
    assert.equal(buttons().filter(b=>b.textContent==='End Package').length,1);
    await act(async()=>buttons().find(b=>b.textContent==='End Package').click());
    assert.equal(requests.length,0);
    allow=true;
    await act(async()=>buttons().find(b=>b.textContent==='End Package').click());
    assert.deepEqual(requests,[{packageId:'Active Package',action:'end',expectedVersion:1}]);
    assert.equal(dom.window.document.querySelector('.package-controls button.active').textContent,'Expired');
    assert.equal(buttons().filter(b=>b.textContent==='End Package').length,0);
    assert.match(dom.window.document.querySelector('.package-message').textContent,/Moved to Expired/);
  }finally{
    await act(async()=>root.unmount());dom.window.close();
    keys.forEach(k=>{if(prior[k])Object.defineProperty(globalThis,k,prior[k]);else delete globalThis[k];});
  }
});
