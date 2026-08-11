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
  assert.match(component, /Migrate & Edit/);
  assert.match(component, /Create Next Version/);
  assert.match(component, /Add Listing/);
  assert.match(component, /Multi-Select/);
  assert.match(component, /type="checkbox" checked=\{form\.campaign\.campaignEvents\.includes/);
  assert.match(component, /Shopee/);
  assert.match(component, /Lazada/);
  assert.match(component, /TikTok Shop/);
  assert.match(component, /Full Month/);
  assert.match(component, /Custom Dates/);
  assert.match(component, /Non-Campaign/);
  assert.match(component, /Campaign/);
  assert.match(component, /D-Day/);
  assert.match(component, /Mid Month Madness/);
  assert.match(component, /Payday/);
  assert.match(component, /campaignDates/);
  assert.match(component, /nonCampaignOriginal:""/);
  assert.match(component, /Selling Markets/);
  assert.match(component, /Original Price <em>\*<\/em>/);
  assert.match(component, /Original Price equals Selling Price/);
  assert.match(component, /Add Item/);
  assert.doesNotMatch(component, /<option value="gift">Gift<\/option>/);
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

test("package API enforces listing SKUs and persists component history", async () => {
  const [route, schema, baseMigration, platformMigration, pricingMigration, multiListingMigration] = await Promise.all([
    readFile(new URL("app/api/packages/route.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("drizzle/0001_orange_ultron.sql", root), "utf8"),
    readFile(new URL("drizzle/0002_green_blink.sql", root), "utf8"),
    readFile(new URL("drizzle/0005_package_scenario_pricing.sql", root), "utf8"),
    readFile(new URL("drizzle/0007_first_ultron.sql", root), "utf8"),
  ]);
  assert.match(route, /nextVersion/);
  assert.match(route, /packageAuditLog/);
  assert.match(route, /Selling Price cannot exceed it/);
  assert.match(route, /priceType.*"non_campaign"/);
  assert.match(route, /priceType.*"campaign"/);
  assert.match(route, /Every listing SKU must be different/);
  assert.match(route, /componentDiff/);
  assert.match(route, /syncHistoryToGoogleSheet/);
  assert.match(schema, /packageVersions/);
  assert.match(schema, /packagePrices/);
  assert.match(schema, /packagePlatformSkus/);
  assert.match(schema, /priceType/);
  assert.match(schema, /addedComponents/);
  assert.match(schema, /removedComponents/);
  assert.match(baseMigration, /CREATE TABLE `package_versions`/);
  assert.match(platformMigration, /CREATE TABLE `package_platform_skus`/);
  assert.match(pricingMigration, /ADD `market`/);
  assert.match(pricingMigration, /ADD `price_type`/);
  assert.match(multiListingMigration, /package_platform_version_sku_idx/);
  assert.match(multiListingMigration, /package_price_version_market_type_period_idx/);
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

test("Shopee calculator reverse-solves a customer-price target", async () => {
  const { calculateShopeePriceForCustomerTarget } = await import("../app/price-calculator-model.js");
  const fees = {
    transaction:3.78, commission:12.96, service:5.94, serviceCap:108,
    preorder:2.14, isPreorder:false, platformSupport:0.54,
    shopeeVoucher:20, sellerVoucher:0, cofundVoucher:20,
    sellerShipping:0, facebookShipping:10, extraProfit:0,
  };
  const result = calculateShopeePriceForCustomerTarget({facebookPrice:289},fees,279);
  assert.equal(result.valid,true);
  assert.ok(Math.abs(result.customerPrice-279)<0.000001);
  assert.ok(Math.abs(result.requiredPrice-368.75)<0.000001);
});

test("price calculator is available in navigation with all required outputs", async () => {
  const [page, calculator, packageControl, packageRoute, schema, migration, model, voucherPresets] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/price-calculator.tsx", root), "utf8"),
    readFile(new URL("app/package-control.tsx", root), "utf8"),
    readFile(new URL("app/api/packages/route.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("drizzle/0003_zippy_bullseye.sql", root), "utf8"),
    readFile(new URL("app/price-calculator-model.js", root), "utf8"),
    readFile(new URL("app/voucher-presets.js", root), "utf8"),
  ]);
  assert.match(page, /Price Calculator/);
  assert.match(page, /<PriceCalculator/);
  assert.match(page, /onCreatePackages/);
  assert.match(calculator, /Create All Ready/);
  assert.match(calculator, /readyPackages/);
  assert.match(packageControl, /prefillQueue/);
  assert.match(calculator, /Customer Price/);
  assert.match(calculator, /Take-Home/);
  assert.match(calculator, /Transaction Fee/);
  assert.match(calculator, /Commission Fee/);
  assert.match(calculator, /Service Fee/);
  assert.match(calculator, /Product Category/);
  assert.match(calculator, /Cashback Program ON/);
  assert.match(calculator, /cashbackProgramme:true/);
  assert.doesNotMatch(calculator, /checked=\{onCashback\}/);
  assert.doesNotMatch(calculator, /Service Fee Scenario/);
  assert.match(calculator, /Custom Commission Fee/);
  assert.doesNotMatch(calculator, /No campaign service fee/);
  assert.match(model, /Essential Goods/);
  assert.match(model, /Cheese & Cheese Powder/);
  assert.match(calculator, /Capped at RM108/);
  assert.match(calculator, /2\.14%/);
  assert.match(calculator, /Markup/);
  assert.match(calculator, /Pre-Order Listing/);
  assert.doesNotMatch(calculator, /markupBlocked/);
  assert.doesNotMatch(calculator, /Markup ≥ 30% · Cannot create/);
  assert.match(calculator, /markup-editor/);
  assert.match(model, /markupOverride/);
  assert.match(calculator, /Create Package/);
  assert.match(calculator, /SCENARIOS\.map/);
  assert.match(calculator, /Non-Campaign Day/);
  assert.match(calculator, /Campaign Day/);
  assert.doesNotMatch(calculator, /Shopee Voucher Disc\. \(%\)/);
  assert.match(calculator, /Shopee Voucher %/);
  assert.match(calculator, /voucherRates\[mode\]/);
  assert.match(calculator, /voucher-hero-inputs/);
  assert.match(calculator, /voucherRates\.nonCampaign/);
  assert.match(calculator, /voucherRates\.campaign/);
  assert.match(calculator, /Total Shopee Fee %/);
  assert.match(calculator, /Select Category for Actual Commission Fee/);
  assert.doesNotMatch(calculator, /其他计算设定/);
  assert.doesNotMatch(calculator, /Voucher preset 根据/);
  assert.match(voucherPresets, /Last Month Avg\./);
  assert.match(calculator, /<h2>Markup Calculator<\/h2>/);
  assert.doesNotMatch(calculator, /scenario-voucher/);
  assert.doesNotMatch(calculator, /Campaign Day 最高百分比收费/);
  assert.match(page, /storeName=\{allStoresSelected/);
  assert.match(voucherPresets, /Rounded Up Buffer/);
  assert.match(voucherPresets, /Mizino Premium/);
  assert.match(voucherPresets, /normal:13,campaign:20/);
  assert.match(calculator, /CoFund Voucher/);
  assert.doesNotMatch(calculator, /Extra Profit Target/);
  assert.match(calculator, /SPayLater/);
  assert.match(calculator, /fees\.isSpayLater\?4\.86:3\.78/);
  assert.match(calculator, /editableNumber/);
  assert.match(calculator, /Meta Take-Home/);
  assert.match(calculator, /positive\(row\.facebookPrice\)-positive\(fees\.facebookShipping\)/);
  assert.match(calculator, /Main Product Qty/);
  assert.match(calculator, /Meta Unit Price/);
  assert.match(calculator, /Customer Price ÷ Qty/);
  assert.match(calculator, /PACKAGE PRICE LADDER REVIEW/);
  assert.match(calculator, /ladderReviews\.length>0/);
  assert.match(calculator, /Check Final Packages & Prices/);
  assert.match(calculator, /Confirm & Continue/);
  assert.match(calculator, /setPendingConfirmation/);
  assert.match(packageControl, /Customer Unit Price/);
  assert.match(calculator, /Match Meta Take-Home/);
  assert.match(calculator, /Match Meta Customer Price/);
  assert.match(calculator, /Lower Than Meta/);
  assert.match(calculator, /discountUnit/);
  assert.match(calculator, /Markup \(RM\)/);
  assert.match(calculator, /Meta Take-Home/);
  assert.doesNotMatch(calculator, />Facebook/);
  assert.match(calculator, /customer-price-editor/);
  assert.match(calculator, /updateCustomerTarget/);
  assert.match(calculator, /Listing Price/);
  assert.match(page, /sidebarCollapsed/);
  assert.match(page, /sidebar-toggle/);
  assert.doesNotMatch(calculator, /[\p{Script=Han}]/u);
  assert.doesNotMatch(packageControl, /[\p{Script=Han}]/u);
  assert.match(calculator, /onWheelCapture/);
  assert.match(calculator, /package-sheet-head/);
  assert.match(calculator, /ladder-sheet/);
  assert.doesNotMatch(calculator, /自动生效/);
  assert.match(packageControl, /Calculator Package/);
  assert.match(packageControl, /prefillBatch/);
  assert.match(packageControl, /Non-Campaign and Campaign prices are grouped/);
  assert.doesNotMatch(calculator, /showAdvanced/);
  assert.match(calculator, /suggestedShopeePrice:result\.requiredPrice/);
  assert.match(page, /openPackageDraft/);
  assert.match(page, /window\.open/);
  assert.match(page, /packageDraft/);
  assert.match(packageControl, /standaloneCreate/);
  assert.match(packageControl, /Calculator Settings Attached/);
  assert.match(packageControl, /Calculator Snapshot/);
  assert.match(packageRoute, /calculatorSettings:body\.calculatorSettings/);
  assert.match(schema, /calculatorSettings/);
  assert.match(migration, /calculator_settings/);
});

test("PPU and price ladder calculations use valid main-product quantities", async () => {
  const { calculatePricePerUnit, reviewPriceLadder } = await import("../app/price-calculator-model.js");
  assert.equal(calculatePricePerUnit(289, 2), 144.5);
  assert.equal(calculatePricePerUnit(289, 0), null);
  assert.equal(calculatePricePerUnit(289, ""), null);
  const review = reviewPriceLadder([
    {name:"Large",quantity:4,ppu:70},
    {name:"Small",quantity:1,ppu:80},
    {name:"Medium",quantity:2,ppu:75},
    {name:"Missing",quantity:0,ppu:null},
  ]);
  assert.deepEqual(review.map(item=>[item.name,item.label]),[["Small","Base"],["Medium","Better Value"],["Large","Better Value"]]);
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
