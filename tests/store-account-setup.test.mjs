import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
async function load(file){const compiled=execFileSync('node_modules/esbuild/bin/esbuild',[file,'--bundle','--format=esm','--platform=node','--target=node20',...(file.includes('seeds.server')?['--conditions=react-server']:[])]);return import(`data:text/javascript;base64,${compiled.toString('base64')}`);}
const {emptyAccountSetup,availableAccountRateCards,selectAccountRateCard,resetAccountSetupSelection,changeAccountSetupMonth,accountSetupPayload}=await load('app/store-account-setup-model.ts');
const {seedFeePlans}=await load('app/fee-plan-seeds.server.ts');const {archiveRateCard}=await load('app/fee-plan-model.ts');const plans=seedFeePlans();
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

test('TH/PH Internal and External explicitly select shared MYR cards, preserve tier caps and always use BNM service-month FX',()=>{
 for(const [market,currency] of [['TH','THB'],['PH','PHP']])for(const clientType of ['Internal','External']){
  const reset=resetAccountSetupSelection(initial(),market,clientType);assert.equal(reset.planId,'');assert.equal(reset.planVersion,null);assert.equal(reset.fxPolicy,'bnm-service-average');
  const selected=selectAccountRateCard(reset,clientType==='Internal'?'internal-new':'external-10',plans);const result=payload(selected,market);
  assert.equal(result.version,2);assert.equal(result.effectiveMonth,'2026-10');assert.equal(result.inputCurrency,currency);assert.equal(result.billingCurrency,'MYR');assert.equal(result.feeRule.currency,'MYR');assert.equal(result.fxPolicy,'bnm-service-average');assert.equal(result.fxRate,undefined);assert.equal(result.clientType,clientType);assert.deepEqual(result.rateCard,{id:selected.planId,version:1});
  if(clientType==='Internal'){assert.equal(result.feeRule.tiers[4].cap,'4000.00');assert.equal(result.feeRule.tiers[3].cap,undefined);}else assert.equal(result.feeRule.percent,'10');
  assert.equal(payload({...selected,fxPolicy:'fixed'},market).fxPolicy,'bnm-service-average');assert.equal(payload({...selected,fxPolicy:'fixed'},market).fxRate,undefined);
 }
});
test('switching MY/SG/TH/PH and client type clears card and SG fixed FX, but preserves entity and invoice month',()=>{
 let current=selectAccountRateCard(initial(),'internal-new',plans);
 for(const market of ['SG','TH','PH','MY']){
  current=resetAccountSetupSelection(current,market);assert.equal(current.legalEntity,'Example entity');assert.equal(current.effectiveMonth,'2026-10');assert.equal(current.planId,'');assert.equal(current.planVersion,null);assert.equal(current.fxPolicy,market==='SG'?'fixed':market==='MY'?'':'bnm-service-average');current=selectAccountRateCard(current,'internal-new',plans);
 }
 for(const market of ['TH','PH']){const external=resetAccountSetupSelection(current,market,'External');assert.equal(external.clientType,'External');assert.equal(external.fxPolicy,'bnm-service-average');assert.equal(external.planId,'');assert.ok(availableAccountRateCards(plans,external).every(card=>card.clientType==='External'&&card.currency==='MYR'));assert.equal(selectAccountRateCard(external,'internal-new',plans).planId,'');}
});
test('TH/PH archived, removed or stale cards and missing required fields fail closed; month-effective version remains exact',()=>{
 const selected=selectAccountRateCard(initial(),'internal-new',plans);const archived=archiveRateCard(plans,'internal-new','2026-10-28T12:00:00Z');const newer={...plans.find(card=>card.id==='internal-new'),version:2,effectiveMonth:'2026-11',rule:{type:'percent',currency:'MYR',basis:'custom',basisLabel:'Shopee Sales',percent:'2'}};const versions=[...plans,newer];
 for(const market of ['TH','PH']){
  assert.throws(()=>payload(selected,market,archived),/available/);assert.throws(()=>payload(selected,market,plans.filter(card=>card.id!==selected.planId)),/available/);assert.throws(()=>payload({...selected,effectiveMonth:'2026-11'},market,versions),/changed/);
  const refreshed=changeAccountSetupMonth(selected,'2026-11',versions);const result=payload(refreshed,market,versions);assert.deepEqual(result.rateCard,{id:'internal-new',version:2});assert.equal(result.effectiveMonth,'2026-11');assert.equal(result.feeRule.percent,'2');assert.equal(result.fxRate,undefined);
  for(const patch of [{legalEntity:''},{effectiveMonth:'2026-09'},{effectiveMonth:'2026-13'},{clientType:''},{planId:''}])assert.throws(()=>payload({...selected,...patch},market));
  const custom=payload({...selected,planId:'custom',planVersion:null},market);assert.equal(custom.feeRule.currency,'MYR');assert.equal(custom.feeRule.tiers[4].cap,'4000.00');assert.equal(custom.fxPolicy,'bnm-service-average');assert.equal(custom.rateCard,null);
 }
 assert.throws(()=>payload(selected,'VN'),/market/);
});
