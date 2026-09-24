import assert from "node:assert/strict";
import test from "node:test";
import { aggregateAdPerformanceByDate, authorizedAdStoreIds } from "../app/ad-performance.js";
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
