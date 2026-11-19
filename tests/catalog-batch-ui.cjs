const fs=require('fs'),http=require('http'),assert=require('assert'),esbuild=require('esbuild'),ExcelJS=require('exceljs');const {chromium}=require('/Users/layyingchuah/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{fs.mkdirSync('node_modules/.catalog-batch-ui',{recursive:true});esbuild.buildSync({entryPoints:['tests/fixtures/catalog-batch-entry.tsx'],bundle:true,outfile:'node_modules/.catalog-batch-ui/ui.js',platform:'browser',jsx:'automatic'});esbuild.buildSync({entryPoints:['app/package-batch-excel.ts'],bundle:true,outfile:'node_modules/.catalog-batch-ui/excel.cjs',platform:'node',packages:'external'});const {downloadBatch}=require('../node_modules/.catalog-batch-ui/excel.cjs');const b=new ExcelJS.Workbook();await b.xlsx.load(await downloadBatch([{name:'Batch Test 1',normal:100,campaign:90,exportId:'11111111-1111-4111-8111-111111111111'},{name:'Batch Test 2',normal:100,campaign:90}],'MY',{storeId:'shopee-berlanco-beauty-official',products:[{sku:'fillerday',name:'Day Cream'},{sku:'fillernight',name:'Night Cream'}]}));for(const tab of ['By Product Name','By SKU']){const s=b.getWorksheet(tab);for(let r=7;r<=8;r++){s.getCell(r,2).value=120;s.getCell(r,6).value='TEST-'+r;s.getCell(r,9).value=tab==='By SKU'?'fillerday':'Day Cream';s.getCell(r,10).value=1;s.getCell(r,12).value=tab==='By SKU'?'fillernight':'Night Cream';s.getCell(r,13).value=2;}}const bytes=Buffer.from(await b.xlsx.writeBuffer());const server=http.createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/ui.css"><style>body{font-family:"Noto Sans",sans-serif;background:#f5f6f8;color:#172033;margin:20px}button,input,select{font:inherit}</style></head><body><div id="root"></div><script src="/ui.js"></script></body></html>');}else{if(req.url==='/favicon.ico'){res.end('');return;}res.setHeader('Content-Type',req.url.endsWith('css')?'text/css':'text/javascript');res.end(fs.readFileSync('node_modules/.catalog-batch-ui'+req.url));}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;try{browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.goto('http://127.0.0.1:'+server.address().port);await verifyDirectEntry(page);
await page.goto('http://127.0.0.1:'+server.address().port);
await page.getByRole('button',{name:'Import Excel',exact:true}).click();await page.getByLabel('Tab You Filled').selectOption('By Product Name');await page.locator('input[type=file]').setInputFiles({name:'batch.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:bytes});await page.getByRole('button',{name:'Set Dates (2)',exact:true}).waitFor();assert.equal(await page.getByText('2 Items',{exact:true}).count(),2);
await page.getByRole('button',{name:'Edit Details',exact:true}).first().click();await page.getByLabel('MY normal Price',{exact:true}).fill('98');await page.getByLabel('Price Change Reason',{exact:true}).waitFor();await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByRole('alert').filter({hasText:'reason'}).waitFor();await page.getByLabel('Price Change Reason',{exact:true}).fill('Customer agreed adjustment');await page.getByRole('button',{name:'Next',exact:true}).click();
await page.getByRole('checkbox',{name:'Select Batch Test 2',exact:true}).uncheck();await page.getByRole('button',{name:'Set Dates (1)',exact:true}).click();await page.getByLabel('Add Campaign Month',{exact:true}).fill('2026-11');await page.getByText('Double Day',{exact:true}).click();await page.getByRole('button',{name:'Apply Dates to 1 Package',exact:true}).click();assert.equal(await page.getByText('Dates Not Set',{exact:true}).count(),1);await page.getByRole('checkbox',{name:'Select Batch Test 1',exact:true}).uncheck();await page.getByRole('checkbox',{name:'Select Batch Test 2',exact:true}).check();await page.getByRole('button',{name:'Set Dates (1)',exact:true}).click();await page.getByLabel('Add Campaign Month',{exact:true}).fill('2026-11');await page.getByText('Payday',{exact:true}).click();await page.getByRole('button',{name:'Continue to Final Preview',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Edit Package',exact:true}).count(),2);const cards=page.locator('.batch-preview-card');assert.match(await cards.nth(0).innerText(),/Double Day/);assert.doesNotMatch(await cards.nth(0).innerText(),/Payday/);assert.match(await cards.nth(1).innerText(),/Payday/);await page.getByText('Calculator Settings · Price Adjusted',{exact:true}).click();await page.getByText('Price Change Reason: Customer agreed adjustment',{exact:true}).waitFor();await page.screenshot({path:'/tmp/catalog-batch-final-desktop.png'});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/catalog-batch-final-mobile.png'});await page.getByRole('button',{name:'Create 2 Packages',exact:true}).click();await page.waitForFunction(()=>window.exitMessage);const posts=await page.evaluate(()=>window.posts);assert.equal(posts.length,2);assert.equal(posts[0].components[0].name,'Day Cream');assert.equal(posts[0].components.length,2);assert.equal(posts[0].priceAdjustmentReason,'Customer agreed adjustment');assert.equal(posts[0].exportId,'11111111-1111-4111-8111-111111111111');assert.equal(posts[1].exportId,undefined);assert.deepEqual(errors,[]);console.log('PASS: two-tab workbook upload, mapped product names, linked Calculator settings, reason validation, selected-only dates, final preview and batch payload/return.');}catch(e){console.error(e);process.exitCode=1;}finally{if(browser)await browser.close();server.close();}})();

async function verifyDirectEntry(page) {
  const button = name => page.getByRole('button', {name, exact:true});
  assert.equal(await page.getByLabel('Inventory entry').inputValue(), 'product');
  const input = page.getByRole('textbox', {name:'Row 1 · Package · Package Name', exact:true});
  await input.waitFor();
  const values = [
    ['Grid A',120,100,90,95,'00001','','','Day Cream',2],
    ['Grid B',200,180,160,170,'00001','','','Night Cream',3],
  ];
  await input.evaluate((el, text) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain',text);
    el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData}));
  }, values.map(row=>row.join('\t')).join('\r\n'));
  await button('Review Packages').click();
  const secondSku = page.getByLabel('Row 2 · Platform SKUs · Shopee SKU',{exact:true});
  assert.equal(await secondSku.getAttribute('aria-invalid'),'true');
  await secondSku.fill('00002');
  await secondSku.press('Enter');
  assert.equal(await page.locator(':focus').getAttribute('aria-label'),'Row 3 · Platform SKUs · Shopee SKU');
  await button('Import Excel').click();
  await button('Enter in Dashboard').click();
  assert.equal(await secondSku.inputValue(),'00002');
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1));
  await page.setViewportSize({width:1440,height:1000});
  await button('Review Packages').click();
  await button('Set Dates (2)').click();
  await page.getByLabel('Selected Package Pricing',{exact:true}).selectOption('uniform');
  await page.getByLabel('Selected Whole-month Price From',{exact:true}).selectOption('normal_16_end');
  await page.getByLabel('Add Normal Month',{exact:true}).fill('2026-11');
  await button('Continue to Final Preview').click();
  await button('Create 2 Packages').click();
  await page.waitForFunction(()=>window.exitMessage);
  const posts = await page.evaluate(()=>window.posts);
  assert.deepEqual(posts.map(pkg=>pkg.platforms[0].packageSku),['00001','00002']);
  assert.deepEqual(posts.map(pkg=>pkg.components[0].inventorySku),['fillerday','fillernight']);
  assert.deepEqual(posts.map(pkg=>pkg.components[0].quantity),[2,3]);
  assert.deepEqual(posts.map(pkg=>Number(pkg.priceSchedules[0].sellingPrice)),[95,170]);
  console.log('PASS: direct By Product multi-row paste, duplicate correction, keyboard entry, Excel switching, mobile layout, dates, preview and save payload.');
}
