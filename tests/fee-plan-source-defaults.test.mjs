import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const config=JSON.parse(readFileSync('app/account-rate-mapping-preview.json','utf8'));
const roster=JSON.parse(readFileSync('app/account-roster-data.json','utf8'));
const compiled=execFileSync('node_modules/.bin/esbuild',['app/fee-plan-context.tsx','--bundle','--format=esm','--platform=node','--target=node20']);
const {monthlyFeePreview}=await import(`data:text/javascript;base64,${compiled.toString('base64')}`);
const model=execFileSync('node_modules/.bin/esbuild',['app/fee-plan-model.ts','--bundle','--format=esm','--platform=node','--target=node20']);
const {seedFeePlans}=await import(`data:text/javascript;base64,${model.toString('base64')}`);
const plans=seedFeePlans();
const rowFor=record=>({id:record.rosterKey,rosterKey:record.rosterKey,project:record.project,currency:record.currency,previewRateDefaultsEligible:true,entity:'Shared entity',expectedNetFee:null,billed:null,collected:null,outstanding:null});
test('verified MY source defaults map exact 24 NEW, 10 OLD and 11 External projects from October only',()=>{
 assert.equal(config.records.filter(record=>record.currency==='MYR').length,45);const counts={};for(const record of config.records.filter(record=>record.currency==='MYR')){assert.ok(roster.rows.some(row=>row.id===record.rosterKey&&row.project===record.project));const row=rowFor(record);const preview=monthlyFeePreview(row,'2026-10',plans,{});assert.equal(preview.plan.id,record.planId);assert.equal(preview.choice.clientType,record.clientType);assert.equal(preview.calculation,undefined);assert.equal(monthlyFeePreview(row,'2026-09',plans,{}).plan,undefined);counts[record.planId]=(counts[record.planId]??0)+1;}
 assert.equal(counts['internal-new'],24);assert.equal(counts['internal-3'],10);assert.equal(config.records.filter(record=>record.currency==='MYR'&&record.clientType==='External').length,11);
 assert.equal(config.records.filter(record=>record.currency==='MYR'&&record.planId==='external-5').length,2);assert.equal(config.records.filter(record=>record.currency==='MYR'&&record.planId==='berlanco-tier').length,1);
});
test('defaults require tenant eligibility, exact roster key, project and source currency; DATUK and mismatched SG remain unassigned',()=>{
 const row=rowFor(config.records[0]);for(const change of [{previewRateDefaultsEligible:false},{previewRateDefaultsEligible:undefined},{rosterKey:'other'},{project:row.project+' '},{currency:'SGD'}])assert.equal(monthlyFeePreview({...row,...change},'2026-10',plans,{}).plan,undefined);
 assert.equal(monthlyFeePreview({...row,id:'DATUK',rosterKey:'DATUK',project:'DATUK DISCOUNT'},'2026-10',plans,{}).plan,undefined);
});
test('explicit future assignment and locked snapshots override defaults without changing earlier months or ledger',()=>{
 const row=rowFor(config.records.find(record=>record.planId==='internal-new'));const before=structuredClone(row);const memory={'fee-preview-assignments-v2':{[row.rosterKey]:[{effectiveMonth:'2026-11',clientType:'Internal',planId:'internal-3'}]}};
 assert.equal(monthlyFeePreview(row,'2026-10',plans,memory).plan.id,'internal-new');assert.equal(monthlyFeePreview(row,'2026-10',plans,memory).nextEffectiveMonth,'2026-11');assert.equal(monthlyFeePreview(row,'2026-11',plans,memory).plan.id,'internal-3');
 const snapshot={id:'locked',unitKey:row.rosterKey,month:'2026-11',plan:plans.find(plan=>plan.id==='internal-new'),amount:'200000',result:{fee:'4000.00',rateLabel:'2%',tierLabel:'E',basisLabel:'Shopee Sales'}};
 const locked={...memory,'fee-preview-history':[snapshot],'fee-preview-locks':{[`2026-11:${row.rosterKey}`]:'locked'}};assert.equal(monthlyFeePreview(row,'2026-11',plans,locked).plan.id,'internal-new');assert.deepEqual(row,before);
});
test('project amounts select independent tiers even for a shared entity, never aggregate company sales',()=>{
 const records=config.records.filter(record=>record.planId==='internal-new').slice(0,2);const [a,b]=records.map(rowFor);const memory={'fee-preview-amounts':{[`2026-10:${a.rosterKey}`]:'10000',[`2026-10:${b.rosterKey}`]:'199999.99'}};
 assert.equal(monthlyFeePreview(a,'2026-10',plans,memory).calculation.fee,'350.00');assert.equal(monthlyFeePreview(b,'2026-10',plans,memory).calculation.fee,'5000.00');assert.equal(a.entity,b.entity);assert.equal(a.expectedNetFee,null);
});
