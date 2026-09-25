import assert from "node:assert/strict";
import test from "node:test";
import { cents, readPages, summarizeMonth } from "../scripts/release-qc-live.mjs";

test("live gate reads past the first REST page", async () => {
  const offsets = [];
  const fetcher = async url => {
    offsets.push(Number(url.searchParams.get("offset")));
    const data = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const offset = Number(url.searchParams.get("offset"));
    const limit = Number(url.searchParams.get("limit"));
    return { ok: true, json: async () => data.slice(offset, offset + limit) };
  };
  const rows = await readPages("https://example.supabase.co", "stores", { select: "id" }, {}, fetcher, 2);
  assert.deepEqual(rows.map(row => row.id), ["a", "b", "c"]);
  assert.deepEqual(offsets, [0, 2]);
});

test("live gate totals cents exactly and counts only the selected month and stores", () => {
  const rows = [
    { store_id: "a", performance_date: "2026-09-24", spend: "0.10", sales: "1.10", views: 5, clicks: 2, conversions: 1, sold: 1 },
    { store_id: "b", performance_date: "2026-09-24", spend: "0.20", sales: "2.20", views: 7, clicks: 3, conversions: 2, sold: 2 },
    { store_id: "a", performance_date: "2026-08-31", spend: "9.99", sales: "99.99", views: 99, clicks: 99, conversions: 99, sold: 99 },
  ];
  const summary = summarizeMonth(rows, "2026-09-24", new Set(["a", "b", "c"]));
  assert.equal(summary.spendCents, 30n);
  assert.equal(summary.salesCents, 330n);
  assert.deepEqual([summary.rows, summary.coveredStores, summary.accessibleStores], [2, 2, 3]);
  assert.deepEqual([summary.views, summary.clicks, summary.conversions, summary.sold], [12n, 5n, 3n, 3n]);
  assert.equal(cents("64610.31"), 6461031n);
});
