import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("package control is wired into the command center", async () => {
  const [page, component] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/package-control.tsx", root), "utf8"),
  ]);
  assert.match(page, /Packages & Pricing/);
  assert.match(page, /<PackageControl/);
  assert.match(component, /OXM PACKAGE CONTROL/);
  assert.match(component, /Migrate & edit/);
  assert.match(component, /Create next version/);
  assert.match(component, /Selling platforms/);
  assert.match(component, /Shopee/);
  assert.match(component, /Lazada/);
  assert.match(component, /TikTok Shop/);
  assert.match(component, /Full month/);
  assert.match(component, /Custom dates/);
  assert.match(component, /Google Sheet History/);
});

test("package API enforces platform SKUs and persists component history", async () => {
  const [route, schema, baseMigration, platformMigration] = await Promise.all([
    readFile(new URL("app/api/packages/route.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("drizzle/0001_orange_ultron.sql", root), "utf8"),
    readFile(new URL("drizzle/0002_green_blink.sql", root), "utf8"),
  ]);
  assert.match(route, /nextVersion/);
  assert.match(route, /packageAuditLog/);
  assert.match(route, /selling price cannot exceed original price/);
  assert.match(route, /Each platform must use a different Package SKU/);
  assert.match(route, /componentDiff/);
  assert.match(route, /syncHistoryToGoogleSheet/);
  assert.match(schema, /packageVersions/);
  assert.match(schema, /packagePrices/);
  assert.match(schema, /packagePlatformSkus/);
  assert.match(schema, /addedComponents/);
  assert.match(schema, /removedComponents/);
  assert.match(baseMigration, /CREATE TABLE `package_versions`/);
  assert.match(platformMigration, /CREATE TABLE `package_platform_skus`/);
});

test("Shopee calculator reverse-solves listing price and itemized fees", async () => {
  const { calculateShopeePrice } = await import("../app/price-calculator-model.js");
  const fees = {
    transaction:3.78, commission:12.96, service:5.94, serviceCap:108,
    preorder:2.14, isPreorder:false, platformSupport:0.54,
    shopeeVoucher:16, sellerVoucher:0, cofundVoucher:20,
    sellerShipping:0, facebookShipping:10, extraProfit:0,
  };
  const result = calculateShopeePrice({ facebookPrice:289 }, fees);
  assert.equal(result.valid, true);
  assert.ok(Math.abs(result.payout - 279) < 0.000001);
  assert.ok(Math.abs(result.requiredPrice - 368.6032074495603) < 0.000001);
  assert.ok(Math.abs(result.customerPrice - 292.8266942576306) < 0.000001);
  assert.ok(Math.abs(result.transactionFee - result.feeBase * 0.0378) < 0.000001);
  assert.ok(Math.abs(result.commissionFee - result.feeBase * 0.1296) < 0.000001);
  assert.ok(Math.abs(result.serviceFee - result.feeBase * 0.0594) < 0.000001);
});

test("Shopee calculator applies category SST, pre-order fee and RM108 service cap", async () => {
  const { calculateShopeePrice, commissionRateFor } = await import("../app/price-calculator-model.js");
  assert.ok(Math.abs(commissionRateFor(28,true) - 12.96) < 0.000001);
  assert.ok(Math.abs(commissionRateFor(28,false) - 18.36) < 0.000001);
  const base = {
    transaction:3.78, commission:12.96, service:8.1, serviceCap:108,
    preorder:2.14, isPreorder:true, platformSupport:0.54,
    shopeeVoucher:16, sellerVoucher:0, cofundVoucher:20,
    sellerShipping:0, facebookShipping:10, extraProfit:25,
  };
  const result = calculateShopeePrice({ facebookPrice:2000 }, base);
  assert.ok(Math.abs(result.payout - 2015) < 0.000001);
  assert.equal(result.serviceFee, 108);
  assert.equal(result.serviceCapped, true);
  assert.ok(Math.abs(result.preorderFee - result.feeBase * 0.0214) < 0.000001);
});

test("price calculator is available in navigation with all required outputs", async () => {
  const [page, calculator] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/price-calculator.tsx", root), "utf8"),
  ]);
  assert.match(page, /Price Calculator/);
  assert.match(page, /<PriceCalculator/);
  assert.match(calculator, /顾客 Voucher 后价钱/);
  assert.match(calculator, /实际到手/);
  assert.match(calculator, /Transaction Fee/);
  assert.match(calculator, /Commission Fee/);
  assert.match(calculator, /Service Fee/);
  assert.match(calculator, /Product Category/);
  assert.match(calculator, /Cashback Programme/);
  assert.match(calculator, /Capped at RM108/);
  assert.match(calculator, /2\.14%/);
  assert.match(calculator, /需要 Markup/);
});
