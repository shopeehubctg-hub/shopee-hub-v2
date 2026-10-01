import assert from "node:assert/strict";
import test from "node:test";
import { packagePriceDisplay } from "../app/package-price-display.ts";

const normal = { market: "MY", priceType: "non_campaign", originalPrice: 476, sellingPrice: 456.47, effectiveFrom: "2026-10-03", effectiveTo: "2026-10-31" };
const campaigns = [
  ["2026-10-24", "2026-10-25"],
  ["2026-10-08", "2026-10-10"],
  ["2026-10-14", "2026-10-15"],
].map(([effectiveFrom, effectiveTo]) => ({ ...normal, priceType: "campaign", effectiveFrom, effectiveTo }));

test("same price on campaign and normal days is one summary with every configured date", () => {
  const display = packagePriceDisplay([...campaigns, normal]);
  assert.equal(display.length, 1);
  assert.equal(display[0].sellingPrice, 456.47);
  assert.deepEqual(display[0].periods, [
    "Non-Campaign: 2026-10-03 → 2026-10-31",
    "Campaign: 2026-10-08 → 2026-10-10",
    "Campaign: 2026-10-14 → 2026-10-15",
    "Campaign: 2026-10-24 → 2026-10-25",
  ]);
});

test("different campaign prices retain distinct rows and date-specific keys", () => {
  const display = packagePriceDisplay([normal, ...campaigns.map((line, index) => ({ ...line, sellingPrice: 460 + index }))]);
  assert.equal(display.length, 4);
  assert.equal(new Set(display.map(line => line.key)).size, 4);
  assert.deepEqual(display.map(line => line.periods[0]), [
    "2026-10-03 → 2026-10-31",
    "2026-10-08 → 2026-10-10",
    "2026-10-14 → 2026-10-15",
    "2026-10-24 → 2026-10-25",
  ]);
});
