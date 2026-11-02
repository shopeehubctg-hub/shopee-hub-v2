import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const result=await build({entryPoints:['app/package-start-date-policy.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {changedPackageStart}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const row=(type,start,market='MY')=>({market,priceType:type,effectiveFrom:start,effectiveTo:null});
test('published origins lock on the start day and remain locked after expiry; drafts and future origins stay editable',()=>{
 const previous=[row('non_campaign','2026-11-02'),row('campaign','2026-11-09')];
 const changed=previous.map(p=>({...p,effectiveFrom:'2026-11-03'}));
 for(const status of ['active','scheduled','expired'])assert.match(changedPackageStart(previous,changed,status,'2026-11-02'),/Normal Day has already started/);
 for(const status of ['draft','review'])assert.equal(changedPackageStart(previous,changed,status,'2026-11-02'),null);
 assert.equal(changedPackageStart(previous,changed,'scheduled','2026-11-01'),null);
 assert.equal(changedPackageStart(previous,[previous[0],row('campaign','2026-11-10')],'active','2026-11-02'),null);
});
test('end changes and monthly extensions retain origins; removing a price group or adding an earlier start cannot bypass the guard',()=>{
 const previous=[row('non_campaign','2026-10-01'),row('campaign','2026-10-08'),row('non_campaign','2026-10-01','SG'),row('campaign','2026-10-08','SG')];
 assert.equal(changedPackageStart(previous,previous.map(p=>({...p,effectiveTo:'2026-11-30'})),'active','2026-11-02'),null);
 assert.equal(changedPackageStart(previous,[...previous,...previous.map(p=>({...p,effectiveFrom:'2026-12-01'}))],'active','2026-11-02'),null);
 assert.ok(changedPackageStart(previous,previous.filter(p=>p.market!=='SG'),'active','2026-11-02'));
 assert.ok(changedPackageStart(previous,[...previous,row('campaign','2026-09-01')],'active','2026-11-02'));
 assert.ok(changedPackageStart(previous,previous.map(p=>({...p,effectiveFrom:'2026-12-01'})),'active','2026-11-02'));
 assert.equal(changedPackageStart([{...row('non_campaign','2026-10-01'),market:'MY',currency:'SGD'}],[row('non_campaign','2026-10-01','SG')],'active','2026-11-02'),null);
});
