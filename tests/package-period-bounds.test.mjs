import test from 'node:test';
import assert from 'node:assert/strict';
import {boundCampaignPeriods} from '../app/package-period-bounds.ts';

const normal=(market,from,to)=>({market,priceType:'non_campaign',effectiveFrom:from,effectiveTo:to,sellingPrice:90});
const campaign=(market,from,to)=>({market,priceType:'campaign',effectiveFrom:from,effectiveTo:to,sellingPrice:80});

test('legacy finite packages clip 2027 or Ongoing Campaign dates to their real end date',()=>{
  for(const end of ['2027-12-31',null]){
    const input=[normal('MY','2026-10-01','2026-10-22'),campaign('MY','2026-10-01',end)];
    const before=structuredClone(input);
    const output=boundCampaignPeriods(input);
    assert.equal(output[1].effectiveTo,'2026-10-22');
    assert.equal(output[1].sellingPrice,80);
    assert.deepEqual(input,before);
  }
});
test('MY and SG use their saved package end and future Campaign periods are removed',()=>{
  const output=boundCampaignPeriods([normal('MY','2026-10-01','2026-10-22'),campaign('MY','2026-10-08','2026-10-10'),campaign('MY','2026-11-09','2026-11-11'),normal('SG','2026-10-01','2026-10-26'),campaign('SG','2026-10-24','2026-10-31')]);
  assert.equal(output.length,4);
  assert.equal(output.find(p=>p.market==='SG'&&p.priceType==='campaign').effectiveTo,'2026-10-26');
  assert.equal(output.find(p=>p.market==='MY'&&p.priceType==='campaign').effectiveTo,'2026-10-10');
});
test('genuine long-term packages remain open-ended and selected future Normal months are retained',()=>{
  const ongoing=[normal('MY','2026-10-01',null),campaign('MY','2026-10-01',null)];
  assert.deepEqual(boundCampaignPeriods(ongoing),ongoing);
  const monthly=[normal('MY','2026-10-01','2026-10-31'),normal('MY','2026-11-01','2026-11-30'),campaign('MY','2026-11-09','2026-11-11')];
  assert.deepEqual(boundCampaignPeriods(monthly),monthly);
});
