import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const compiled=execFileSync('node_modules/.bin/esbuild',['app/package-lifecycle.ts','--bundle','--format=esm','--platform=node']);
const {marketToday,packageLifecycleStatus}=await import(`data:text/javascript;base64,${compiled.toString('base64')}`);

const normal = (from,to) => ({priceType:'non_campaign',effectiveFrom:from,effectiveTo:to});
const campaign = (from,to) => ({priceType:'campaign',effectiveFrom:from,effectiveTo:to});

test('a package expires after its Normal Day period even if a Campaign price continues', () => {
  const prices = [normal('2026-10-01','2026-10-22'),campaign('2026-10-01','2026-10-31')];
  assert.equal(packageLifecycleStatus(prices,null,'2026-10-22'),'active');
  assert.equal(packageLifecycleStatus(prices,null,'2026-10-23'),'expired');
});

test('future Normal Day periods and true long-term packages retain their lifecycle', () => {
  assert.equal(packageLifecycleStatus([normal('2026-11-01','2026-11-30'),campaign('2026-10-01','2026-10-31')],null,'2026-10-23'),'scheduled');
  assert.equal(packageLifecycleStatus([normal('2026-10-01',null)],{_longTermLifecycle:true},'2026-10-23'),'active');
  assert.equal(packageLifecycleStatus([normal('2026-10-01',null)],null,'2026-10-23'),'expired');
});

test('older campaign-only packages still derive status from saved periods', () => {
  assert.equal(packageLifecycleStatus([campaign('2026-10-01','2026-10-31')],null,'2026-10-23'),'active');
});

test('market Today uses store-local dates at Bangkok versus Singapore/Manila midnight boundary',()=>{
 const now=new Date('2026-10-28T16:30:00Z');assert.equal(marketToday('TH',now),'2026-10-28');for(const market of ['MY','SG','PH'])assert.equal(marketToday(market,now),'2026-10-29');
});
