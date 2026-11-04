import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import ExcelJS from 'exceljs';

const dir='node_modules/.three-period-tests';
await mkdir(dir,{recursive:true});
await build({entryPoints:['app/pricing-periods.ts','app/pricing-evidence.ts','app/package-repricing.ts','app/package-batch-excel.ts','app/package-batch-save.ts','app/package-history.ts','app/api/packages/pricing-evidence.ts'],outdir:dir,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'});
const periods=await import('../'+dir+'/pricing-periods.js');
const evidence=await import('../'+dir+'/pricing-evidence.js');
const reprice=await import('../'+dir+'/package-repricing.js');
const excel=await import('../'+dir+'/package-batch-excel.js');
const history=await import('../'+dir+'/package-history.js');
const resolve=await import('../'+dir+'/api/packages/pricing-evidence.js');
const model=await import('../app/price-calculator-model.js');
// Use a fully populated legacy fixture so v1 and v2 pass the same scalar checks.
const fixtureText=await readFile('tests/package-reprice-api.test.mjs','utf8');
const fixture=fixtureText.match(/const scenario=serviceScenario=>(\(\{.*?\}\));/)[1];
const legacy=Function('serviceScenario','return '+fixture);
const scenarios=(mode='split_normal')=>periods.pricingPeriods(mode).map((period,i)=>({...legacy(period==='campaign'?'Campaign Day':'Non-Campaign Day'),pricingSchemaVersion:2,pricingMode:mode,pricingPeriod:period,suggestedShopeePrice:mode==='uniform'?210:210+i*10}));
const price=(patch={})=>({market:'MY',priceType:'non_campaign',originalPrice:300,sellingPrice:210,effectiveFrom:'2026-01-01',effectiveTo:null,...patch});
const rule={schema:1,prices:{MY:{early:{originalPrice:300,sellingPrice:210},late:{originalPrice:300,sellingPrice:230}}}};
const settings={_pricingMode:'split_normal',_normalMonthlyRule:rule};

test('v2 three distinct periods survive validation; v1 remains exactly two',()=>{
 const s=evidence.exportSnapshots({scenarios:scenarios()});
 assert.deepEqual(evidence.snapshotAmounts(s),{normal:210,campaign:220,normalLate:230,pricingMode:'split_normal',pricingSchemaVersion:2});
 assert.equal(evidence.exportSnapshots({scenarios:[legacy('Non-Campaign Day'),legacy('Campaign Day')]}).length,2);
 for(const invalid of [s.slice(0,2),[s[0],s[1],s[0]],s.map((v,i)=>i? v:{...v,pricingMode:'unknown'}),s.map((v,i)=>i? v:{...v,serviceScenario:'Campaign Day'})])assert.throws(()=>evidence.exportSnapshots({scenarios:invalid}));
 const uniform=scenarios('uniform');assert.equal(evidence.exportSnapshots({scenarios:uniform}).length,3);uniform[2].suggestedShopeePrice++;assert.throws(()=>evidence.exportSnapshots({scenarios:uniform}),/one selling price/);
});

test('shared Normal availability controls day15/16, leap February, custom gaps, year boundary and ended lifecycle',()=>{
 periods.validateNormalMonthlyRule(rule,'split_normal',[price()]);
 for(const date of ['2026-01-15','2028-02-15','2026-12-15'])assert.equal(periods.effectivePackagePrice([price()],settings,date,'MY').sellingPrice,210);
 for(const date of ['2026-01-16','2028-02-29','2026-12-31','2027-01-16'])assert.equal(periods.effectivePackagePrice([price()],settings,date,'MY').sellingPrice,230);
 const finite=[price({effectiveFrom:'2026-10-14',effectiveTo:'2026-10-17'}),price({effectiveFrom:'2026-12-01',effectiveTo:'2026-12-31'})];
 assert.equal(periods.effectivePackagePrice(finite,settings,'2026-11-16','MY'),null);
 assert.equal(periods.effectivePackagePrice(finite,settings,'2026-10-13','MY'),null);
 assert.equal(periods.effectivePackagePrice(finite,settings,'2026-10-16','MY').sellingPrice,230);
 assert.equal(periods.effectivePackagePrice(finite,{...settings,_packageEnded:true},'2026-10-16','MY'),null);
 assert.throws(()=>periods.resolvedNormalPrice(finite[0],'2026-10-18',settings),/outside/);
 assert.throws(()=>periods.readNormalMonthlyRule({_pricingMode:'split_normal'}),/incomplete/);
 assert.throws(()=>periods.validateNormalMonthlyRule({...rule,prices:{MY:{...rule.prices.MY,late:{originalPrice:300,sellingPrice:301}}}},'split_normal',[price()]),/within/);
 assert.throws(()=>periods.validateNormalMonthlyRule(rule,'split_normal',[price({sellingPrice:209})]),/match/);
});

test('saved Campaign periods override Normal halves and never extend availability',()=>{
 const rows=[price({effectiveTo:'2026-11-30'}),price({priceType:'campaign',sellingPrice:220,effectiveFrom:'2026-11-09',effectiveTo:'2026-11-11'})];
 assert.equal(periods.effectivePackagePrice(rows,settings,'2026-11-10','MY').sellingPrice,220);
 assert.equal(periods.effectivePackagePrice(rows,settings,'2026-11-17','MY').sellingPrice,230);
 const recurring={...settings,_recurringCampaign:{schema:1,startDate:'2026-11-01',endDate:null,events:[{id:'payday',startDay:24,endDay:25,prices:{MY:{originalPrice:300,sellingPrice:225}}}]}};
 assert.equal(periods.effectivePackagePrice(rows,recurring,'2026-11-24','MY').sellingPrice,225);
 assert.equal(periods.effectivePackagePrice(rows,recurring,'2026-12-24','MY'),null);
});

test('one shared all-month price still calculates real independent fees, vouchers and payout',()=>{
 const row={facebookPrice:200};const fees={transaction:4.86,commission:16.2,service:5.94,serviceCap:108,isPreorder:true,preorder:2.16,autoTopUp:5,platformSupport:.54,sellerShipping:0,sellerVoucher:0,cofundVoucher:22,shopeeVoucher:17.14};
 const early=model.calculateShopeePriceAtPrice(row,fees,180),late=model.calculateShopeePriceAtPrice(row,{...fees,shopeeVoucher:8},180),campaign=model.calculateShopeePriceAtPrice(row,{...fees,service:8.1,shopeeVoucher:22},180);
 assert.equal(early.requiredPrice,180);assert.equal(early.markupAmount,-20);assert.notEqual(early.customerPrice,late.customerPrice);assert.notEqual(campaign.payout,early.payout);assert.equal(early.preorderFee,158*.0216);
});

test('MY+SG split Excel protects all calculated MY prices, retains 20 items, identity and mode',async()=>{
 const b=new ExcelJS.Workbook();await b.xlsx.load(await excel.downloadBatch([{code:'test',name:'QC Three Period',normal:210,campaign:220,normalLate:230,pricingMode:'split_normal',exportId:'11111111-1111-4111-8111-111111111111'}],'MY+SG',{pricingMode:'split_normal',storeId:'test-control-my'}));
 const s=b.getWorksheet('By SKU');for(const c of ['C7','D7','E7'])assert.notEqual(s.getCell(c).protection?.locked,false);
 s.getCell('B7').value=300;s.getCell('F7').value=100;s.getCell('G7').value=70;s.getCell('H7').value=75;s.getCell('I7').value=65;s.getCell('J7').value='000012';
 for(let i=0;i<20;i++){s.getCell(7,13+i*3).value='000'+i;s.getCell(7,14+i*3).value=i+1;}
 const rows=excel.readBatch(await b.xlsx.writeBuffer());assert.equal(rows[0].pricingMode,'split_normal');assert.equal(rows[0].prices.MY.normalLate,'230');assert.equal(rows[0].prices.SG.normalLate,'65');assert.equal(rows[0].skus.Shopee,'000012');assert.equal(rows[0].items.length,20);assert.equal(s.views[0].xSplit,1);
});

test('partial late repricing retains early, Campaign, other markets, Original Prices and all dates',()=>{
 const prices=[price({originalPrice:30000,sellingPrice:21000}),price({priceType:'campaign',originalPrice:30000,sellingPrice:22000}),price({market:'SG',originalPrice:10000,sellingPrice:7000})];
 const before=structuredClone(prices),state=reprice.repricedState(prices,settings,['normal_late'],{normal:250,campaign:260,normalLate:240,pricingMode:'split_normal'});
 assert.deepEqual(state.prices,before);assert.equal(state.normalRule.prices.MY.early.sellingPrice,210);assert.equal(state.normalRule.prices.MY.late.sellingPrice,240);assert.deepEqual(rule.prices.MY.late.sellingPrice,230);
 assert.throws(()=>reprice.repricedState(prices,settings,['non_campaign'],{normal:250,campaign:260}),/modes/);
 assert.throws(()=>reprice.repricedState(prices,null,['non_campaign'],{normal:250,campaign:260,normalLate:240,pricingMode:'split_normal'}),/modes/);
 assert.throws(()=>reprice.repricedState(prices,{_pricingMode:'normal_campaign'},['non_campaign','campaign'],{normal:250,campaign:250,pricingMode:'uniform'}),/modes/);
 assert.match(periods.normalPricingSummary(settings),/16th–End 230.00/);
 const e=reprice.replacementEvidence(settings,scenarios(),['normal_late'],{id:'ref',actor:'qa',createdAt:'now',normal:210,campaign:220,normalLate:230},state.prices,'qa');
 assert.deepEqual(Object.keys(e.periodReferences).sort(),['campaign','normal_16_end','normal_1_15']);assert.equal(e.scenarios[0].pricingPeriod,'normal_16_end');
 const publicSettings=history.publicCalculatorSettings({...settings,_pricingEvidence:e,scenarios:e.scenarios});assert.equal(publicSettings._normalMonthlyRule.prices.MY.late.sellingPrice,230);
});

test('direct Calculator handoff records all three prices and requires a reason for a newly modified half',async()=>{
 const schedules=[price({originalPrice:30000,sellingPrice:21000}),price({priceType:'campaign',originalPrice:30000,sellingPrice:22000})];
 const input={pricingMode:'split_normal',normalMonthlyRule:rule,calculatorSettings:{scenarios:scenarios()}};
 const e=await resolve.resolvePricingEvidence({}, {tenantId:'tenant',storeId:'test',actor:'qa'},input,schedules);assert.equal(e.scenarios.length,3);assert.equal(e.originalPrices.MY.normalLate,230);
 const changed={...input,normalMonthlyRule:{schema:1,prices:{MY:{...rule.prices.MY,late:{originalPrice:300,sellingPrice:235}}}}};
 await assert.rejects(()=>resolve.resolvePricingEvidence({}, {tenantId:'tenant',storeId:'test',actor:'qa'},changed,schedules),/reason/);
 const explained=await resolve.resolvePricingEvidence({}, {tenantId:'tenant',storeId:'test',actor:'qa'},{...changed,priceAdjustmentReason:'Rounded for promotion'},schedules);assert.equal(explained.originalPrices.MY.normalLate,230);assert.equal(explained.finalPrices.at(-1).sellingPrice,235);
});
