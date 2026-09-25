import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildOverviewState } from "../app/overview-model.js";

test("a store without an imported snapshot has no fabricated Overview values or timestamp", () => {
  const state = buildOverviewState(null, null);
  assert.equal(state.payload, null);
  assert.equal(state.sourceLabel, "No dashboard snapshot available");
  assert.equal(state.asOf, null);
  assert.deepEqual(state.metrics.map(([, value, trend]) => [value, trend]), [
    ["—", ""], ["—", ""], ["—", ""], ["—", ""],
  ]);
});

test("a historical bundled snapshot keeps its source and original data cutoff", () => {
  const state = buildOverviewState({
    payload: {
      period: "1–16 Jul 2026",
      sourceUpdated: "17 Jul 2026, 3:55 am",
      overview: [["Valid Order Sales", "RM 54,350.94", "+6.81%"], ["Customers", "暂无数据", ""]],
    },
    importedAt: "",
  }, "bundled");
  assert.equal(state.sourceLabel, "Historical bundled snapshot");
  assert.equal(state.asOf, "17 Jul 2026, 3:55 am");
  assert.equal(state.period, "1–16 Jul 2026");
  assert.deepEqual(state.metrics.map(([, value, trend]) => [value, trend]), [
    ["RM 54,350.94", "+6.81%"], ["—", ""], ["—", ""], ["—", ""],
  ]);
});

test("an imported snapshot shows zero values and uses its import time when source time is absent", () => {
  const state = buildOverviewState({
    payload: { overview:[["Valid Orders", 0, "0%"]] },
    importedAt: "2026-09-24T09:00:00.000Z",
  }, "imported");
  assert.equal(state.sourceLabel, "Imported dashboard snapshot");
  assert.match(state.asOf, /24 Sept 2026.*5:00.*MYT/);
  assert.deepEqual(state.metrics[1], ["Valid Orders", "0", "0%"]);
});

test("Overview renders the sourced model without legacy sample KPI fallbacks", async () => {
  const [page, route] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/dashboard/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /buildOverviewState\(overviewSnapshot, overviewSource\)/);
  assert.match(page, /overviewState\.sourceLabel/);
  assert.match(page, /overviewState\.asOf/);
  assert.match(route, /snapshotSource: snapshotPayload \? "bundled" : null/);
  assert.match(route, /snapshotSource: latest\[0\] \? "imported" : null/);
  for (const sample of ["RM 18,711.82", "RM 120,000", "RM 1,486.20", "RM 422.60"]) {
    assert.doesNotMatch(page, new RegExp(sample.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
