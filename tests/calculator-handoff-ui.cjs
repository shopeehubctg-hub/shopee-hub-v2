const fs=require('fs'),http=require('http'),assert=require('node:assert/strict'),{execFileSync}=require('child_process');
const esbuild=require(process.cwd()+'/node_modules/esbuild');
const{chromium}=require('/Users/layyingchuah/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=process.cwd(),dir=root+'/node_modules/.handoff-browser';fs.mkdirSync(dir,{recursive:true});
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import Home from '${root}/app/page';
window.fetch=async(url,init)=>{const body=String(url).startsWith('/api/dashboard')?{environment:'staging',user:{email:'customer@example.test'},access:{role:'customer',enabledModules:['calculator','packages'],clientEnabledModules:['calculator','packages'],canManagePermissions:false},stores:[{id:'test-store',name:'Test Store',platform:'Shopee MY',contacts:[]}],selectedStoreId:'test-store',snapshot:null,actions:[],adPerformance:[],adBalance:null,productProfile:null,coFundVouchers:[]}:String(url).includes('inventory-skus')?{products:[],canEdit:false}:{packages:[],source:'database',canDelete:false};return new Response(JSON.stringify(body));};createRoot(document.getElementById('root')).render(<Home/>);`;
(async()=>{
 for(const old of[false,true])await esbuild.build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,platform:'browser',jsx:'automatic',outfile:dir+(old?'/old.js':'/app.js'),plugins:old?[{name:'original-handoff',setup(b){b.onLoad({filter:/app\/(page|price-calculator)\.tsx$/},({path})=>({contents:execFileSync('git',['show','origin/main:'+path.slice(root.length+1)],{encoding:'utf8'}),loader:'tsx',resolveDir:root+'/app'}));}}]:[]});
 const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/blocked'))res.setHeader('Content-Security-Policy','sandbox allow-scripts allow-same-origin allow-forms');
  if(req.url.startsWith('/blocked')||req.url.startsWith('/allowed')){res.setHeader('Content-Type','text/html');res.end(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/globals.css"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/${req.url.includes('old=1')?'old':'app'}.js"></script></body></html>`);return;}
  if(req.url==='/tailwindcss'||req.url==='/favicon.ico'){res.end('');return;}
  const file=req.url==='/globals.css'?root+'/app/globals.css':dir+req.url;
  if(!fs.existsSync(file)){res.statusCode=404;res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(file));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,channel:'chrome'});const base='http://127.0.0.1:'+server.address().port;
 try{
  let page=await browser.newPage({viewport:{width:1440,height:960}});
  await page.goto(base+'/blocked?section=calculator&old=1');await page.getByRole('button',{name:'Create All Ready (6)',exact:true}).click();await page.getByRole('button',{name:'Confirm & Continue',exact:true}).click();assert(await page.locator('.price-calculator').isVisible());assert.equal(await page.locator('.package-modal.standalone').count(),0);console.log('REPRODUCED: old UI silently stays in Calculator under browser popup policy');await page.close();
  page=await browser.newPage({viewport:{width:1440,height:960}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/blocked?section=calculator');
  // Ten real calculator rows with distinct prices and quantity, both scenarios.
  for(let i=3;i<10;i++)await page.getByRole('button',{name:'+ Add Package',exact:true}).click();
  const names=page.locator('.dual-package-inputs input').first();
  for(let i=0;i<10;i++){await page.getByLabel(`Package ${String.fromCharCode(65+i)} Meta price`,{exact:true}).fill(String(100+i*10));}
  await page.getByRole('button',{name:'Create All Ready (20)',exact:true}).click();assert(await page.getByRole('dialog').isVisible());const modal=await page.getByRole('dialog').boundingBox();assert(modal.y>=0&&modal.y<960);assert.equal(await page.locator('.calculator-confirm-overlay').evaluate(e=>e.parentElement.tagName),'BODY');await page.getByRole('button',{name:'Confirm & Continue',exact:true}).click();await page.getByText('10 Calculator Packages Remaining',{exact:true}).waitFor();
  const batch=await page.evaluate(()=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('package-draft:')))));
  assert.equal(batch.prefills.length,20);assert.equal(batch.storeId,'test-store');assert.equal(new Set(batch.prefills.map(p=>p.name)).size,10);assert(batch.prefills.every(p=>p.calculatorSettings.pricingGoal==='sameCustomerPrice'));assert.equal(Number(await page.locator('.nonCampaign .market-price-card input').nth(1).inputValue()),100);
  await page.screenshot({path:dir+'/same-tab-handoff.png',fullPage:false});assert.match(page.url(),/section=packages&packageDraft=/);await page.reload();await page.getByText('10 Calculator Packages Remaining',{exact:true}).waitFor();assert.deepEqual(errors,[]);console.log('PASS: blocked popup opens actual package form in same tab; ten packages and twenty price/settings snapshots retained');await page.close();
  page=await browser.newPage();await page.goto(base+'/allowed?section=calculator');await page.getByRole('button',{name:'Create All Ready (6)',exact:true}).click();const popupPromise=page.waitForEvent('popup');await page.getByRole('button',{name:'Confirm & Continue',exact:true}).click();const popup=await popupPromise;await popup.getByText('3 Calculator Packages Remaining',{exact:true}).waitFor();assert.equal(await popup.evaluate(()=>window.opener),null);console.log('PASS: allowed popup restores the scoped batch with a null opener');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
