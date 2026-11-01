import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
async function load(file){const code=execFileSync('node_modules/.bin/esbuild',[file,'--bundle','--format=esm','--platform=node','--target=node20']);return import(`data:text/javascript;base64,${code.toString('base64')}`);}
const {calculateProjectPreview,projectFeeCurrency,convertCurrencyToMyr}=await load('app/fee-preview-currency.ts');const {monthlyFeePreview,applyRateCardPreview}=await load('app/fee-plan-context.tsx');const {seedFeePlans}=await load('app/fee-plan-model.ts');const {accountMoney}=await load('app/account-display.ts');
const plans=seedFeePlans(),tier=plans.find(plan=>plan.id==='internal-new');
const make=(market,currency,rate)=>({id:'store:'+market,rosterKey:'store:'+market,storeId:market,storeName:market,project:market,market,currency,salesCurrency:currency,previewMarketFxEligible:true,previewRateDefaultsEligible:true,previewServiceFxRate:{serviceMonth:'2026-09',rate,policy:'bnm-service-average',verified:true,reference:'https://storage.data.gov.my/finsector/exr/monthly.csv',currency,quotationUnit:1},expectedNetFee:null,billed:null,collected:null,outstanding:null});
const th=make('TH','THB','0.1225'),ph=make('PH','PHP','0.065');
test('THB/PHP amounts convert per one unit exactly before whole-month MYR tiers and caps, independently per project',()=>{
 for(const [row,amount,converted,fee] of [[th,'100000','12250.00','428.75'],[ph,'100000','6500.00','260.00'],[th,'2000000','245000.00','4000.00'],[ph,'4000000','260000.00','4000.00']]){const before=structuredClone(row);const result=calculateProjectPreview(row,'2026-10',tier,amount);assert.equal(result.inputCurrency,row.currency);assert.equal(result.outputCurrency,'MYR');assert.equal(result.convertedAmount,converted);assert.equal(result.calculation.fee,fee);assert.equal(result.fxCurrency,row.currency);assert.equal(result.quotationUnit,1);assert.equal(result.serviceMonth,'2026-09');assert.deepEqual(row,before);}
 assert.equal(convertCurrencyToMyr('1','0.065'),'0.07');assert.equal(convertCurrencyToMyr('1224489.79','0.1225'),'150000.00');assert.equal(calculateProjectPreview(th,'2026-10',tier,'1224489.79').calculation.fee,'3750.00');
 const billedMyr={...th,currency:'MYR'};assert.equal(calculateProjectPreview(billedMyr,'2026-10',tier,'100000').calculation.fee,'428.75');assert.equal(billedMyr.currency,'MYR');assert.equal(accountMoney('1000.01','THB'),'฿ 1,000.01');assert.equal(accountMoney('1000.01','PHP'),'₱ 1,000.01');
});
test('no source rate card guessed; wrong-currency, missing-unit, stale or unverified FX cannot calculate percent fee',()=>{
 for(const row of [th,ph]){assert.equal(projectFeeCurrency(row,'2026-10'),'MYR');assert.equal(monthlyFeePreview(row,'2026-10',plans,{}).plan,undefined);assert.equal(monthlyFeePreview(row,'2026-10',plans,{}).calculation,undefined);
  for(const change of [{currency:'SGD'},{currency:row.currency==='THB'?'PHP':'THB'},{quotationUnit:100},{quotationUnit:undefined},{verified:false},{serviceMonth:'2026-08'},{reference:''}]){const invalid={...row,previewServiceFxRate:{...row.previewServiceFxRate,...change}};const result=calculateProjectPreview(invalid,'2026-10',tier,'100000');assert.equal(result.status,'pending_fx');assert.equal(result.calculation,undefined);}
  assert.equal(calculateProjectPreview({...row,previewServiceFxRate:undefined},'2026-10',tier,'100000').status,'pending_fx');assert.equal(calculateProjectPreview(row,'2026-11',tier,'100000').status,'pending_fx');
  assert.throws(()=>calculateProjectPreview({...row,previewServiceFxRate:{...row.previewServiceFxRate,rate:'0'}},'2026-10',tier,'1'));
 }
});
test('fixed MYR fee is valid without sales amount or available FX; no raw foreign receipt is relabelled',()=>{
 const fixed={...tier,id:'fixed',rule:{type:'fixed',currency:'MYR',basis:'fixed_monthly',fixedAmount:'1200'}};
 for(const row of [th,ph]){const result=calculateProjectPreview({...row,previewServiceFxRate:undefined},'2026-11',fixed,'');assert.equal(result.status,'ready');assert.equal(result.calculation.fee,'1200.00');assert.equal(result.outputCurrency,'MYR');assert.equal(result.inputCurrency,row.currency);assert.equal(result.fxRate,undefined);assert.equal(row.collected,null);}
});
test('TH/PH cross-country bulk can manually assign same MYR card atomically; incompatible SGD card rejected',()=>{
 const command={requestId:'batch-th-ph',unitKeys:[th.rosterKey,ph.rosterKey],clientType:'Internal',planId:tier.id,planVersion:1,effectiveMonth:'2026-10',changedAt:'2026-10-28T10:00:00Z'};
 const memory=applyRateCardPreview({},[th,ph],plans,command);for(const row of [th,ph]){assert.equal(monthlyFeePreview(row,'2026-10',plans,memory).plan.id,tier.id);assert.equal(monthlyFeePreview(row,'2026-10',plans,memory).amount,'');assert.equal(monthlyFeePreview(row,'2026-10',plans,memory).calculation,undefined);}
 assert.equal(memory['fee-preview-application-history'][0].targets.length,2);const sgd={...tier,id:'raw-sgd',currency:'SGD',rule:{...tier.rule,currency:'SGD'}};assert.throws(()=>applyRateCardPreview({},[th,ph],[...plans,sgd],{...command,planId:sgd.id}),/currency/);
 const locked={...memory,'fee-preview-locks':{['2026-10:'+ph.rosterKey]:'lock'}};const before=structuredClone(locked);assert.throws(()=>applyRateCardPreview(locked,[th,ph],plans,{...command,requestId:'locked'}),/locked/);assert.deepEqual(locked,before);
});
test('locked preview retains source currency, service month, one-unit FX, raw amount, converted MYR and fee',()=>{
 const memory=applyRateCardPreview({},[th],plans,{requestId:'th-one',unitKeys:[th.rosterKey],clientType:'Internal',planId:tier.id,planVersion:1,effectiveMonth:'2026-10',changedAt:'2026-10-28T10:00:00Z',previewAmount:'100000'});const current=monthlyFeePreview(th,'2026-10',plans,memory);const snapshot={id:'locked-th',month:'2026-10',unitKey:th.rosterKey,plan:structuredClone(current.plan),amount:current.amount,result:structuredClone(current.calculation),conversion:structuredClone(current.conversion)};const locked={...memory,'fee-preview-history':[snapshot],'fee-preview-locks':{['2026-10:'+th.rosterKey]:snapshot.id}};
 const newerRow={...th,previewServiceFxRate:{...th.previewServiceFxRate,rate:'0.2'}};const result=monthlyFeePreview(newerRow,'2026-10',plans,locked);assert.equal(result.calculation.fee,'428.75');assert.equal(result.conversion.fxRate,'0.1225');assert.equal(result.conversion.fxCurrency,'THB');assert.equal(result.conversion.quotationUnit,1);assert.equal(result.conversion.serviceMonth,'2026-09');assert.equal(result.conversion.convertedAmount,'12250.00');assert.equal(result.amount,'100000');
});

test('a known MY/SG source roster cannot auto-assign its old card after its real store market becomes TH/PH',()=>{
 const records=JSON.parse(readFileSync('app/account-rate-mapping-preview.json','utf8')).records;
 for(const originalMarket of ['MY','SG']){const record=records.find(item=>item.market===originalMarket);const row={id:record.rosterKey,rosterKey:record.rosterKey,project:record.project,currency:record.currency,previewRateDefaultsEligible:true};assert.equal(monthlyFeePreview(row,'2026-10',plans,{}).plan.id,record.planId);for(const market of ['TH','PH'])assert.equal(monthlyFeePreview({...row,market},'2026-10',plans,{}).plan,undefined);}
});
