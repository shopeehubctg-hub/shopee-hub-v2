import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const customerUsers = sqliteTable("customer_users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  role: text("role", { enum: ["customer", "manager"] }).notNull().default("customer"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("customer_user_email_idx").on(table.email)]);

export const stores = sqliteTable("stores", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  platform: text("platform").notNull().default("Shopee"),
  bigSellerName: text("bigseller_name").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const dashboardSnapshots = sqliteTable("dashboard_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  storeId: text("store_id").notNull().references(() => stores.id),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  source: text("source").notNull().default("BigSeller"),
  payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  importedAt: text("imported_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const adBalances = sqliteTable("ad_balances", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  storeId: text("store_id").notNull().references(() => stores.id),
  sourceStoreName: text("source_store_name").notNull(),
  balanceCents: integer("balance_cents").notNull(),
  balanceDate: text("balance_date").notNull(),
  importedAt: text("imported_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("ad_balance_store_date_idx").on(table.storeId, table.balanceDate),
]);

export const managementActions = sqliteTable("management_actions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  storeId: text("store_id").notNull().references(() => stores.id),
  actionDate: text("action_date").notNull(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull(),
  impact: text("impact").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const inventorySkus = sqliteTable("inventory_skus", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  sku: text("sku").notNull(),
  name: text("name").notNull(),
  source: text("source").notNull().default("OXM"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  syncedAt: text("synced_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("inventory_sku_tenant_idx").on(table.tenantId, table.sku)]);

export const packages = sqliteTable("packages", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  storeId: text("store_id").notNull(),
  packageSku: text("package_sku").notNull(),
  name: text("name").notNull(),
  channel: text("channel").notNull().default("Shopee"),
  market: text("market").notNull().default("MY"),
  status: text("status", { enum: ["draft", "review", "approved", "scheduled", "active", "expired"] }).notNull().default("draft"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("package_sku_store_idx").on(table.storeId, table.packageSku)]);

export const packageVersions = sqliteTable("package_versions", {
  id: text("id").primaryKey(),
  packageId: text("package_id").notNull().references(() => packages.id),
  version: integer("version").notNull(),
  components: text("components", { mode: "json" }).$type<Array<{ inventorySku: string; name: string; quantity: number; kind: "product" | "gift" }>>().notNull(),
  promotionType: text("promotion_type", { enum: ["monthly", "custom"] }).notNull().default("monthly"),
  addedComponents: text("added_components", { mode: "json" }).$type<Array<{ inventorySku: string; name: string; quantity: number; kind: "product" | "gift" }>>().notNull().default(sql`'[]'`),
  removedComponents: text("removed_components", { mode: "json" }).$type<Array<{ inventorySku: string; name: string; quantity: number; kind: "product" | "gift" }>>().notNull().default(sql`'[]'`),
  sheetSyncStatus: text("sheet_sync_status", { enum: ["pending", "synced", "failed"] }).notNull().default("pending"),
  calculatorSettings: text("calculator_settings", { mode: "json" }).$type<Record<string, unknown> | null>(),
  changeNote: text("change_note").notNull().default("Initial version"),
  effectiveFrom: text("effective_from").notNull(),
  effectiveTo: text("effective_to"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("package_version_idx").on(table.packageId, table.version)]);

export const packagePlatformSkus = sqliteTable("package_platform_skus", {
  id: text("id").primaryKey(),
  packageId: text("package_id").notNull().references(() => packages.id),
  versionId: text("version_id").notNull().references(() => packageVersions.id),
  storeId: text("store_id").notNull(),
  platform: text("platform", { enum: ["Shopee", "Lazada", "TikTok Shop"] }).notNull(),
  packageSku: text("package_sku").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("package_platform_version_idx").on(table.versionId, table.platform),
]);

export const packagePrices = sqliteTable("package_prices", {
  id: text("id").primaryKey(),
  packageId: text("package_id").notNull().references(() => packages.id),
  versionId: text("version_id").notNull().references(() => packageVersions.id),
  currency: text("currency").notNull().default("MYR"),
  market: text("market", { enum: ["MY", "SG"] }).notNull().default("MY"),
  priceType: text("price_type", { enum: ["non_campaign", "campaign"] }).notNull().default("campaign"),
  promotionType: text("promotion_type", { enum: ["monthly", "custom"] }).notNull().default("custom"),
  originalPrice: integer("original_price").notNull(),
  sellingPrice: integer("selling_price").notNull(),
  effectiveFrom: text("effective_from").notNull(),
  effectiveTo: text("effective_to"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("package_price_version_market_type_idx").on(table.versionId, table.market, table.priceType)]);

export const packageAuditLog = sqliteTable("package_audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  packageId: text("package_id").notNull().references(() => packages.id),
  action: text("action").notNull(),
  detail: text("detail").notNull(),
  actor: text("actor").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const designReviews = sqliteTable("design_reviews", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  storeId: text("store_id"),
  submittedBy: text("submitted_by").notNull(),
  status: text("status", { enum: ["technical_failed", "awaiting_review"] }).notNull(),
  summary: text("summary", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const designReviewImages = sqliteTable("design_review_images", {
  id: text("id").primaryKey(),
  reviewId: text("review_id").notNull().references(() => designReviews.id),
  fileName: text("file_name").notNull(),
  objectKey: text("object_key").notNull(),
  contentType: text("content_type").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  byteSize: integer("byte_size").notNull(),
  detectedCategory: text("detected_category").notNull(),
  result: text("result", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
