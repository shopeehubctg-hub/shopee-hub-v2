import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const config=JSON.parse(readFileSync('app/account-rate-mapping-preview.json','utf8'));
async function load(file){const compiled=execFileSync('node_modules/.bin/esbuild',[file,'--bundle','--format=esm','--platform=node','--target=node20']);return import(`data:text/javascript;base64,${compiled.toString('base64')}`);}
const {convertSgdToMyr,calculateProjectPreview,projectFeeCurrency}=await load('app/fee-preview-currency.ts');
const {seedFeePlans}=await load('app/fee-plan-model.ts');const plans=seedFeePlans();
const {monthlyFeePreview,applyRateCardPreview}=await load('app/fee-plan-context.tsx');
const rowFor=record=>({id:record.rosterKey,rosterKey:record.rosterKey,project:record.project,currency:record.currency,previewRateDefaultsEligible:true,expectedNetFee:null,billed:'100.00',collected:'20.00',outstanding:'80.00'});
const sg=config.records.find(record=>record.currency==='SGD'&&record.planId==='internal-new');const row=rowFor(sg);const card=plans.find(plan=>plan.id==='internal-new');
test('SGD converts exactly before MYR whole-month tier and E cap selection, independently per project',()=>{
 for(const [amount,converted,fee] of [['0.01','0.03','0.00'],['3124.99','9999.97','400.00'],['3125','10000.00','350.00'],['62499.99','199999.97','5000.00'],['62500','200000.00','4000.00'],['93750','300000.00','4000.00']]){const result=calculateProjectPreview(row,'2026-10',card,amount);assert.equal(result.convertedAmount,converted);assert.equal(result.calculation.fee,fee);assert.equal(result.outputCurrency,'MYR');assert.equal(result.inputCurrency,'SGD');assert.equal(result.fxRate,'3.2');}
 assert.equal(convertSgdToMyr('0.01','3.5'),'0.04');assert.throws(()=>convertSgdToMyr('10','0'));assert.throws(()=>convertSgdToMyr('10','3.123456789'));
 assert.equal(calculateProjectPreview(row,'2026-10',card,'10000').calculation.fee,'1120.00');assert.equal(calculateProjectPreview({...row,id:'another'},'2026-10',card,'10000').calculation.fee,'1120.00');
});
test('Bonlife uses verified September BNM average 3.197 for October invoice, with no stale rate fallback in November',()=>{
 const record=config.records.find(record=>record.currency==='SGD'&&record.fxPolicy==='bnm-service-average');const bonlife=rowFor(record);const plan=plans.find(plan=>plan.id===record.planId);
 const october=calculateProjectPreview(bonlife,'2026-10',plan,'1000');assert.equal(october.fxRate,'3.197');assert.equal(october.serviceMonth,'2026-09');assert.equal(october.convertedAmount,'3197.00');assert.equal(october.calculation.fee,'319.70');
 const november=calculateProjectPreview(bonlife,'2026-11',plan,'1000');assert.equal(november.status,'pending_fx');assert.equal(november.calculation,undefined);
 const jan=calculateProjectPreview(bonlife,'2027-01',plan,'1000');assert.equal(jan.serviceMonth,'2026-12');assert.equal(jan.status,'pending_fx');
 const unverified={...config,fxRates:config.fxRates.map(rate=>({...rate,verified:false}))};assert.equal(calculateProjectPreview(bonlife,'2026-10',plan,'1000',unverified).status,'pending_fx');
});
test('unknown SG External FX blocks calculations; no raw SGD can be passed off as MYR and MY ledger is unchanged',()=>{
 const record=config.records.find(record=>record.currency==='SGD'&&record.fxPolicy==='pending');const pending=rowFor(record);const before=structuredClone(pending);const plan=plans.find(plan=>plan.id===record.planId);assert.equal(calculateProjectPreview(pending,'2026-10',plan,'1000').status,'pending_fx');assert.equal(calculateProjectPreview(pending,'2026-10',plan,'1000').calculation,undefined);assert.deepEqual(pending,before);
 assert.throws(()=>calculateProjectPreview({...row,rosterKey:'unknown'},'2026-10',card,'1000'));
 const my={...row,currency:'MYR'};assert.equal(projectFeeCurrency(my,'2026-10'),'MYR');assert.equal(calculateProjectPreview(my,'2026-10',card,'200000').calculation.fee,'4000.00');assert.equal(calculateProjectPreview(my,'2026-10',card,'200000').fxRate,undefined);
});
test('assignment validates billing currency via shared FX path and locks retain original conversion metadata',()=>{
 const before=structuredClone(row);const memory=applyRateCardPreview({},[row],plans,{requestId:'sg-apply',unitKeys:[row.rosterKey],clientType:'Internal',planId:card.id,planVersion:card.version,effectiveMonth:'2026-10',changedAt:'2026-10-27T10:00:00Z',previewAmount:'62500'});
 const current=monthlyFeePreview(row,'2026-10',plans,memory);assert.equal(current.calculation.fee,'4000.00');assert.equal(current.conversion.convertedAmount,'200000.00');
 const snapshot={id:'lock',month:'2026-10',unitKey:row.rosterKey,plan:structuredClone(current.plan),amount:current.amount,result:structuredClone(current.calculation),conversion:structuredClone(current.conversion)};
 const locked={...memory,'fee-preview-history':[snapshot],'fee-preview-locks':{[`2026-10:${row.rosterKey}`]:'lock'}};const revised=plans.map(plan=>plan.id===card.id?{...plan,version:2,rule:{...plan.rule,tiers:[{from:'0',percent:'20'}]}}:plan);
 const retained=monthlyFeePreview(row,'2026-10',revised,locked);assert.equal(retained.calculation.fee,'4000.00');assert.equal(retained.conversion.fxRate,'3.2');assert.equal(retained.conversion.serviceMonth,'2026-09');assert.equal(retained.amount,'62500');assert.equal(retained.conversion.convertedAmount,'200000.00');assert.deepEqual(row,before);
});
test('verified server BNM rate is used only for the exact service month, ahead of the static snapshot',()=>{
 const record=config.records.find(record=>record.currency==='SGD'&&record.fxPolicy==='bnm-service-average');const bonlife=rowFor(record);const plan=plans.find(plan=>plan.id===record.planId);const rate={serviceMonth:'2026-10',rate:'3.1234',policy:'bnm-service-average',verified:true,reference:'https://storage.data.gov.my/finsector/exr/monthly.csv'};
 const result=calculateProjectPreview({...bonlife,previewServiceFxRate:rate},'2026-11',plan,'1000');assert.equal(result.fxRate,'3.1234');assert.equal(result.calculation.fee,'312.34');assert.equal(result.fxReference,rate.reference);
 assert.equal(calculateProjectPreview({...bonlife,previewServiceFxRate:rate},'2026-12',plan,'1000').status,'pending_fx');
});
