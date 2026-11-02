import test from 'node:test';
import assert from 'node:assert/strict';
import { malaysiaInstant, planRefresh, guardedSql } from '../tooling/cofund-refresh.mjs';
import { maximumCoFundVoucher } from '../app/price-calculator-model.js';

const store = { id:'test-control-my', tenant_id:'test-staging', name:'TEST Control MY', platform:'Shopee' };
const source = { row:247, store:store.name, voucher:'VTH20_50%_11 Nov Cofund DHT', amount:'RM60.00', qty:10, period:'08/11/2026 00:00 - 15/11/2026 23:59' };
const args = { stores:[store], source:[source], existing:[], sheetId:'synthetic-fixture', runId:'20261102T062500Z-test' };

test('Malaysia source period retains exact inclusive instants', () => {
  assert.equal(malaysiaInstant('08/11/2026 00:00'), '2026-11-07T16:00:00.000Z');
  assert.equal(malaysiaInstant('15/11/2026 23:59'), '2026-11-15T15:59:00.000Z');
  for (const invalid of ['31/11/2026 00:00','08/11/2026 24:01','2026-11-08','08/11/2026 00:60']) assert.throws(() => malaysiaInstant(invalid));
});
test('new rows use verified tenant/store and exact decimal source amount', () => {
  const plan = planRefresh(args);
  assert.equal(plan.insert[0].store_id, store.id);
  assert.equal(plan.insert[0].discount_amount, '60.00');
  assert.equal(plan.insert[0].campaign_date, '2026-11-11');
});
test('exact replay is a no-op; duplicate incoming/saved rows reject', () => {
  const value = planRefresh(args).insert[0];
  assert.equal(planRefresh({...args,existing:[{...value,id:1}]}).insert.length, 0);
  assert.throws(()=>planRefresh({...args,source:[source,source]}), /Duplicate incoming/);
  assert.throws(()=>planRefresh({...args,existing:[{...value,id:1},{...value,id:2}]}), /Ambiguous duplicate/);
});
test('changed source identity archives provenance and retains old business data', () => {
  const old = {...planRefresh(args).insert[0],id:1,voucher_name:'VTH16_50%_25 Oct Cofund DHT',discount_amount:'6.00'};
  const before = structuredClone(old);
  const plan = planRefresh({...args,existing:[old]});
  assert.equal(plan.insert.length, 1);
  assert.equal(plan.archiveProvenance.length, 1);
  assert.match(plan.archiveProvenance[0].source_tab, /^Sheet1@db-before-/);
  assert.deepEqual(old,before);
  assert.deepEqual(plan.archiveProvenance[0].before,before);
});
test('unknown/ambiguous store or cross-tenant source-row ownership rejects', () => {
  assert.throws(()=>planRefresh({...args,stores:[]}), /Unknown or ambiguous/);
  assert.throws(()=>planRefresh({...args,stores:[store,store]}), /Unknown or ambiguous/);
  const old = {...planRefresh(args).insert[0],id:1,tenant_id:'other'};
  assert.throws(()=>planRefresh({...args,existing:[old]}), /another store/);
});
test('reused business key with changed dates/quantity fails closed', () => {
  const old = {...planRefresh(args).insert[0],id:1,quantity:9};
  assert.throws(()=>planRefresh({...args,existing:[old]}), /business key differs/);
});
test('reject malformed amounts, fractional quantities and reversed periods', () => {
  for (const row of [{...source,amount:'RM-1.00'},{...source,amount:'RM2.001'},{...source,qty:1.5},{...source,period:'15/11/2026 00:00 - 08/11/2026 23:59'}]) {
    assert.throws(()=>planRefresh({...args,source:[row]}));
  }
});
test('SQL is rollback-only by default, locks and checks full baseline, never deletes/upserts', () => {
  const sql = guardedSql({plan:planRefresh(args),existing:[]});
  assert.match(sql,/LOCK TABLE/);
  assert.match(sql,/Stale voucher count/);
  assert.match(sql,/Store tenant mismatch/);
  assert.match(sql,/ROLLBACK;$/);
  assert.doesNotMatch(sql,/\bDELETE\b|ON CONFLICT/i);
});
test('calculator uses current amount, not future or expired maximum; endpoints inclusive', () => {
  const future = planRefresh(args).insert[0];
  const toUi = r=>({discountAmount:r.discount_amount,campaignStartAt:r.campaign_start_at,campaignEndAt:r.campaign_end_at});
  const current = {...future,discount_amount:'30.00',campaign_start_at:'2026-10-30T04:00:00Z',campaign_end_at:'2026-11-11T15:59:00Z'};
  const rows = [toUi(current),toUi(future),toUi({...current,discount_amount:'100.00',campaign_end_at:'2026-10-31T15:59:00Z'})];
  assert.equal(maximumCoFundVoucher(rows,'2026-11-02T06:00:00Z').discountAmount,'30.00');
  assert.equal(maximumCoFundVoucher(rows,future.campaign_start_at).discountAmount,'60.00');
  assert.equal(maximumCoFundVoucher(rows,future.campaign_end_at).discountAmount,'60.00');
  assert.equal(maximumCoFundVoucher(rows,'2026-11-15T15:59:00.001Z'),null);
});
test('source text cannot close the SQL dollar body, including quote and delimiter strings', () => {
  const plan = planRefresh({...args,source:[{...source,voucher:"TEST ' $cofund$ $cofund_$ 11 Nov"}]});
  const sql = guardedSql({plan,existing:[]});
  assert.match(sql,/DO \$cofund__\$/);
  assert.match(sql,/TEST '' \$cofund\$/);
  assert.match(sql,/END \$cofund__\$;/);
});
