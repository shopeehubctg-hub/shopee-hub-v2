import assert from "node:assert/strict";
import test from "node:test";
import { assessAdsFreshness } from "../app/ads-freshness.js";

test("morning check allows the afternoon source import", () => {
  const result = assessAdsFreshness({
    now: new Date("2026-09-25T02:00:00Z"), latestBusinessDate: "2026-09-23",
    lastWriteAt: "2026-09-25T01:01:00Z", storeCount: 43, coveredStoreCount: 42,
  });
  assert.equal(result.expectedBusinessDate, "2026-09-23");
  assert.equal(result.businessDateStatus, "current");
  assert.equal(result.writeStatus, "recent");
  assert.deepEqual(result.coverage, { storeCount: 43, coveredStoreCount: 42, missingStoreCount: 1 });
});

test("after the late trigger window, yesterday must be present", () => {
  const result = assessAdsFreshness({
    now: new Date("2026-09-25T10:00:00Z"), latestBusinessDate: "2026-09-23",
    lastWriteAt: "2026-09-25T01:01:00Z", storeCount: 43, coveredStoreCount: 42,
  });
  assert.equal(result.expectedBusinessDate, "2026-09-24");
  assert.equal(result.businessDateStatus, "delayed");
  assert.equal(result.writeStatus, "delayed");
});

test("a manual backfill after the afternoon window is observable", () => {
  const result = assessAdsFreshness({
    now: new Date("2026-09-25T13:15:00Z"), latestBusinessDate: "2026-09-24",
    lastWriteAt: "2026-09-25T13:11:00Z", storeCount: 43, coveredStoreCount: 42,
  });
  assert.equal(result.businessDateStatus, "current");
  assert.equal(result.writeStatus, "recent");
});

test("09:20 Kuala Lumpur switches to the morning write window", () => {
  const input = {
    latestBusinessDate: "2026-09-23", lastWriteAt: "2026-09-24T09:01:00Z",
    storeCount: 43, coveredStoreCount: 42,
  };
  const before = assessAdsFreshness({ ...input, now: new Date("2026-09-25T01:19:00Z") });
  const after = assessAdsFreshness({ ...input, now: new Date("2026-09-25T01:20:00Z") });
  assert.equal(before.writeStatus, "recent");
  assert.equal(after.writeStatus, "delayed");
  assert.equal(after.expectedWriteBy, "2026-09-25T09:20:00+08:00");
});

test("17:20 Kuala Lumpur switches to yesterday's business date", () => {
  const input = {
    latestBusinessDate: "2026-09-23", lastWriteAt: "2026-09-25T01:01:00Z",
    storeCount: 43, coveredStoreCount: 42,
  };
  const before = assessAdsFreshness({ ...input, now: new Date("2026-09-25T09:19:00Z") });
  const after = assessAdsFreshness({ ...input, now: new Date("2026-09-25T09:20:00Z") });
  assert.equal(before.expectedBusinessDate, "2026-09-23");
  assert.equal(before.businessDateStatus, "current");
  assert.equal(after.expectedBusinessDate, "2026-09-24");
  assert.equal(after.businessDateStatus, "delayed");
});

test("a future-dated source row cannot make the feed look current", () => {
  const result = assessAdsFreshness({
    now: new Date("2026-09-25T10:00:00Z"), latestBusinessDate: "2026-09-26",
    lastWriteAt: "2026-09-25T09:01:00Z", storeCount: 43, coveredStoreCount: 42,
  });
  assert.equal(result.businessDateStatus, "future_date");
});
