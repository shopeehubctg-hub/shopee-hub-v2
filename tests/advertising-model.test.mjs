import assert from "node:assert/strict";
import test from "node:test";
import { buildAdvertisingFunds, buildTopUpAction } from "../app/advertising-model.js";

test("RM49.99 triggers the low balance rule while RM50 does not", () => {
  assert.equal(buildAdvertisingFunds({ balance:49.99, averageDailySpend30d:10 }).lowBalance, true);
  assert.equal(buildAdvertisingFunds({ balance:50, averageDailySpend30d:10 }).lowBalance, false);
});

test("top-up covers 30 days, adds 10% and rounds to RM50", () => {
  const funds = buildAdvertisingFunds({ balance:35.95, averageDailySpend30d:3.06 });
  assert.equal(funds.recommendedTopUp, 100);
  assert.ok(funds.runwayDays > 11 && funds.runwayDays < 12);
});

test("Shopee Hub-owned and delayed records do not create client actions", () => {
  const owned = buildAdvertisingFunds({ balance:20, averageDailySpend30d:5, topUpOwner:"shopee_hub" });
  assert.equal(buildTopUpAction(owned, "Store"), null);
  const delayed = buildAdvertisingFunds({ balance:null, averageDailySpend30d:null });
  assert.equal(delayed.syncStatus, "delayed");
  assert.equal(buildTopUpAction(delayed, "Store"), null);
});

test("approval flag creates an approval action", () => {
  const funds = buildAdvertisingFunds({ balance:20, averageDailySpend30d:5, approvalRequired:true });
  assert.equal(buildTopUpAction(funds, "Store").type, "Approval");
});
