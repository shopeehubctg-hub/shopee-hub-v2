import assert from "node:assert/strict";
import test from "node:test";
import { aggregateAdPerformanceByDate, aggregateSelectedAdRows, authorizedAdStoreIds, selectAdRows, selectedAdDateFor } from "../app/ad-performance.js";
import { readFile } from "node:fs/promises";

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

test("selected-store membership with no assignments does not fall back to directory stores", async () => {
  const route=await readFile(new URL("../app/api/dashboard/route.ts",import.meta.url),"utf8");
  assert.match(route,/membership\.storeAccessMode === "selected" && membership\.role !== "superadmin" \? \[\] : directoryStores\.map/);
  assert.match(route,/authorizedAdStoreIds\(visibleStores,selectedStore,enabledModules\.includes\("advertising"\)\)/);
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
  assert.match(page,/FullAd data through \{formatAdDate\(latestAdDate\)\}/);
  assert.match(page,/!allStoresSelected && adCampaigns\.length > 0 && <section className="campaign-section"/);
  assert.doesNotMatch(page,/allStoresAdvertising|Latest campaign snapshot|Data snapshot/);
});
