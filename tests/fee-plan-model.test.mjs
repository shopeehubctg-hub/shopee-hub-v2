import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const compiled=execFileSync('node_modules/.bin/esbuild',['app/fee-plan-model.ts','--bundle','--format=esm','--platform=node','--target=node20']);
const {calculateFee,seedFeePlans,planForMonth,validatePlan,currentPlanVersions}=await import(`data:text/javascript;base64,${compiled.toString('base64')}`);
const plan=seedFeePlans().find(p=>p.id==='berlanco-tier');
test('whole-month brackets use exact thresholds, not progressive sums',()=>{
 for(const [amount,fee,rate] of [['0','0.00','9%'],['149999.99','13500.00','9%'],['150000','12000.00','8%'],['200000','16000.00','8%'],['299999.99','24000.00','8%'],['300000','21000.00','7%']]){const result=calculateFee(plan.rule,amount);assert.equal(result.fee,fee);assert.equal(result.rateLabel,rate);}
});
test('exact decimals round once to cents and preserve large values',()=>{const rule={type:'percent',currency:'MYR',basis:'net_gmv',percent:'9.7'};assert.equal(calculateFee(rule,'100000').fee,'9700.00');assert.equal(calculateFee(rule,'9999999999999999.99').fee,'970000000000000.00');assert.equal(calculateFee({...rule,percent:'0.5'},'1.00').fee,'0.01');});
test('minimum and cap apply to whole-month commission',()=>{const rule={...plan.rule,minimum:'100',cap:'1000'};assert.equal(calculateFee(rule,'0').fee,'100.00');assert.equal(calculateFee(rule,'200000').fee,'1000.00');});
test('fixed fee does not require an invented sales amount',()=>{assert.equal(calculateFee({type:'fixed',currency:'SGD',basis:'fixed_monthly',fixedAmount:'1000'},'').fee,'1000.00');});
test('versions use effective month then revision without changing prior months',()=>{const next={...plan,version:2,effectiveMonth:'2026-11',rule:{...plan.rule,tiers:[{from:'0',percent:'6'}]}};const versions=[plan,next];assert.equal(calculateFee(planForMonth(versions,plan.id,'2026-10').rule,'200000').fee,'16000.00');assert.equal(calculateFee(planForMonth(versions,plan.id,'2026-11').rule,'200000').fee,'12000.00');assert.equal(currentPlanVersions(versions,'2026-11').length,1);assert.equal(planForMonth(versions,plan.id,'2026-09'),undefined);});
test('unknown internal terms stay incomplete and no store receives an assumed client type',()=>{const plans=seedFeePlans();assert.throws(()=>calculateFee(plans.find(p=>p.id==='internal-fixed').rule,''));assert.throws(()=>calculateFee(plans.find(p=>p.id==='internal-tier').rule,'1000'));assert.ok(plans.every(p=>!('storeId' in p)));});
test('invalid percentages, negative money and unsorted thresholds rejected',()=>{assert.throws(()=>calculateFee({...plan.rule,tiers:[{from:'0',percent:'101'}]},'1000'));assert.throws(()=>calculateFee(plan.rule,'-1'));assert.throws(()=>validatePlan({...plan,rule:{...plan.rule,tiers:[{from:'150000',percent:'8'}]}}));});
