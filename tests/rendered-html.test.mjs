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

test("sidebar contacts the selected project's Shopee Hub specialist", async () => {
  const [page, route, links] = await Promise.all([readFile(new URL("app/page.tsx", root), "utf8"), readFile(new URL("app/api/dashboard/route.ts", root), "utf8"), readFile(new URL("app/project-group-links.ts", root), "utf8")]);
  assert.match(page, /Contact Shopee Hub Specialist/);
  assert.match(page, /store\?\.contacts\.map/);
  assert.match(route, /contactsForStore\(name\)/);
  assert.match(links, /HF6D8uRYwGW37rTJ3wOYi6/);
  assert.match(links, /Mizino Placenta/);
  assert.match(links, /Mizino SlimPro/);
});

test("store selector follows the Link Directory store names", async () => {
  const [route, page] = await Promise.all([
    readFile(new URL("app/api/dashboard/route.ts", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
  ]);
  assert.match(route, /readLinkDirectory/);
  assert.match(route, /header\.indexOf\("Store Name"\)/);
  assert.match(route, /header\.indexOf\("Project Group Link"\)/);
  assert.match(route, /header\.indexOf\("Google Drive Link"\)/);
  assert.match(route, /directoryStores\.map/);
  assert.match(route, /tenantStores[\s\S]*\.map\(\(stored\)/);
  assert.match(route, /stored\.id !== "shopee-kata-care-malaysia"/);
  assert.match(route, /"shopee-kata-marine-malaysia": "Kata Skincare Malaysia"/);
  assert.match(route, /"shopee-kata-singapore": "Kata Skincare Singapore"/);
  assert.match(route, /cache: "no-store"/);
  assert.doesNotMatch(route, /connectedShopeeStoreNames\.map/);
  assert.match(page, /\{s\.name\} · \{s\.platform\.replace\("Shopee ", ""\)\}<\/option>/);
  assert.doesNotMatch(page, /62 connected Shopee stores/);
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
  const { calculateShopeePrice, commissionRateFor, COMMISSION_CATEGORIES, SERVICE_MODES } = await import("../app/price-calculator-model.js");
  const beauty = COMMISSION_CATEGORIES.findIndex(item=>item.name.startsWith("Beauty ›"));
  assert.equal(COMMISSION_CATEGORIES.length, 428);
  assert.ok(Math.abs(commissionRateFor(beauty,true,"","2026-08-13") - 12.96) < 0.000001);
  assert.ok(Math.abs(commissionRateFor(beauty,true,"","2026-08-14") - 16.2) < 0.000001);
  assert.ok(Math.abs(commissionRateFor(beauty,false,"","2026-08-14") - 18.36) < 0.000001);
  assert.equal(commissionRateFor(beauty,true,"9.25"), 9.25);
  assert.deepEqual(Object.keys(SERVICE_MODES), ["nonCampaign","campaign"]);
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

test("Shopee calculator accepts a user-adjusted markup rate", async () => {
  const { calculateShopeePrice } = await import("../app/price-calculator-model.js");
  const fees = {
    transaction:3.78, commission:12.96, service:5.94, serviceCap:108,
    preorder:2.14, isPreorder:false, platformSupport:0.54,
    shopeeVoucher:16, sellerVoucher:0, cofundVoucher:20,
    sellerShipping:0, facebookShipping:10, extraProfit:0,
  };
  const result = calculateShopeePrice({ facebookPrice:200 }, fees, 25);
  assert.equal(result.requiredPrice, 250);
  assert.equal(result.markupAmount, 50);
  assert.equal(result.markupRate, 25);
});

test("price calculator is available in navigation with all required outputs", async () => {
  const [page, calculator, packageControl, packageRoute, schema, migration, model] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/price-calculator.tsx", root), "utf8"),
    readFile(new URL("app/package-control.tsx", root), "utf8"),
    readFile(new URL("app/api/packages/route.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("drizzle/0003_zippy_bullseye.sql", root), "utf8"),
    readFile(new URL("app/price-calculator-model.js", root), "utf8"),
  ]);
  assert.match(page, /Price Calculator/);
  assert.match(page, /<PriceCalculator/);
  assert.match(page, /onCreatePackages/);
  assert.match(calculator, /Create All Ready/);
  assert.match(calculator, /readyPackages/);
  assert.match(packageControl, /prefillQueue/);
  assert.match(calculator, /顾客 Voucher 后价钱/);
  assert.match(calculator, /实际到手/);
  assert.match(calculator, /Transaction Fee/);
  assert.match(calculator, /Commission Fee/);
  assert.match(calculator, /Service Fee/);
  assert.match(calculator, /Product Category/);
  assert.match(calculator, /Cashback Program 已固定开启/);
  assert.match(calculator, /cashbackProgramme:true/);
  assert.doesNotMatch(calculator, /checked=\{onCashback\}/);
  assert.doesNotMatch(calculator, /Service Fee Scenario/);
  assert.match(calculator, /Custom Commission Fee/);
  assert.doesNotMatch(calculator, /No campaign service fee/);
  assert.match(model, /Essential Goods/);
  assert.match(model, /Cheese & Cheese Powder/);
  assert.match(calculator, /Capped at RM108/);
  assert.match(calculator, /2\.14%/);
  assert.match(calculator, /需要 Markup/);
  assert.match(calculator, /Pre-Order Listing/);
  assert.match(calculator, /result\.markupRate >= 30/);
  assert.match(calculator, /positive\(enteredMarkup\) >= 30/);
  assert.match(calculator, /if \(markupBlocked\(row,mode,result\)\) return/);
  assert.match(calculator, /Markup ≥ 30% · Cannot create/);
  assert.match(calculator, /markup-editor/);
  assert.match(model, /markupOverride/);
  assert.match(calculator, /Create Package/);
  assert.match(calculator, /SCENARIOS\.map/);
  assert.match(calculator, /Non-Campaign Day/);
  assert.match(calculator, /Campaign Day/);
  assert.match(calculator, /Shopee Voucher Disc\. \(%\)/);
  assert.match(calculator, /Co-Fund Voucher/);
  assert.doesNotMatch(calculator, /自动生效/);
  assert.match(packageControl, /Calculator package/);
  assert.match(packageControl, /prefillBatch/);
  assert.match(packageControl, /Selling Price 与 Calculator Settings 已全部保留/);
  assert.doesNotMatch(calculator, /showAdvanced/);
  assert.match(calculator, /suggestedShopeePrice:result\.requiredPrice/);
  assert.match(page, /setPackagePrefill/);
  assert.match(page, /setSection\("packages"\)/);
  assert.match(packageControl, /Calculator settings attached/);
  assert.match(packageControl, /Calculator snapshot/);
  assert.match(packageRoute, /calculatorSettings:body\.calculatorSettings/);
  assert.match(schema, /calculatorSettings/);
  assert.match(migration, /calculator_settings/);
});

test("advertising summary keeps one balance and removes low-priority cards", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  const summary = page.match(/<section className="metric-grid ads ad-primary-grid">([\s\S]*?)<\/section>/)?.[1] ?? "";
  assert.doesNotMatch(summary, /\["Ad Balance"/);
  assert.doesNotMatch(summary, /\["Conversion"/);
  assert.doesNotMatch(summary, /\["Sold Products"/);
  assert.match(summary, /\["Ad Sales"/);
  assert.match(summary, /\["ROAS"/);
  assert.match(summary, /\["ACOS"/);
  assert.match(summary, /\["Cost Per Conversion"/);
  assert.doesNotMatch(summary, /\["Ad Spend"/);
});

test("advertising supports date, month and custom range aggregation", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  assert.match(page, /<h2>Performance<\/h2>/);
  assert.match(page, /<option value="month">Month<\/option>/);
  assert.match(page, /<option value="date">Date<\/option>/);
  assert.match(page, /<option value="range">Custom range<\/option>/);
  assert.match(page, /row\.date\.startsWith\(selectedAdMonth\)/);
  assert.match(page, /row\.date >= selectedRangeStart && row\.date <= selectedRangeEnd/);
  assert.match(page, /periodSpendLabel/);
  assert.match(page, /ad-secondary-grid[\s\S]*\["CTR"[\s\S]*\["Conversion Rate"/);
  assert.doesNotMatch(page, /<section className="rule-grid">/);
  assert.match(css, /\.advertising-summary-stack\{display:grid;gap:18px\}/);
  assert.match(css, /\.ad-primary-grid,\.ad-secondary-grid\{grid-template-columns:repeat\(4[^}]*gap:18px/);
  assert.match(css, /page-title h2[^}]*text-transform:capitalize/);
});

test("client action center uses imported actions instead of sample fallback", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  assert.match(page, /data\?\.actions\?\.map/);
  assert.match(page, /managementActionToClientAction/);
  assert.match(page, /No client action needed/);
  assert.doesNotMatch(page, /driveActions\.length \|\| noSample \? \[\] : actionFallback/);
});
