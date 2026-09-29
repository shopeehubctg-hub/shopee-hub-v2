import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { emailChangeSummary } from '../app/api/packages/email-change-summary.ts';

const component={inventorySku:'SKU-A',name:'Product',quantity:1,kind:'product'};
const snapshot={components:[component],calculatorSettings:{_packageMetadata:{name:'Package A',market:'MY'}}};
const price={market:'MY',priceType:'campaign',sellingPrice:100,originalPrice:150,effectiveFrom:'2026-09-01',effectiveTo:'2026-09-30',promotionType:'monthly'};
const listing={platform:'Shopee',packageSku:'LISTING-A'};

test('inventory-only edit names the inventory change without claiming price or listing changes',()=>{
  const changed={...snapshot,components:[{...component,quantity:2}]};
  assert.equal(emailChangeSummary(changed,snapshot,[price],[price],[listing],[listing]),'OXM Inventory SKU 修改');
});
test('combined changes list all three requested fields and ignore ordering',()=>{
  const changed={...snapshot,components:[{...component,inventorySku:'SKU-B'}]};
  assert.equal(emailChangeSummary(changed,snapshot,[{...price,sellingPrice:90}],[price],[{...listing,packageSku:'LISTING-B'}],[listing]),'Disc Price 修改 ｜Package SKU 修改 ｜OXM Inventory SKU 修改');
  const second={...price,priceType:'non_campaign'};
  assert.equal(emailChangeSummary(snapshot,snapshot,[price,second],[second,price],[listing],[listing]),'配套资料修改');
});
test('period-only edits are identified without reporting a price edit',()=>{
  assert.equal(emailChangeSummary(snapshot,snapshot,[{...price,effectiveTo:'2026-10-31'}],[price],[listing],[listing]),'Package Period 修改');
});
test('V1 and edit templates include summary in text and HTML with escaped values',()=>{
  const source=readFileSync(new URL('../integrations/PackageEmailNotifications.gs',import.meta.url),'utf8');
  const context=vm.createContext({SPREADSHEET_ID:'sheet',SpreadsheetApp:{openById:()=>({getSheetByName:()=>({getSheetId:()=>123})})},HISTORY_SHEET:'Package History',packageSyncRequest_:()=>({summary:'OXM Inventory SKU 修改'})});
  vm.runInContext(source,context);
  const row=['time','example-v1','','Store <A>','Package A','1','','','Non-Campaign 2026-09-01 | Campaign 2026-09-01','2026-09-30'];
  const created=context.packageEmailMessage_(row,2);
  assert.match(created.body,/修改内容：新开配套/);
  assert.match(created.htmlBody,/Store &lt;A&gt;/);
  assert.match(created.body,/Package Period: 2026-09-01 ~ 2026-09-30/);
  row[5]='2';row[1]='example-v2';
  const edited=context.packageEmailMessage_(row,3);
  assert.match(edited.body,/修改内容：OXM Inventory SKU 修改/);
  assert.match(edited.htmlBody,/修改内容：OXM Inventory SKU 修改/);
  assert.match(edited.htmlBody,/range=A3/);
});
