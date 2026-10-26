import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { endedPackagePeriods, endedPackageSettings, packageHistoryAction } from '../app/package-ending.ts';
import { packageLifecycleStatus } from '../app/package-lifecycle.ts';

test('manual ending expires today immediately, while ordinary end dates remain inclusive',()=>{
  const prices=[{effectiveFrom:'2026-10-01',effectiveTo:'2026-10-26',priceType:'non_campaign'}];
  assert.equal(packageLifecycleStatus(prices,null,'2026-10-26'),'active');
  const settings=endedPackageSettings({_longTermLifecycle:true},'2026-10-26T05:00:00Z','2026-10-26','customer@example.com');
  assert.equal(packageLifecycleStatus(prices,settings,'2026-10-26'),'expired');
  assert.equal(packageLifecycleStatus(prices,settings,'2026-10-27'),'expired');
  assert.equal(settings._longTermLifecycle,false);
  assert.equal(packageHistoryAction(settings,2),'Package Ended');
});

test('MY/SG prices stay unchanged, future months are cancelled and original versions remain intact',()=>{
  const prices=['MY','SG'].flatMap(market=>[
    {market,priceType:'non_campaign',effectiveFrom:'2026-10-01',effectiveTo:null,promotionType:'custom',originalPrice:10000,sellingPrice:9000},
    {market,priceType:'campaign',effectiveFrom:'2026-10-24',effectiveTo:'2026-10-25',promotionType:'custom',originalPrice:10000,sellingPrice:8000},
    {market,priceType:'campaign',effectiveFrom:'2026-11-09',effectiveTo:'2026-11-11',promotionType:'custom',originalPrice:10000,sellingPrice:8000},
  ]);
  const copy=structuredClone(prices);
  const ended=endedPackagePeriods(prices,'2026-10-26');
  assert.equal(ended.length,4);
  for(const market of ['MY','SG']){
    assert.equal(ended.find(p=>p.market===market&&p.priceType==='non_campaign').effectiveTo,'2026-10-26');
    assert.equal(ended.find(p=>p.market===market&&p.priceType==='campaign').effectiveTo,'2026-10-25');
  }
  assert.deepEqual(prices,copy);
});

test('ending disables recurring Campaigns and the existing email template names who ended the package',()=>{
  const settings=endedPackageSettings({_recurringCampaign:{startDate:'2026-10-01',endDate:null,events:[]}},'2026-10-26T05:00:00Z','2026-10-26','customer@example.com');
  assert.equal(settings._recurringCampaign,null);
  const context=vm.createContext({SPREADSHEET_ID:'test',HISTORY_SHEET:'Package History',SpreadsheetApp:{openById:()=>({getSheetByName:()=>({getSheetId:()=>1})})}});
  vm.runInContext(readFileSync(new URL('../integrations/PackageEmailNotifications.gs',import.meta.url),'utf8'),context);
  const row=['2026-10-26','p-v2','','Store A','Package A',2,'Package Ended','Ended','2026-10-01','2026-10-26'];
  row[18]=settings._packageHistorySummary.summary;
  const message=context.packageEmailMessage_(row,2);
  assert.match(message.body,/Package ended immediately by customer@example.com/);
  assert.match(message.body,/End date: 2026-10-26/);
  assert.match(message.subject,/Store A｜Package A/);
});
