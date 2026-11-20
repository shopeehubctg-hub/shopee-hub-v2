const fs=require('fs'),http=require('http'),assert=require('assert'),esbuild=require('esbuild');const {chromium}=require('/Users/layyingchuah/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{fs.mkdirSync('node_modules/.catalog-batch-ui',{recursive:true});esbuild.buildSync({entryPoints:['tests/fixtures/catalog-batch-entry.tsx'],bundle:true,outfile:'node_modules/.catalog-batch-ui/ui.js',platform:'browser',jsx:'automatic'});const server=http.createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/ui.css"><style>body{font-family:"Noto Sans",sans-serif;background:#f5f6f8;color:#172033;margin:20px}button,input,select{font:inherit}</style></head><body><div id="root"></div><script src="/ui.js"></script></body></html>');}else{if(req.url==='/favicon.ico'){res.end('');return;}res.setHeader('Content-Type',req.url.endsWith('css')?'text/css':'text/javascript');res.end(fs.readFileSync('node_modules/.catalog-batch-ui'+req.url));}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;try{browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.goto('http://127.0.0.1:'+server.address().port);await verifyDirectEntry(page);await page.goto('http://127.0.0.1:'+server.address().port);await verifyOnePackage(page);assert.deepEqual(errors,[]);}catch(e){console.error(e);process.exitCode=1;}finally{if(browser)await browser.close();server.close();}})();

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
  assert.equal(await page.getByRole('button',{name:/Import Excel|Enter in Dashboard|Upload Excel|Download Blank Template/}).count(),0);
  assert.equal(await page.locator('input[type=file]').count(),0);
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
  console.log('PASS: direct By Product multi-row paste, duplicate correction, keyboard entry, mobile layout, dates, preview and save payload.');
}

async function verifyOnePackage(page) {
  const button = name => page.getByRole('button',{name,exact:true});
  const first = page.getByLabel('Row 1 · Package · Package Name',{exact:true});
  await first.fill('One package');
  for (const [field,value] of Object.entries({'MY · RM · Original Price':'150','MY · RM · Normal · 1st–15th':'100','MY · RM · Campaign Day':'90','MY · RM · Normal · 16th–End':'95','Platform SKUs · Shopee SKU':'001','Inventory item 1 · Inventory SKU':'fillerday','Inventory item 1 · Qty':'1'})) {
    await page.getByLabel('Row 1 · '+field,{exact:true}).fill(value);
  }
  const firstListing = page.getByLabel('Row 1 · Platform SKUs · Shopee SKU',{exact:true});
  const cell = firstListing.locator('..').locator('..').locator('..');
  await cell.getByRole('button',{name:/Add Shopee listing/}).click();
  const secondListing = page.getByLabel('Row 1 · Platform SKUs · Shopee SKU · Listing 2',{exact:true});
  assert.equal(await secondListing.evaluate(el=>el===document.activeElement),true);
  await secondListing.fill('001');
  assert.equal(await firstListing.getAttribute('aria-invalid'),'true');
  assert.equal(await secondListing.getAttribute('aria-invalid'),'true');
  await secondListing.evaluate(el=>{
    const data=new DataTransfer();
    data.setData('text/plain','SP-002\r\nSP-003');
    el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));
  });
  const thirdListing = page.getByLabel('Row 1 · Platform SKUs · Shopee SKU · Listing 3',{exact:true});
  assert.equal(await thirdListing.inputValue(),'SP-003');
  await cell.getByRole('button',{name:/Remove .*listing 3$/}).click();
  assert.equal(await thirdListing.count(),0);
  await button('Review Packages').click();
  await page.getByText('Shopee: 001 · SP-002',{exact:true}).waitFor();
  await button('Edit Details').click();
  await page.getByLabel('Shopee SKU · Listing 2',{exact:true}).fill('SP-002B');
  await button('Edit Details').click();
  await button('Set Dates (1)').click();
  const month=page.getByLabel('Add Campaign Month',{exact:true});
  await month.fill('2026-11');
  await page.getByText('Double Day',{exact:true}).click();
  await button('Continue to Final Preview').click();
  await page.getByRole('heading',{name:'1 Package · Final Preview'}).waitFor();
  await button('Create 1 Package').click();
  await page.waitForFunction(()=>window.exitMessage);
  const posts=await page.evaluate(()=>window.posts);
  assert.equal(posts.length,1);
  assert.deepEqual(posts[0].platforms,[{platform:'Shopee',packageSku:'001'},{platform:'Shopee',packageSku:'SP-002B'}]);
  assert.equal(posts[0].components.length,1);
  console.log('PASS: single filled row follows the same dashboard editor through final preview and submission.');
}
