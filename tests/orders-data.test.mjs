import assert from "node:assert/strict";
import test from "node:test";
import { getOrdersData } from "../app/orders-data.js";

test("missing order import has no orders, counts, or update time", () => {
  assert.deepEqual(getOrdersData(null), { hasData:false, orders:[], summary:null, dashboardUpdatedAt:null });
  assert.deepEqual(getOrdersData({ payload:{ advertising:{ spend:100 } }, importedAt:"2026-09-25" }), {
    hasData:false, orders:[], summary:null, dashboardUpdatedAt:null,
  });
});

test("an imported empty order list is a known zero, not missing data", () => {
  assert.deepEqual(getOrdersData({ payload:{ orders:[], orderSummary:{ today:0, expiringToday:0, expired:0 } }, importedAt:"2026-09-25" }), {
    hasData:true,
    orders:[],
    summary:{ today:0, expiringToday:0, expired:0 },
    dashboardUpdatedAt:"2026-09-25",
  });
});

test("imported order rows and their snapshot timestamp remain available", () => {
  const orders = [{ id:"real-order", status:"Urgent" }];
  assert.deepEqual(getOrdersData({ payload:{ orders, sourceUpdated:"24 Sep 2026, 9:00 am" }, importedAt:"2026-09-25" }), {
    hasData:true, orders, summary:null, dashboardUpdatedAt:"24 Sep 2026, 9:00 am",
  });
});
