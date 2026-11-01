import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const compiled=execFileSync('node_modules/.bin/esbuild',['app/account-fx-source.ts','--bundle','--format=esm','--platform=node','--target=node20']);
const {parseBnmServiceRate,bnmServiceRate,parseBnmMarketServiceRate,bnmMarketServiceRate,BNM_MONTHLY_URL}=await import(`data:text/javascript;base64,${compiled.toString('base64')}`);
const csv='date,indicator,SGD,USD\n2026-09-01,end,3.18,4.1\n2026-09-01,avg,3.197,4.12\n2026-12-01,avg,3.21,4.15\n';
test('BNM reads exact service month average, correct SGD quotation and retains evidence',()=>{
 assert.deepEqual(parseBnmServiceRate(csv,'2026-09'),{serviceMonth:'2026-09',rate:'3.197',policy:'bnm-service-average',verified:true,reference:BNM_MONTHLY_URL});
 assert.equal(parseBnmServiceRate(csv,'2026-10'),undefined);
 for(const text of [csv+'2026-09-01,avg,3.19,4.1\n',csv.replace('3.197',''),csv.replace('3.197','0'),csv.replace('3.197','NaN'),csv.replace('SGD','SG'),csv.replace('3.197','-3.197')])assert.equal(parseBnmServiceRate(text,'2026-09'),undefined);
});
test('invoice month resolves prior service month including year boundary; no spot or stale fallback',async()=>{
 const fetcher=async(url,options)=>{assert.equal(url,BNM_MONTHLY_URL);assert.equal(options.redirect,'error');return new Response(csv);};
 assert.equal((await bnmServiceRate('2026-10',fetcher)).rate,'3.197');
 assert.equal((await bnmServiceRate('2027-01',fetcher)).serviceMonth,'2026-12');
 assert.equal(await bnmServiceRate('2026-11',fetcher),undefined);
 assert.equal(await bnmServiceRate('invalid',()=>{throw Error('must not fetch');}),undefined);
});
test('BNM unavailability leaves fees pending instead of breaking Dashboard or guessing rate',async()=>{
 assert.equal(await bnmServiceRate('2026-10',async()=>new Response('unavailable',{status:503})),undefined);
 assert.equal(await bnmServiceRate('2026-10',async()=>{throw Error('timeout');}),undefined);
});

const marketCsv='date,indicator,SGD,THB,PHP\n2026-09-01,high,3.3,0.13,0.07\n2026-09-01,end,3.1,0.12,0.06\n2026-09-01,avg,3.197,0.1225,0.065\n2026-12-01,avg,3.21,0.12345678,0.06000001\n';
test('THB/PHP normalized one-unit monthly averages remain exact strings, never divided by100 or high/end rates',()=>{
 for(const [currency,rate] of [['SGD','3.197'],['THB','0.1225'],['PHP','0.065']])assert.deepEqual(parseBnmMarketServiceRate(marketCsv,'2026-09',currency),{serviceMonth:'2026-09',rate,policy:'bnm-service-average',verified:true,reference:BNM_MONTHLY_URL,currency,quotationUnit:1});
 assert.equal(parseBnmMarketServiceRate(marketCsv,'2026-12','THB').rate,'0.12345678');assert.equal(parseBnmMarketServiceRate(marketCsv,'2026-12','PHP').rate,'0.06000001');
 for(const currency of ['THB','PHP']){assert.equal(parseBnmMarketServiceRate(marketCsv.replace(currency,currency+'100'),'2026-09',currency),undefined);assert.equal(parseBnmMarketServiceRate(marketCsv.replace('avg','missing'),'2026-09',currency),undefined);assert.equal(parseBnmMarketServiceRate(marketCsv,'2026-10',currency),undefined);}
});
test('market parsing fails closed for duplicate averages/headers, missing/illegal amounts or unsupported currencies',()=>{
 for(const currency of ['THB','PHP']){
  const rate=currency==='THB'?'0.1225':'0.065';
  for(const invalid of ['', '0','-0.1','NaN','Infinity','0.123456789',' 0.1'])assert.equal(parseBnmMarketServiceRate(marketCsv.replace(rate,invalid),'2026-09',currency),undefined);
  assert.equal(parseBnmMarketServiceRate(marketCsv+'2026-09-01,avg,3.197,0.1225,0.065\n','2026-09',currency),undefined);
  assert.equal(parseBnmMarketServiceRate(marketCsv.replace('SGD,THB,PHP',`SGD,${currency},${currency}`),'2026-09',currency),undefined);
 }
 assert.equal(parseBnmMarketServiceRate(marketCsv,'2026-09','USD'),undefined);assert.equal(parseBnmMarketServiceRate(marketCsv,'2026-13','THB'),undefined);
});
test('all three currencies share CSV cache and concurrent download, while invoice month always resolves preceding service month',async()=>{
 let calls=0;const fetcher=async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,5));return new Response(marketCsv);};
 const results=await Promise.all(['SGD','THB','PHP'].map(currency=>bnmMarketServiceRate('2026-10',currency,fetcher)));
 assert.equal(calls,1);assert.deepEqual(results.map(result=>result.rate),['3.197','0.1225','0.065']);assert.ok(results.every(result=>result.serviceMonth==='2026-09'&&result.quotationUnit===1));
 assert.equal((await bnmServiceRate('2026-10',fetcher)).rate,'3.197');assert.equal(calls,1);
 assert.equal((await bnmMarketServiceRate('2027-01','PHP',fetcher)).serviceMonth,'2026-12');assert.equal(await bnmMarketServiceRate('2026-11','THB',fetcher),undefined);assert.equal(calls,1);
});
test('market fetching never uses stale rates for missing/future periods and recovers after failed download',async()=>{
 let calls=0;const fetcher=async()=>{calls++;if(calls===1)throw Error('timeout');return new Response(marketCsv);};
 assert.equal(await bnmMarketServiceRate('2026-10','THB',fetcher),undefined);assert.equal((await bnmMarketServiceRate('2026-10','THB',fetcher)).rate,'0.1225');assert.equal(calls,2);
 for(const currency of ['THB','PHP']){assert.equal(await bnmMarketServiceRate('2026-11',currency,fetcher),undefined);assert.equal(await bnmMarketServiceRate('2027-02',currency,fetcher),undefined);assert.equal(await bnmMarketServiceRate('2026-10',currency,async()=>new Response('error',{status:503})),undefined);}
 assert.equal(await bnmMarketServiceRate('invalid','THB',()=>{throw Error('must not fetch');}),undefined);
});
