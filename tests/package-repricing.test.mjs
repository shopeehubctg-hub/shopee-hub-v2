import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const output=await build({entryPoints:['app/package-repricing.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {repricedState,replacementEvidence,eligibleRepriceTarget}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
const prices=[
 {market:'MY',currency:'MYR',priceType:'non_campaign',originalPrice:30000,sellingPrice:20000,effectiveFrom:'2026-11-01',effectiveTo:null},
 {market:'MY',currency:'MYR',priceType:'campaign',originalPrice:30000,sellingPrice:19000,effectiveFrom:'2026-11-09',effectiveTo:'2026-11-11'},
 {market:'MY',currency:'MYR',priceType:'campaign',originalPrice:30000,sellingPrice:18000,effectiveFrom:'2026-12-10',effectiveTo:'2026-12-12'},
 ...['SG','TH','PH'].map(market=>({market,currency:({SG:'SGD',TH:'THB',PH:'PHP'})[market],priceType:'campaign',originalPrice:30000,sellingPrice:19000,effectiveFrom:'2026-11-01',effectiveTo:null})),
 {market:'MY',currency:'SGD',priceType:'non_campaign',originalPrice:10000,sellingPrice:5000,effectiveFrom:'2026-11-01',effectiveTo:null},
];
const setting={_samePricing:false,_recurringCampaign:{effectiveFrom:'2026-11-01',effectiveTo:null,events:[{id:'dday',daysBefore:2,daysAfter:0,prices:{MY:{originalPrice:300,sellingPrice:190},SG:{originalPrice:90,sellingPrice:60}}}]}};
test('only selected MY types change; all periods, originals and legacy foreign-currency rows remain exact',()=>{
 const copy=structuredClone(prices),settings=structuredClone(setting);
 const next=repricedState(prices,setting,['non_campaign'],{normal:210,campaign:220});
 assert.equal(next.prices[0].sellingPrice,21000);
 assert.deepEqual(next.prices.slice(1),prices.slice(1));assert.deepEqual(next.recurring,setting._recurringCampaign);
 assert.deepEqual(prices,copy);assert.deepEqual(setting,settings);
 const both=repricedState(prices,setting,['non_campaign','campaign'],{normal:210,campaign:220});
 for(let i=0;i<3;i++)assert.deepEqual(both.prices[i],{...prices[i],sellingPrice:i===0?21000:22000});
 assert.deepEqual(both.prices.slice(3),prices.slice(3));assert.equal(both.recurring.events[0].prices.MY.sellingPrice,220);assert.deepEqual(both.recurring.events[0].prices.SG,setting._recurringCampaign.events[0].prices.SG);
});
test('no new periods; positive amounts/original-price bounds and distinct types enforced',()=>{
 for(const types of [[],['campaign','campaign'],['other']])assert.throws(()=>repricedState(prices,null,types,{normal:200,campaign:200}));
 for(const normal of [0,-1,NaN,Infinity,301])assert.throws(()=>repricedState(prices,null,['non_campaign'],{normal,campaign:200}));
 assert.throws(()=>repricedState(prices.filter(p=>p.priceType!=='campaign'),null,['campaign'],{normal:200,campaign:200}),/no saved period/);
 const changed=structuredClone(setting);changed._recurringCampaign.events[0].prices.MY.originalPrice=100;assert.throws(()=>repricedState(prices,changed,['campaign'],{normal:200,campaign:200}),/event Original/);
});
const snapshot=(scenario,price)=>({source:'Shopee Pricing Calculator',packageName:'Same Name',category:'Beauty',serviceScenario:scenario,facebookPrice:150,suggestedShopeePrice:price,commissionRate:16.2,serviceRate:5.94,actualPayout:100});
test('partial update keeps prior Campaign inputs, reference and manual-adjustment reason',async()=>{
 const oldCampaign=snapshot('Campaign Day',190),oldNormal=snapshot('Non-Campaign Day',200);
 const old={scenarios:[oldNormal,oldCampaign],_pricingEvidence:{source:'Calculator',exportId:'old',recordedBy:'original@example.test',recordedAt:'2026-11-01T00:00:00Z',originalPrices:{MY:{normal:200,campaign:185}},scenarios:[oldNormal,oldCampaign],adjustmentReason:'Existing Campaign manual rounding'}};
 const fresh=[snapshot('Non-Campaign Day',210),snapshot('Campaign Day',220)];
 const next=replacementEvidence(old,fresh,['non_campaign'],{id:'new',createdAt:'2026-11-03T00:00:00Z',actor:'current@example.test',normal:210,campaign:220},repricedState(prices,setting,['non_campaign'],{normal:210,campaign:220}).prices,'current@example.test');
 assert.deepEqual(next.scenarios.find(s=>s.serviceScenario==='Campaign Day'),oldCampaign);assert.equal(next.scenarioReferences.campaign.exportId,'old');assert.equal(next.scenarioReferences.non_campaign.exportId,'new');assert.equal(next.originalPrices.MY.campaign,185);assert.equal(next.adjustmentReason,old._pricingEvidence.adjustmentReason);
 const bundle=await build({entryPoints:['app/api/packages/pricing-evidence.ts'],bundle:true,write:false,platform:'node',format:'esm',packages:'external'});
 // Resolve imports through a workspace output file to exercise the actual ordinary-edit resolver.
 const {mkdir,writeFile}=await import('node:fs/promises');await mkdir('node_modules/.reprice-tests',{recursive:true});await writeFile('node_modules/.reprice-tests/evidence.mjs',bundle.outputFiles[0].text);
 const {resolvePricingEvidence}=await import('../node_modules/.reprice-tests/evidence.mjs');
 const db={execute:async()=>[{id:'11111111-1111-4111-8111-111111111111',actor:'current@example.test',created_at:'2026-11-03T00:00:00Z',payload:{normal:210,campaign:220,scenarios:fresh}}]};
 const persisted={...next,exportId:'11111111-1111-4111-8111-111111111111'};
 const afterEdit=await resolvePricingEvidence(db,{tenantId:'t',storeId:'s',actor:'current@example.test'},{},next.finalPrices.map(p=>({...p,sellingPrice:Math.round(p.sellingPrice*100),originalPrice:Math.round(p.originalPrice*100)})),{scenarios:next.scenarios,_pricingEvidence:persisted});
 assert.deepEqual(afterEdit.scenarios,next.scenarios);assert.deepEqual(afterEdit.scenarioReferences,next.scenarioReferences);assert.equal(afterEdit.originalPrices.MY.campaign,185);
 await assert.rejects(()=>resolvePricingEvidence(db,{tenantId:'t',storeId:'s',actor:'actor'},{exportId:'22222222-2222-4222-8222-222222222222'},[],{_pricingEvidence:persisted}),/cannot be replaced/);
});
test('eligibility excludes ended/draft/pending/non-MY packages',()=>{
 const base={status:'active',sheetSyncStatus:'synced',priceSchedules:[{market:'MY'}]};assert.equal(eligibleRepriceTarget(base),true);
 for(const patch of [{status:'expired'},{status:'draft'},{status:'review'},{pendingVersion:2},{sheetSyncStatus:'pending'},{priceSchedules:[{market:'SG'}]}])assert.ok(!eligibleRepriceTarget({...base,...patch}));
});
