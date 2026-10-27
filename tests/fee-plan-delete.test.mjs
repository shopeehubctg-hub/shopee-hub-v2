import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
async function load(file){const compiled=execFileSync('node_modules/.bin/esbuild',[file,'--bundle','--format=esm','--platform=node','--target=node20']);return import(`data:text/javascript;base64,${compiled.toString('base64')}`);}
const {seedFeePlans,archiveRateCard,planForMonth}=await load('app/fee-plan-model.ts');const {monthlyFeePreview,applyRateCardPreview}=await load('app/fee-plan-context.tsx');
const plans=seedFeePlans();const row={id:'unit',rosterKey:'unit',project:'Test company',currency:'MYR',billed:'100',collected:'10',outstanding:'90'};
const command={requestId:'apply',unitKeys:['unit'],clientType:'External',planId:'external-10',planVersion:1,effectiveMonth:'2026-10',changedAt:'2026-10-27T10:00:00Z',previewAmount:'1000'};
test('deleting unused card retains every immutable version and leaves all other templates unchanged',()=>{
 const version={...plans.find(plan=>plan.id==='external-11'),version:2,effectiveMonth:'2026-11'};const all=[...plans,version];const before=structuredClone(all);const archived=archiveRateCard(all,'external-11','2026-10-27T10:00:00Z');
 assert.deepEqual(all,before);assert.equal(archived.length,all.length);assert.equal(archived.filter(plan=>plan.id==='external-11'&&plan.archivedAt).length,2);assert.equal(planForMonth(archived,'external-11','2026-11').version,2);assert.deepEqual(archived.filter(plan=>plan.id!=='external-11'),before.filter(plan=>plan.id!=='external-11'));assert.equal(archiveRateCard(archived,'external-11','2026-10-28T10:00:00Z'),archived);
});
test('deleting assigned card preserves shared monthly read, future assignments, audit, lock snapshot and ledger',()=>{
 const memory=applyRateCardPreview({},[row],plans,command);memory['fee-preview-assignments-v2'].unit.push({effectiveMonth:'2026-12',clientType:'External',planId:'external-11'});
 const current=monthlyFeePreview(row,'2026-10',plans,memory);const snapshot={id:'lock',month:'2026-10',unitKey:'unit',plan:structuredClone(current.plan),amount:current.amount,result:structuredClone(current.calculation)};memory['fee-preview-history']=[snapshot];memory['fee-preview-locks']={'2026-10:unit':'lock'};const before=structuredClone({memory,row});
 const archived=archiveRateCard(plans,'external-10','2026-10-27T10:00:00Z');assert.equal(monthlyFeePreview(row,'2026-11',archived,memory).plan.name,'External 10%');assert.equal(monthlyFeePreview(row,'2026-10',archived,memory).calculation.fee,'100.00');assert.equal(monthlyFeePreview(row,'2026-12',archived,memory).plan.id,'external-11');assert.deepEqual({memory,row},before);
});
test('stale open assignment cannot apply deleted card to new or existing records',()=>{
 const archived=archiveRateCard(plans,'external-10','2026-10-27T10:00:00Z');const memory=applyRateCardPreview({},[row],plans,command);const before=structuredClone(memory);
 assert.throws(()=>applyRateCardPreview({},[row],archived,{...command,requestId:'new'}),/deleted/);assert.throws(()=>applyRateCardPreview(memory,[row],archived,{...command,requestId:'stale'}),/deleted/);assert.deepEqual(memory,before);
});
