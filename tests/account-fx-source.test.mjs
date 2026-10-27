import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const compiled=execFileSync('node_modules/.bin/esbuild',['app/account-fx-source.ts','--bundle','--format=esm','--platform=node','--target=node20']);
const {parseBnmServiceRate,bnmServiceRate,BNM_MONTHLY_URL}=await import(`data:text/javascript;base64,${compiled.toString('base64')}`);
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
