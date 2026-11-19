const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const esbuild = require('esbuild');
const {chromium} = require(process.env.PLAYWRIGHT_PATH || '/Users/layyingchuah/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

async function run() {
  const dir = 'node_modules/.handoff-browser';
  fs.mkdirSync(dir,{recursive:true});
  await esbuild.build({stdin:{contents:"import React from 'react';import {createRoot} from 'react-dom/client';import Home from './app/page';createRoot(document.getElementById('root')).render(<Home/>);",loader:'tsx',resolveDir:process.cwd()},bundle:true,platform:'browser',jsx:'automatic',outfile:dir+'/app.js'});
  const server = http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/') {
      res.setHeader('Content-Type','text/html');
      res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/globals.css"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>');
    } else if(['/globals.css','/app.js','/app.css'].includes(url.pathname)) {
      res.setHeader('Content-Type',url.pathname.endsWith('.js')?'text/javascript':'text/css');
      res.end(fs.readFileSync(url.pathname==='/globals.css'?'app/globals.css':path.join(dir,url.pathname.slice(1))));
    } else {res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser=await chromium.launch({channel:'chrome',headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:960}});
    const errors=[],posts=[],captures=[],snapshots=new Map();
    let failFirstReview=true;
    page.on('pageerror',e=>errors.push(e.message));
    page.on('dialog',dialog=>dialog.accept());
    await page.route('**/api/**',async route=>{
      const req=route.request(),endpoint=new URL(req.url()).pathname,body=req.postDataJSON();
      const send=(json,status=200)=>route.fulfill({status,json});
      if(endpoint==='/api/dashboard')return send({environment:'staging',user:{email:'customer@example.test'},access:{role:'customer',enabledModules:['calculator','packages'],clientEnabledModules:['calculator','packages']},stores:[{id:'store-a',name:'Store A',platform:'Shopee MY',contacts:[]}],selectedStoreId:'store-a',snapshot:null,actions:[],adPerformance:[],platformVoucher:{early:10,campaign:20,late:6},coFundVouchers:[]});
      if(endpoint==='/api/inventory-skus')return send({products:[{name:'Day Cream',sku:'INV01'},{name:'Night Cream',sku:'00002'},{name:'Night Cream',sku:'00003'}]});
      if(endpoint==='/api/calculator-exports') {
        assert.equal(body.storeId,'store-a');captures.push(body.rows);
        const rows=body.rows.map(entry=>{
          assert.equal(entry.scenarios.length,3);
          const prices=entry.scenarios.map(s=>Number(s.suggestedShopeePrice.toFixed(2)));
          const value={...entry,id:entry.requestId,normal:prices[0],campaign:prices[1],normalLate:prices[2],pricingMode:'split_normal'};
          snapshots.set(value.id,value);return value;
        });
        return send({storeId:body.storeId,rows});
      }
      if(endpoint==='/api/package-batch-review'){
        if(failFirstReview){failFirstReview=false;return send({error:'Review temporarily unavailable'},503);}
        return send({rows:body.rows.map(row=>({...row,exportSnapshot:snapshots.get(row.exportId)}))});
      }
      if(endpoint==='/api/packages'&&req.method()==='POST'){posts.push(body);return send({ok:true,packageId:body.clientRequestId});}
      return send({packages:[],source:'database',canDelete:false});
    });
    const button=name=>page.getByRole('button',{name,exact:true});
    const cell=(row,label)=>page.getByLabel('Row '+row+' · '+label,{exact:true});
    await page.goto('http://127.0.0.1:'+server.address().port+'/?section=calculator');
    await page.getByLabel('Package B main product quantity',{exact:true}).fill('3');
    for(const id of [1,2])await page.getByLabel('Select Calculator package '+id,{exact:true}).check();
    await button('Create Selected Packages (2)').click();
    await cell(2,'Package · Package Name').waitFor();
    assert.equal(await page.getByLabel('Inventory entry').inputValue(),'product');
    assert.equal(await cell(2,'Inventory item 1 · Qty').inputValue(),'3');
    assert.equal(await page.getByText('Import Excel',{exact:true}).count(),0);
    assert.equal(await page.locator('input[type=file]').count(),0);
    const inv=(row,slot,field)=>cell(row,'Inventory item '+slot+' · '+field);
    assert.equal(await page.getByRole('columnheader',{name:/^Inventory item /}).count(),20);
    await button('Product Library').click();
    const library=page.getByRole('listbox',{name:'Product Library',exact:true});
    await library.waitFor();
    assert.equal(await library.getByRole('option').count(),3);
    await inv(1,1,'Product Name').fill('0000');
    assert.equal(await library.getByRole('option').count(),2);
    await page.getByRole('option',{name:'Night Cream 00003'}).click();
    assert.equal(await inv(1,1,'Product Name').inputValue(),'Night Cream');
    assert.equal(await inv(1,1,'Inventory SKU').inputValue(),'00003');
    await page.getByLabel('Columns to add').fill('5');
    await button('Add columns').click();
    assert.equal(await page.getByRole('columnheader',{name:/^Inventory item /}).count(),25);
    await inv(1,21,'Inventory SKU').fill('Night Cream');
    await inv(1,21,'Inventory SKU').press('ArrowDown');
    await inv(1,21,'Inventory SKU').press('Enter');
    assert.equal(await inv(1,21,'Inventory SKU').inputValue(),'00002');
    assert.equal(await inv(1,21,'Product Name').inputValue(),'Night Cream');
    await inv(1,21,'Qty').fill('4');
    const price=(row,label)=>cell(row,'MY · RM · '+label);
    assert.equal(await price(1,'Normal · 1st–15th').inputValue(),'321.11');
    assert.equal(await price(1,'Campaign Day').inputValue(),'361.25');
    assert.equal(await price(1,'Normal · 16th–End').inputValue(),'307.45');
    const original = price(1,'Original Price');
    const warning = page.locator('#grid-original-0-MY');
    await original.fill('200');
    assert.equal(await warning.textContent(),'Original Price must be at least RM361.25 (Campaign Day).');
    assert.equal(await original.getAttribute('aria-invalid'),'true');
    await original.fill('361.25');
    assert.equal(await warning.count(),0);
    await original.fill('200');
    await price(2,'Original Price').fill('700.20');
    await price(2,'Normal · 1st–15th').fill('406.03');
    await price(2,'Campaign Day').fill('444.50');
    await button('Round to nearest RM').click();
    assert.equal(await original.inputValue(),'200');
    assert.equal(await warning.textContent(),'Original Price must be at least RM361 (Campaign Day).');
    assert.equal(await price(2,'Original Price').inputValue(),'700.20');
    assert.equal(await price(1,'Normal · 1st–15th').inputValue(),'321');
    assert.equal(await price(1,'Campaign Day').inputValue(),'361');
    assert.equal(await price(2,'Normal · 1st–15th').inputValue(),'406');
    assert.equal(await price(2,'Campaign Day').inputValue(),'445');
    assert.equal(await page.getByLabel(/price change reason/i).count(),0);
    assert(await button('Round to nearest RM').isDisabled());
    await original.fill('600');
    assert.equal(await warning.count(),0);
    await price(1,'Campaign Day').fill('355');
    await cell(1,'Platform SKUs · Shopee SKU').evaluate((el)=>{
      const data=new DataTransfer();
      data.setData('text/plain','00012\t\t\tDay Cream\t2\n00023\t\t\tDay Cream\t3');
      el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));
    });
    assert.equal(await inv(1,1,'Inventory SKU').inputValue(),'INV01');
    // Fill items 2 through 20, so 21 actual components pass review and reach the save request.
    await inv(1,2,'Product Name').evaluate(el=>{
      const data=new DataTransfer();
      data.setData('text/plain',Array.from({length:19},(_,i)=>['Gift '+i,'1','GIFT'+i].join('\t')).join('\t'));
      el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));
    });
    const addProduct = button('+ Add New Product');
    const productForm = page.getByRole('dialog',{name:'Add New Product'});
    await inv(1,2,'Product Name').fill('Travel Gift');
    await addProduct.click();
    assert.equal(await productForm.getByLabel('Product Name').inputValue(),'Travel Gift');
    await productForm.getByLabel('Inventory SKU').fill('INV01');
    await productForm.getByRole('alert').waitFor();
    assert(await button('Add to Item').isDisabled());
    await productForm.getByLabel('Inventory SKU').fill('000040');
    await button('Add to Item').click();
    assert(await inv(1,2,'Qty').evaluate(el=>el===document.activeElement));
    assert.equal(await inv(1,2,'Qty').inputValue(),'1');
    assert.equal(await inv(1,3,'Inventory SKU').inputValue(),'GIFT1');

    await page.getByLabel('Inventory entry').selectOption('sku');
    await inv(2,2,'Inventory SKU').fill('000050');
    await inv(2,2,'Inventory SKU').press('Tab');
    assert(await addProduct.evaluate(el=>el===document.activeElement));
    await addProduct.press('Enter');
    assert.equal(await productForm.getByLabel('Inventory SKU').inputValue(),'000050');
    assert(await productForm.getByLabel('Product Name').evaluate(el=>el===document.activeElement));
    await productForm.getByLabel('Product Name').fill('Discard this change');
    await button('Cancel').click();
    assert.equal(await inv(2,2,'Product Name').inputValue(),'');
    assert.equal(await inv(2,2,'Inventory SKU').inputValue(),'000050');
    await inv(2,2,'Inventory SKU').fill('000051');
    await addProduct.click();
    await productForm.getByLabel('Product Name').fill('New Night Gift');
    await button('Add to Item').click();
    await inv(2,2,'Qty').fill('2');
    await page.reload();
    assert.equal(await inv(2,2,'Product Name').inputValue(),'New Night Gift');
    assert.equal(await cell(2,'Platform SKUs · Shopee SKU').inputValue(),'00023');
    await button('Review Packages').click();
    await page.getByText('Review temporarily unavailable').waitFor();
    await button('Review Packages').click();
    await button('Edit Details').first().click();
    const editor=page.locator('.batch-editor');
    await editor.getByLabel('MY normal Price',{exact:true}).fill('320.25');
    assert.equal(await editor.getByLabel(/price change reason/i).count(),0);
    await button('Next').click();
    await button('Set Dates (2)').click();
    assert.deepEqual(captures[0],captures[1]);
    await page.getByLabel('Add Campaign Month',{exact:true}).fill('2026-11');
    await page.getByText('Double Day',{exact:true}).click();
    await button('Apply Dates to 2 Packages').click();
    await button('Continue to Final Preview').click();
    await page.reload();await button('Create 2 Packages').waitFor();
    assert.equal(posts.length,0);
    await page.setViewportSize({width:390,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await button('Create 2 Packages').click();
    await page.getByText('2 Packages Created · 0 Saved as Draft',{exact:true}).waitFor();
    assert.equal(posts.length,2);
    assert.equal(posts[0].components.length,21);
    assert.deepEqual(posts[0].components[1],{inventorySku:'000040',name:'Travel Gift',quantity:1,kind:'product'});
    assert.deepEqual(posts[1].components[1],{inventorySku:'000051',name:'New Night Gift',quantity:2,kind:'product'});
    assert.deepEqual(posts[0].components[20],{inventorySku:'00002',name:'Night Cream',quantity:4,kind:'product'});
    assert.deepEqual(posts.map(p=>p.name),['Package A','Package B']);
    assert.deepEqual(posts.map(p=>p.platforms[0].packageSku),['00012','00023']);
    assert.deepEqual(posts.map(p=>p.components[0].quantity),[2,3]);
    assert(posts.every(p=>p.components[0].inventorySku==='INV01'&&snapshots.has(p.exportId)&&p.storeId==='store-a'));
    assert(posts.every(p=>p.priceAdjustmentReason===undefined && p.calculatorEntryId===snapshots.get(p.exportId).requestId));
    assert.equal(posts[0].priceSchedules.find(p=>p.priceType==='campaign').sellingPrice,355);
    assert.equal(posts[0].normalMonthlyRule.prices.MY.late.sellingPrice,307);
    assert.deepEqual(errors,[]);
    console.log('PASS Calculator → selected rows → editable By Product table → multi-row paste → refresh → retry → dates → final preview → package submission and list.');
  }finally{if(browser)await browser.close();server.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
