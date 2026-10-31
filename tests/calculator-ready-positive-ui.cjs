const fs=require('fs'),http=require('http'),assert=require('node:assert/strict'),esbuild=require('esbuild');
const {chromium}=require('/Users/layyingchuah/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const dir='node_modules/.calculator-ready-positive';fs.mkdirSync(dir,{recursive:true});
 await esbuild.build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{PriceCalculator}from './app/price-calculator';createRoot(document.getElementById('root')).render(<PriceCalculator storeId="test-store" storeName="Test Store"/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'browser',jsx:'automatic',outfile:dir+'/app.js'});
 const server=http.createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<html><body><div id="root"></div><script src="/app.js"></script></body></html>');}else if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(dir+'/app.js'));}else res.end('');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
 await page.getByLabel('Package C Meta price',{exact:true}).fill('0');await page.getByRole('button',{name:'Create All Ready (4)',exact:true}).first().click();assert.equal(await page.locator('.calculator-confirm-modal tbody tr').count(),4);assert.equal(await page.locator('.calculator-confirm-modal tbody').getByText('Package C',{exact:true}).count(),0);
 await page.getByRole('button',{name:'Back to Edit',exact:true}).click();await page.getByLabel('Package A Meta price',{exact:true}).fill('0');await page.getByLabel('Package B Meta price',{exact:true}).fill('0');assert(await page.getByRole('button',{name:'Create All Ready (0)',exact:true}).first().isDisabled());
 console.log('PASS: zero-price rows excluded from create/export eligibility; all-zero batch disabled.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
