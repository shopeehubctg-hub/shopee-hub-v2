import assert from "node:assert/strict";
import test from "node:test";

import { productRowsFromCsv, sourceShopNameFor } from "../app/product-catalog.ts";
import { voucherPresetFor } from "../app/voucher-presets.js";

test("Supu resolves to the product sheet's store name", () => {
  const csv = 'Shop Name,Product Name,Item ID,最latest的 Category,8 月的 commission fee,Main Product\n"SUPU • 食补",Product A,123,Food,3%,TRUE';
  const products = productRowsFromCsv(csv).filter(row => row.shopName === sourceShopNameFor("Supu"));
  assert.equal(products.length, 1);
  assert.equal(products[0].itemId, "123");
  assert.equal(products[0].commissionFeeRate, 3);
});

test("Supu has both voucher rates from the Final sheet", () => {
  assert.deepEqual(voucherPresetFor("Supu"), { store:"Supu", normal:9, campaign:20, available:true });
  assert.deepEqual(voucherPresetFor("SUPU • 食补"), voucherPresetFor("Supu"));
});
