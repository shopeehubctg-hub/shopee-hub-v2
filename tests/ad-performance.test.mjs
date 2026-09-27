import assert from "node:assert/strict";
import test from "node:test";
import { aggregateAdPerformanceByDate, aggregateSelectedAdRows, authorizedAdStoreIds, latestAdSyncTime, selectAdRows, selectedAdDateFor } from "../app/ad-performance.js";
import { withoutAdCampaigns } from "../app/dashboard-snapshot.js";
import { balanceCsvColumns, hasCurrentTopUpInputs, isCurrentBalanceDate, isCurrentPerformanceDate, parseAdBalance } from "../app/ad-balance-validation.js";
import { shouldShowAllStoresTopUps, summarizeAllStoresTopUps } from "../app/ad-topup-overview.js";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

test("FullAd rows from visible stores combine by date with weighted rates", () => {
  const daily = aggregateAdPerformanceByDate([
    { performance_date:"2026-09-22", spend:10, sales:50, views:100, clicks:10, conversions:2, sold:3 },
    { performance_date:"2026-09-22", spend:30, sales:150, views:300, clicks:15, conversions:4, sold:6 },
    { performance_date:"2026-09-21", spend:0, sales:0, views:0, clicks:0, conversions:0, sold:0 },
  ]);
  assert.deepEqual(daily.map(row=>row.date),["2026-09-21","2026-09-22"]);
  assert.deepEqual({ spend:daily[1].spend, sales:daily[1].sales, roas:daily[1].roas, ctr:daily[1].ctr, acos:daily[1].acos },
    { spend:40, sales:200, roas:5, ctr:25/400, acos:0.2 });
  assert.equal(daily[1].conversion,6);
  assert.equal(daily[1].sold,9);
});

test("All Stores month to date totals use source numerators and denominators", () => {
  const daily=aggregateAdPerformanceByDate([
    { store_id:"a",performance_date:"2026-09-23",spend:10,sales:100,views:100,clicks:10,conversions:2,sold:3 },
    { store_id:"b",performance_date:"2026-09-23",spend:30,sales:30,views:900,clicks:9,conversions:3,sold:4 },
    { store_id:"a",performance_date:"2026-09-24",spend:20,sales:40,views:200,clicks:20,conversions:4,sold:5 },
    { store_id:"b",performance_date:"2026-09-24",spend:0,sales:0,views:0,clicks:0,conversions:0,sold:0 },
  ]);
  const selected=selectAdRows(daily,"mtd",{latestDate:"2026-09-24"});
  assert.equal(selected.length,2);
  assert.deepEqual(new Set(selected.flatMap(row=>row.storeIds)),new Set(["a","b"]));
  const total=aggregateSelectedAdRows(selected);
  assert.equal(total.spend,60);
  assert.equal(total.sales,170);
  assert.equal(total.roas,170/60);
  assert.equal(total.acos,60/170);
  assert.equal(total.ctr,39/1200);
  assert.equal(total.cpc,60/39);
  assert.equal(total.conversionRate,9/39);
  assert.equal(total.costPerConversion,60/9);
  assert.equal(total.sold,12);
  assert.equal(aggregateSelectedAdRows(selectAdRows(daily,"range",{rangeStart:"2026-09-25",rangeEnd:"2026-09-26"})),null);
});

test("FullAd store scope includes only visible stores and requires Advertising access", () => {
  const visible=[{id:"store-a"},{id:"store-b"}];
  assert.deepEqual(authorizedAdStoreIds([],undefined,true),[]);
  assert.deepEqual(authorizedAdStoreIds(visible,visible[1],true),["store-b"]);
  assert.deepEqual(authorizedAdStoreIds(visible,undefined,true),["store-a","store-b"]);
  assert.deepEqual(authorizedAdStoreIds(visible,undefined,false),[]);
});

test("latest advertising sync time comes from the authorized rows", () => {
  assert.equal(latestAdSyncTime([
    {synced_at:"2026-09-25T09:00:00+00:00"},
    {synced_at:"2026-09-25T13:11:17.544396+00:00"},
    {synced_at:null},
  ]),"2026-09-25T13:11:17.544396+00:00");
  assert.equal(latestAdSyncTime([]),null);
});

test("balance update label never invents a time for date-only sheet rows", async () => {
  const route=await readFile(new URL("../app/api/dashboard/route.ts",import.meta.url),"utf8");
  const page=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
  assert.match(route,/sourceUpdatedAt:null/);
  assert.doesNotMatch(route,/latestBalance/);
  assert.doesNotMatch(route,/9:00 am/);
  assert.match(page,/`Balance as of \$\{formatAdDate\(effectiveBalance\.balanceDate\)\}`/);
  assert.match(page,/\{ \.\.\.adsBase, balance:null, sourceUpdatedAt:null, syncStatus:"delayed" \}/);
});

test("dashboard snapshots omit individual ads without changing stored data", () => {
  const original={id:1,payload:{overview:[["Sales","RM 100"]],advertising:{balance:25},adCampaigns:[{id:"old-ad"}]}};
  const visible=withoutAdCampaigns(original);
  assert.deepEqual(visible,{id:1,payload:{overview:[["Sales","RM 100"]],advertising:{balance:25}}});
  assert.deepEqual(withoutAdCampaigns(original,false),{id:1,payload:{overview:[["Sales","RM 100"]]}});
  assert.deepEqual(original.payload.adCampaigns,[{id:"old-ad"}]);
  assert.equal(withoutAdCampaigns(null),null);
});

test("Shopee Open Platform stays outside the active dashboard path", async () => {
  const page=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
  const dashboard=await readFile(new URL("../app/api/dashboard/route.ts",import.meta.url),"utf8");
  assert.match(page,/fetch\(`\/api\/dashboard/);
  assert.doesNotMatch(page,/\/api\/shopee\/advertising/);
  assert.doesNotMatch(dashboard,/partner\.shopeemobile|get_product_level_campaign/);
  await assert.rejects(readFile(new URL("../app/api/shopee/advertising/route.ts",import.meta.url),"utf8"),{code:"ENOENT"});
  assert.match(dashboard,/const \[sheetBalances,productProfile,selectedCoFundVouchers,voucherPreset,adPerformance\] = await Promise\.all\(\[/);
  assert.match(dashboard,/readSheetBalances\(\)/);
  assert.match(dashboard,/readProductCatalogSheet\(selectedStore\.name\)/);
  assert.match(dashboard,/readAdPerformance\(authorizedAdStoreIds/);
});

test("balance CSV requires the named Ad Balance column and recent dates", async () => {
  const header=["Date","Store Name","Spend","Sales","ROAS","Views","Clicks","CTR","Conversion","Sold","ACOS","Ad Balance (RM)"];
  assert.deepEqual(balanceCsvColumns(header),{dateIndex:0,storeIndex:1,balanceIndex:11});
  assert.deepEqual(balanceCsvColumns(["Date\tStore Name\tAd Balance (RM)","",""]),{dateIndex:0,storeIndex:1,balanceIndex:2});
  assert.equal(balanceCsvColumns(["Date\tStore Name\tAd Balance (RM)","Unexpected"]),null);
  assert.equal(balanceCsvColumns(["Date Store Name Ad Balance (RM)"]),null);
  assert.equal(balanceCsvColumns(["","Store Name","Spend",...Array(9).fill("")]),null);
  assert.equal(isCurrentBalanceDate("2026-09-25","2026-09-27"),true);
  assert.equal(isCurrentBalanceDate("2026-09-24","2026-09-27"),true);
  assert.equal(isCurrentBalanceDate("2026-09-23","2026-09-27"),false);
  assert.equal(isCurrentPerformanceDate("2026-09-25","2026-09-27"),true);
  assert.equal(isCurrentPerformanceDate("2026-09-24","2026-09-27"),false);
  assert.equal(hasCurrentTopUpInputs("2026-09-26","2026-09-25","2026-09-27"),true);
  assert.equal(hasCurrentTopUpInputs("2026-09-27","2026-09-25","2026-09-27"),true);
  assert.equal(hasCurrentTopUpInputs("2026-09-27","2026-09-24","2026-09-27"),false);
  assert.equal(isCurrentBalanceDate("2026-08-05","2026-09-27"),false);
  assert.equal(isCurrentBalanceDate("2026-09-32","2026-09-27"),false);
  assert.equal(parseAdBalance("RM 1,234.50"),1234.5);
  assert.equal(parseAdBalance("0"),0);
  assert.equal(parseAdBalance("1,23"),null);
  assert.equal(parseAdBalance(""),null);
  assert.equal(parseAdBalance("Spend: 55"),null);
  const route=await readFile(new URL("../app/api/dashboard/route.ts",import.meta.url),"utf8");
  assert.match(route,/export\?format=csv&gid=421872532/);
  assert.doesNotMatch(route,/export\?format=csv&gid=896889002/);
  assert.doesNotMatch(route,/sheet=Sheet1/);
});

test("Apps Script skips an empty AdBalance tab without writing balances", async () => {
  const source=await readFile(new URL("../google-apps-script/Code.gs",import.meta.url),"utf8");
  assert.match(source,/balanceSheet: 'AdBalance'/);
  const context={
    SpreadsheetApp:{getActive:()=>({getSheetByName:()=>({getDataRange:()=>({getValues:()=>[[""]]})})})},
    console:{log:()=>{}},
    PropertiesService:{getScriptProperties:()=>{throw new Error("Empty balances must not write to Supabase");}},
  };
  assert.deepEqual(JSON.parse(JSON.stringify(runInNewContext(`${source}\nsyncBalances_({})`,context))),{count:0,unmatched:[]});
});

test("Apps Script accepts both balance headers, skips blanks, and parses zero and thousands", async () => {
  const source=await readFile(new URL("../google-apps-script/Code.gs",import.meta.url),"utf8");
  for (const header of [["Date\tStore Name\tAd Balance (RM)","",""],["Date","Store Name","Ad Balance (RM)"]]) {
    const sent=[];
    const context={
      SpreadsheetApp:{getActive:()=>({getSheetByName:()=>({getDataRange:()=>({getValues:()=>[
        header,
        ["2026-09-27","Blank store","  "],
        ["2026-09-27","Zero store",0],
        ["2026-09-27","Thousand store","2,522.36"],
        ["2026-09-27","Bad store","2,52.36"],
      ]})})})},
      Utilities:{formatDate:()=>"2026-09-27"},
      PropertiesService:{getScriptProperties:()=>({getProperty:key=>key==="SUPABASE_URL"?"https://example.test":"sb_secret_test"})},
      UrlFetchApp:{fetch:(_url,options)=>{sent.push(JSON.parse(options.payload));return {getResponseCode:()=>201,getContentText:()=>""};}},
      console:{log:()=>{}},
    };
    const result=runInNewContext(`${source}\nsyncBalances_({"blank store":{id:"blank"},"zero store":{id:"zero"},"thousand store":{id:"thousand"},"bad store":{id:"bad"}})`,context);
    assert.equal(result.count,2);
    assert.equal(sent.length,1);
    assert.deepEqual(sent[0].map(row=>[row.store_id,row.balance_cents]),[["zero",0],["thousand",252236]]);
  }
});

test("Apps Script rejects an unknown balance header", async () => {
  const source=await readFile(new URL("../google-apps-script/Code.gs",import.meta.url),"utf8");
  const context={
    SpreadsheetApp:{getActive:()=>({getSheetByName:()=>({getDataRange:()=>({getValues:()=>[
      ["Date Store Name Ad Balance (RM)","",""],
      ["2026-09-27","Store",10],
    ]})})})},
  };
  assert.throws(()=>runInNewContext(`${source}\nsyncBalances_({})`,context),/missing header: Date/);
});

test("All Stores top-ups use single-store rules and respect access and ownership", () => {
  assert.equal(shouldShowAllStoresTopUps(true,"superadmin",1,true),true);
  assert.equal(shouldShowAllStoresTopUps(true,"customer",2,true),true);
  assert.equal(shouldShowAllStoresTopUps(true,"customer",1,true),false);
  assert.equal(shouldShowAllStoresTopUps(true,"customer",2,false),false);
  const stores=[
    {id:"client",name:"Client store",topUpOwner:"client"},
    {id:"hub",name:"Hub store",topUpOwner:"shopee_hub"},
    {id:"approval",name:"Approval store",topUpOwner:"client_approval"},
    {id:"zero",name:"Zero spend",topUpOwner:"client"},
    {id:"missing",name:"Missing balance",topUpOwner:"client"},
  ];
  const rows=[...stores.map(store=>({store_id:store.id,performance_date:"2026-09-25",spend:store.id==="client"||store.id==="zero"?0:5})),
    {store_id:"forbidden",performance_date:"2026-09-25",spend:50},
    {store_id:"client",performance_date:"2026-09-24",spend:10}];
  const balances=new Map([
    ["client",{balance:20,balanceDate:"2026-09-25"}],
    ["hub",{balance:10,balanceDate:"2026-09-25"}],
    ["approval",{balance:0,balanceDate:"2026-09-25"}],
    ["zero",{balance:0,balanceDate:"2026-09-25"}],
  ]);
  const result=summarizeAllStoresTopUps(stores,rows,balances,"2026-09-27");
  assert.equal(result.totalStoreCount,5);
  assert.equal(result.assessedStoreCount,4);
  assert.ok(result.needsTopUp.every(row=>row.storeId!=="forbidden"));
  assert.deepEqual(result.needsTopUp.map(row=>[row.storeId,row.recommendedTopUp,row.actionLabel]),[
    ["approval",200,"Approve"],["client",150,"Top Up"],["hub",200,"Managed by Shopee Hub"],
  ].sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0]))));
  assert.ok(result.needsTopUp.every(row=>row.performanceDate==="2026-09-25"));
  assert.equal(summarizeAllStoresTopUps(stores,rows,new Map(),"2026-09-27").assessedStoreCount,0);
  assert.equal(summarizeAllStoresTopUps(stores,rows,new Map([["client",{balance:20,balanceDate:"2026-09-24"}]]),"2026-09-27").assessedStoreCount,0);
  assert.equal(summarizeAllStoresTopUps(stores,rows,balances,"2026-09-28").assessedStoreCount,0);
  assert.equal(summarizeAllStoresTopUps(stores,rows,new Map([["client",{balance:20,balanceDate:"2026-09-27"}]]),"2026-09-27").assessedStoreCount,1);
  const staleRows=rows.map(row=>({...row,performance_date:"2026-09-24"}));
  const currentBalances=new Map([...balances].map(([id,balance])=>[id,{...balance,balanceDate:"2026-09-27"}]));
  currentBalances.set("missing",{balance:75,balanceDate:"2026-09-27"});
  const watch=summarizeAllStoresTopUps(stores,staleRows,currentBalances,"2026-09-27");
  assert.equal(watch.assessedStoreCount,0);
  assert.deepEqual(watch.needsTopUp,[]);
  assert.deepEqual(watch.needsAttention.map(row=>[row.storeId,row.balance,row.performanceDate]),[
    ["approval",0,"2026-09-24"],["zero",0,"2026-09-24"],["hub",10,"2026-09-24"],["client",20,"2026-09-24"],
  ]);
  assert.equal(summarizeAllStoresTopUps(stores,staleRows,new Map(),"2026-09-27").needsAttention.length,0);
});

test("selected-store membership with no assignments does not fall back to directory stores", async () => {
  const route=await readFile(new URL("../app/api/dashboard/route.ts",import.meta.url),"utf8");
  assert.match(route,/membership\.storeAccessMode === "selected" && membership\.role !== "superadmin" \? \[\] : directoryStores\.map/);
  assert.match(route,/authorizedAdStoreIds\(visibleStores,selectedStore,canViewAdvertising\)/);
  assert.equal([...route.matchAll(/canViewAdvertising&&\(selectedStore\|\|showTopUps\)\?readSheetBalances\(\)/g)].length,2);
  assert.equal([...route.matchAll(/adBalance: canViewAdvertising && sheetBalance \? \{ \.\.\.sheetBalance/g)].length,2);
  assert.match(route,/withoutAdCampaigns\(latest\[0\] \?\? null, canViewAdvertising\)/);
});

test("empty FullAd date and custom range stay empty instead of selecting another day", async () => {
  const rows=[{date:"2026-09-20",spend:10},{date:"2026-09-24",spend:20}];
  const dates=["2026-09-24","2026-09-20"];
  assert.equal(selectedAdDateFor("2026-09-22",dates),"2026-09-22");
  assert.deepEqual(selectAdRows(rows,"date",{date:"2026-09-22"}),[]);
  assert.deepEqual(selectAdRows(rows,"range",{rangeStart:"2026-09-21",rangeEnd:"2026-09-23"}),[]);
  assert.equal(selectedAdDateFor("2026-10-01",dates),"2026-09-24");
  const page=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
  assert.match(page,/dailyAd \? \{[\s\S]*?\} : \{ \.\.\.balanceAds, \.\.\.emptyAdMetrics \}/);
});

test("All Stores overview uses live FullAd coverage and excludes undated campaign exports", async () => {
  const page=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
  assert.match(page,/useState<"mtd"\|"month"\|"date"\|"range">\("mtd"\)/);
  assert.match(page,/All Stores advertising overview/);
  assert.match(page,/coveredAdStores\} \/ \{data\.stores\.length/);
  assert.match(page,/stores with data in this period/);
  assert.match(page,/Last updated \{formatAdSyncTime\(data\.adPerformanceUpdatedAt\)\}/);
  assert.match(page,/timeZone:"Asia\/Kuala_Lumpur"/);
  assert.doesNotMatch(page,/FullAd|Imported campaign export/);
  const route=await readFile(new URL("../app/api/dashboard/route.ts",import.meta.url),"utf8");
  assert.match(route,/conversions,sold,synced_at/);
  assert.match(route,/adPerformanceUpdatedAt:adPerformance\.updatedAt/g);
  assert.match(page,/!allStoresSelected && <section className="campaign-section" aria-label="Individual Ads"/);
  assert.match(page,/Individual ad data is temporarily unavailable\./);
  assert.doesNotMatch(page,/adsData|adCampaigns|campaign-counts|visibleAdCampaigns|adStatusFilter/);
  const snapshots=await readFile(new URL("../app/store-snapshots.ts",import.meta.url),"utf8");
  assert.doesNotMatch(snapshots,/adCampaigns/);
  assert.match(route,/snapshot: withoutAdCampaigns\(latest\[0\] \?\? null, canViewAdvertising\)/);
  assert.match(route,/snapshot: snapshotPayload \? withoutAdCampaigns\(/);
  assert.doesNotMatch(page,/allStoresAdvertising|Latest campaign snapshot|Data snapshot/);
});
