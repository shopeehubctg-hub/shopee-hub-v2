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
