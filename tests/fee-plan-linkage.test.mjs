import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const compiled=execFileSync('node_modules/.bin/esbuild',['app/fee-plan-context.tsx','--bundle','--format=esm','--platform=node','--target=node20']);
const {monthlyFeePreview}=await import(`data:text/javascript;base64,${compiled.toString('base64')}`);
const row={id:'project',rosterKey:'unit',currency:'MYR',project:'Project',rateRule:{type:'percent',currency:'MYR',basis:'net_gmv',percent:'3'},expectedNetFee:'300.00',billed:'324.00',collected:'100.00',outstanding:'224.00'};
const tiers={id:'tier',name:'Shared tier',clientType:'External',currency:'MYR',version:1,effectiveMonth:'2026-10',rule:{type:'tiers',currency:'MYR',basis:'custom',basisLabel:'Billing amount (preview)',tiers:[{from:'0',percent:'9'},{from:'150000',percent:'8'},{from:'300000',percent:'7'}]}};
const flat={id:'flat',name:'Flat 10',clientType:'External',currency:'MYR',version:1,effectiveMonth:'2026-10',rule:{type:'percent',currency:'MYR',basis:'custom',basisLabel:'Billing amount (preview)',percent:'10'}};
function memory(choices){return {'fee-preview-assignments-v2':{unit:choices},'fee-preview-amounts':{'2026-10:unit':'150000','2026-11:unit':'200000'}};}
test('row and editor shared resolver immediately expose assigned plan, version and whole-month rate; ledger stays unchanged',()=>{
 const before=structuredClone(row);const noChoice=monthlyFeePreview(row,'2026-10',[tiers,flat],{});assert.equal(noChoice.plan,undefined);assert.equal(row.rateRule.percent,'3');
 const selected=monthlyFeePreview(row,'2026-10',[tiers,flat],memory([{effectiveMonth:'2026-10',clientType:'External',planId:'tier'}]));
 assert.equal(selected.plan.name,'Shared tier');assert.equal(selected.plan.version,1);assert.equal(selected.calculation.rateLabel,'8%');assert.equal(selected.calculation.fee,'12000.00');assert.deepEqual(row,before);
});
test('November assignment updates November only; client type/currency are never inferred',()=>{
 const state=memory([{effectiveMonth:'2026-10',clientType:'External',planId:'tier'},{effectiveMonth:'2026-11',clientType:'External',planId:'flat'}]);
 assert.equal(monthlyFeePreview(row,'2026-10',[tiers,flat],state).plan.id,'tier');assert.equal(monthlyFeePreview(row,'2026-11',[tiers,flat],state).plan.id,'flat');
 assert.equal(monthlyFeePreview({...row,currency:'SGD'},'2026-10',[tiers],state).plan,undefined);
 assert.equal(monthlyFeePreview(row,'2026-10',[tiers],memory([{effectiveMonth:'2026-10',clientType:'Internal',planId:'tier'}])).plan,undefined);
});
test('locked preview controls both row and editor even after a shared-template revision',()=>{
 const state=memory([{effectiveMonth:'2026-10',clientType:'External',planId:'tier'}]);const old=monthlyFeePreview(row,'2026-10',[tiers],state);
 const snapshot={id:'lock',unitKey:'unit',month:'2026-10',plan:structuredClone(old.plan),result:structuredClone(old.calculation),amount:old.amount};state['fee-preview-history']=[snapshot];state['fee-preview-locks']={'2026-10:unit':'lock'};
 const revised={...tiers,version:2,rule:{...tiers.rule,tiers:[{from:'0',percent:'6'}]}};
 const locked=monthlyFeePreview(row,'2026-10',[tiers,revised],state);assert.equal(locked.plan.version,1);assert.equal(locked.calculation.fee,'12000.00');
 state['fee-preview-locks']={};const unlocked=monthlyFeePreview(row,'2026-10',[tiers,revised],state);assert.equal(unlocked.plan.version,2);assert.equal(unlocked.calculation.fee,'9000.00');assert.equal(snapshot.result.fee,'12000.00');
});
test('a future template version does not relabel the previous invoice month',()=>{
 const state=memory([{effectiveMonth:'2026-10',clientType:'External',planId:'tier'}]);const revised={...tiers,version:2,effectiveMonth:'2026-11',rule:{...tiers.rule,tiers:[{from:'0',percent:'6'}]}};
 assert.equal(monthlyFeePreview(row,'2026-10',[tiers,revised],state).plan.version,1);assert.equal(monthlyFeePreview(row,'2026-11',[tiers,revised],state).plan.version,2);
});
test('persisted Rate Card snapshot keeps its exact version and rule after catalog revisions',()=>{
 const saved={...row,clientType:'External',rateCard:{id:'tier',version:1,name:'Shared tier'},rateEffectiveMonth:'2026-10',rateRule:structuredClone(tiers.rule)};
 const sameMonth={...tiers,version:2,rule:{...tiers.rule,tiers:[{from:'0',percent:'6'}]}};
 const nextMonth={...sameMonth,effectiveMonth:'2026-11'};
 for(const [month,cards] of [['2026-10',[tiers,sameMonth]],['2026-11',[tiers,nextMonth]]]){
  const resolved=monthlyFeePreview(saved,month,cards,memory([]));
  assert.equal(resolved.plan.version,1);
  assert.equal(resolved.plan.rule.tiers[1].percent,'8');
  assert.equal(resolved.calculation.fee,month==='2026-10'?'12000.00':'16000.00');
 }
});
test('a later explicit preview assignment can use a new card without changing a saved earlier month or lock',()=>{
 const saved={...row,clientType:'External',rateCard:{id:'tier',version:1,name:'Shared tier'},rateEffectiveMonth:'2026-10',rateRule:structuredClone(tiers.rule)};
 const revised={...tiers,version:2,effectiveMonth:'2026-11',rule:{...tiers.rule,tiers:[{from:'0',percent:'6'}]}};
 const state=memory([{effectiveMonth:'2026-11',clientType:'External',planId:'tier'}]);
 state['fee-preview-application-history']=[{effectiveMonth:'2026-11',plan:structuredClone(revised),targets:[{unitKey:'unit'}]}];
 assert.equal(monthlyFeePreview(saved,'2026-10',[tiers,revised],state).plan.version,1);
 const november=monthlyFeePreview(saved,'2026-11',[tiers,revised],state);
 assert.equal(november.plan.version,2);
 assert.equal(november.calculation.fee,'12000.00');
 const newer={...revised,version:3,rule:{...revised.rule,tiers:[{from:'0',percent:'5'}]}};
 assert.equal(monthlyFeePreview(saved,'2026-11',[tiers,revised,newer],state).plan.version,2);
 state['fee-preview-history']=[{id:'locked',plan:structuredClone(revised),result:structuredClone(november.calculation),amount:november.amount}];
 state['fee-preview-locks']={'2026-11:unit':'locked'};
 assert.equal(monthlyFeePreview(saved,'2026-11',[tiers,revised,newer],state).plan.version,2);
 assert.equal(monthlyFeePreview(saved,'2026-11',[tiers,revised,newer],state).calculation.fee,'12000.00');
});
