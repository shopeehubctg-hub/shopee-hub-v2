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
    transaction:3.78, commission:12.96, service:5.94, platformSupport:0.54,
    shopeeVoucher:16, sellerVoucher:0, cofundVoucher:20,
    sellerShipping:0, facebookShipping:10, extraProfit:0,
  };
  const result = calculateShopeePrice({ facebookPrice:289 }, fees);
  assert.equal(result.valid, true);
  assert.ok(Math.abs(result.payout - 279) < 0.000001);
  assert.ok(Math.abs(result.requiredPrice - 368.6032074495603) < 0.000001);
  assert.ok(Math.abs(result.customerPrice - 292.8266942576306) < 0.000001);
  assert.ok(Math.abs(
    result.transactionFee + result.commissionFee + result.serviceFee -
    result.feeBase * 0.2268
  ) < 0.000001);
});

test("Shopee calculator supports extra profit and rejects impossible total fee rates", async () => {
  const { calculateShopeePrice } = await import("../app/price-calculator-model.js");
  const base = {
    transaction:3.78, commission:12.96, service:5.94, platformSupport:0.54,
    shopeeVoucher:16, sellerVoucher:0, cofundVoucher:20,
    sellerShipping:0, facebookShipping:10, extraProfit:25,
  };
  const profitable = calculateShopeePrice({ facebookPrice:358 }, base);
  assert.ok(Math.abs(profitable.payout - 373) < 0.000001);
  const invalid = calculateShopeePrice({ facebookPrice:358 }, {...base, service:90});
  assert.equal(invalid.valid, false);
  assert.equal(invalid.requiredPrice, 0);
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
  assert.match(calculator, /需要 Markup/);
});
