import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
async function load(file){const compiled=execFileSync('node_modules/.bin/esbuild',[file,'--bundle','--format=esm','--platform=node','--target=node20']);return import(`data:text/javascript;base64,${compiled.toString('base64')}`);}
const {emptyAccountSetup,availableAccountRateCards,selectAccountRateCard,resetAccountSetupSelection,changeAccountSetupMonth,accountSetupPayload}=await load('app/store-account-setup-model.ts');
const {seedFeePlans,archiveRateCard}=await load('app/fee-plan-model.ts');const plans=seedFeePlans();
const initial=()=>({...emptyAccountSetup(),legalEntity:'Example entity',effectiveMonth:'2026-10',clientType:'Internal'});
const payload=(draft,market='MY',cards=plans)=>accountSetupPayload(draft,market,cards,'2026-10');
test('selection uses shared active month-effective MYR cards and source rule cap; payload v2 snapshots exact version',()=>{
 const draft=selectAccountRateCard(initial(),'internal-new',plans);const result=payload(draft);assert.equal(result.version,2);assert.deepEqual(result.rateCard,{id:'internal-new',version:1});assert.equal(result.feeRule.currency,'MYR');assert.equal(result.feeRule.tiers[4].cap,'4000.00');assert.equal(result.feeRule.tiers[3].cap,undefined);assert.equal(result.inputCurrency,'MYR');assert.equal(result.billingCurrency,'MYR');assert.equal(result.fxPolicy,'none');
 draft.tiers[4].cap='1';assert.equal(payload(draft).feeRule.tiers[4].cap,'4000.00');assert.equal(plans.find(p=>p.id==='internal-new').rule.tiers[4].cap,'4000');
});
test('client type or market switch clears incompatible cards and FX while preserving company and invoice month',()=>{
 const selected=selectAccountRateCard(initial(),'internal-new',plans);const sg=resetAccountSetupSelection(selected,'SG');assert.equal(sg.legalEntity,selected.legalEntity);assert.equal(sg.effectiveMonth,selected.effectiveMonth);assert.equal(sg.planId,'');assert.equal(sg.planVersion,null);assert.equal(sg.fxPolicy,'fixed');
 const external=resetAccountSetupSelection(sg,'SG','External');assert.equal(external.fxPolicy,'');assert.equal(external.planId,'');assert.ok(availableAccountRateCards(plans,external).every(card=>card.clientType==='External'&&card.currency==='MYR'));
 assert.equal(selectAccountRateCard(external,'internal-new',plans).planId,'');assert.equal(resetAccountSetupSelection({...external,fxPolicy:'bnm-service-average'},'MY').fxPolicy,'');
});
test('SG Internal bills MYR using fixed3.2; External requires explicit fixed or service-period BNM with no inference',()=>{
 const internal=selectAccountRateCard(initial(),'internal-new',plans);const result=payload(internal,'SG');assert.equal(result.inputCurrency,'SGD');assert.equal(result.billingCurrency,'MYR');assert.equal(result.feeRule.currency,'MYR');assert.equal(result.fxRate,'3.2');assert.equal(result.feeRule.tiers[4].cap,'4000.00');
 const external=selectAccountRateCard({...initial(),clientType:'External'},'external-10',plans);assert.throws(()=>payload(external,'SG'),/exchange rate policy/);assert.equal(payload({...external,fxPolicy:'fixed'},'SG').fxRate,'3.2');const bnm=payload({...external,fxPolicy:'bnm-service-average'},'SG');assert.equal(bnm.fxPolicy,'bnm-service-average');assert.equal(bnm.fxRate,undefined);
});
test('deleted, removed, wrong-currency and stale-version cards fail closed; month change refreshes exact applicable version',()=>{
 const selected=selectAccountRateCard(initial(),'internal-new',plans);const archived=archiveRateCard(plans,'internal-new','2026-10-27T12:00:00Z');assert.equal(availableAccountRateCards(archived,selected).some(card=>card.id===selected.planId),false);assert.throws(()=>payload(selected,'MY',archived),/available/);assert.throws(()=>payload(selected,'MY',plans.filter(card=>card.id!==selected.planId)),/available/);
 const newer={...plans.find(card=>card.id==='internal-new'),version:2,effectiveMonth:'2026-11',rule:{type:'percent',currency:'MYR',basis:'custom',basisLabel:'Shopee Sales',percent:'2'}};const versions=[...plans,newer];assert.throws(()=>payload({...selected,effectiveMonth:'2026-11'},'MY',versions),/changed/);const refreshed=changeAccountSetupMonth(selected,'2026-11',versions);assert.equal(refreshed.planVersion,2);assert.equal(payload(refreshed,'SG',versions).feeRule.percent,'2');assert.equal(changeAccountSetupMonth(selected,'2026-09',versions).planId,'');
 const sgd={...newer,id:'sgd-card',currency:'SGD',rule:{...newer.rule,currency:'SGD'}};assert.throws(()=>payload({...selected,planId:'sgd-card',planVersion:2,effectiveMonth:'2026-11'},'SG',[...plans,sgd]),/MYR/);
});
test('custom tier caps and min/cap validation survive SG payload; no card defaults or missing company/month allowed',()=>{
 const selected=selectAccountRateCard(initial(),'internal-new',plans);const custom={...selected,planId:'custom',planVersion:null};assert.equal(payload(custom,'SG').feeRule.tiers[4].cap,'4000.00');assert.equal(payload(custom,'SG').rateCard,null);assert.throws(()=>payload({...custom,minimum:'5000'}),/tier cap/);assert.throws(()=>payload({...custom,tiers:[{from:'0',percent:'2',cap:'-1'}]}),/cap/);
 for(const patch of [{legalEntity:''},{effectiveMonth:'2026-09'},{effectiveMonth:'2026-13'},{clientType:''},{planId:''}])assert.throws(()=>payload({...selected,...patch}));
});
