import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone:true, mode:"string" }).notNull().defaultNow();

export const tenants = pgTable("tenants", {
  id:text("id").primaryKey(), name:text("name").notNull(), active:boolean("active").notNull().default(true), createdAt:createdAt(),
});

export const customerUsers = pgTable("customer_users", {
  id:bigserial("id", { mode:"number" }).primaryKey(), email:text("email").notNull(),
  tenantId:text("tenant_id").notNull().references(()=>tenants.id),
  displayName:text("display_name"), active:boolean("active").notNull().default(true),
  role:text("role", { enum:["customer","manager","superadmin"] }).notNull().default("customer"),
  moduleAccessMode:text("module_access_mode", { enum:["role_default","custom"] }).notNull().default("role_default"),
  storeAccessMode:text("store_access_mode", { enum:["all","selected"] }).notNull().default("all"),
  createdAt:createdAt(),
}, table=>[uniqueIndex("customer_user_email_idx").on(sql`lower(${table.email})`),index("customer_users_tenant_id_idx").on(table.tenantId)]);

export const tenantModulePermissions = pgTable("tenant_module_permissions", {
  id:bigserial("id", { mode:"number" }).primaryKey(),
  tenantId:text("tenant_id").notNull().references(()=>tenants.id,{onDelete:"cascade"}),
  moduleId:text("module_id").notNull(),
  enabled:boolean("enabled").notNull().default(true),
  updatedBy:text("updated_by"),
  updatedAt:timestamp("updated_at", { withTimezone:true, mode:"string" }).notNull().defaultNow(),
}, table=>[
  uniqueIndex("tenant_module_permission_idx").on(table.tenantId,table.moduleId),
  index("tenant_module_permissions_tenant_idx").on(table.tenantId),
]);

export const userModulePermissions = pgTable("user_module_permissions", {
  id:bigserial("id", { mode:"number" }).primaryKey(),
  userId:bigint("user_id", { mode:"number" }).notNull().references(()=>customerUsers.id,{onDelete:"cascade"}),
  moduleId:text("module_id").notNull(), enabled:boolean("enabled").notNull().default(true),
  updatedAt:timestamp("updated_at", { withTimezone:true, mode:"string" }).notNull().defaultNow(),
}, table=>[uniqueIndex("user_module_permission_idx").on(table.userId,table.moduleId),index("user_module_permissions_user_idx").on(table.userId)]);

export const stores = pgTable("stores", {
  id:text("id").primaryKey(), tenantId:text("tenant_id").notNull().references(()=>tenants.id), name:text("name").notNull(),
  platform:text("platform").notNull().default("Shopee"), bigSellerName:text("bigseller_name").notNull(), createdAt:createdAt(),
}, table=>[index("stores_tenant_id_idx").on(table.tenantId)]);

export const userStoreAccess = pgTable("user_store_access", {
  id:bigserial("id", { mode:"number" }).primaryKey(),
  userId:bigint("user_id", { mode:"number" }).notNull().references(()=>customerUsers.id,{onDelete:"cascade"}),
  storeId:text("store_id").notNull().references(()=>stores.id,{onDelete:"cascade"}),
  createdAt:createdAt(),
}, table=>[uniqueIndex("user_store_access_idx").on(table.userId,table.storeId),index("user_store_access_user_idx").on(table.userId)]);

export const dashboardSnapshots = pgTable("dashboard_snapshots", {
  id:bigserial("id", { mode:"number" }).primaryKey(), tenantId:text("tenant_id").notNull().references(()=>tenants.id),
  storeId:text("store_id").notNull().references(()=>stores.id), periodStart:date("period_start", { mode:"string" }).notNull(),
  periodEnd:date("period_end", { mode:"string" }).notNull(), source:text("source").notNull().default("BigSeller"),
  payload:jsonb("payload").$type<Record<string,unknown>>().notNull(), importedAt:timestamp("imported_at", { withTimezone:true, mode:"string" }).notNull().defaultNow(),
}, table=>[index("dashboard_snapshots_tenant_period_idx").on(table.tenantId,table.periodEnd),index("dashboard_snapshots_store_period_idx").on(table.storeId,table.periodEnd)]);

export const adBalances = pgTable("ad_balances", {
  id:bigserial("id", { mode:"number" }).primaryKey(), tenantId:text("tenant_id").notNull().references(()=>tenants.id),
  storeId:text("store_id").notNull().references(()=>stores.id), sourceStoreName:text("source_store_name").notNull(),
  balanceCents:bigint("balance_cents", { mode:"number" }).notNull(), balanceDate:date("balance_date", { mode:"string" }).notNull(),
  importedAt:timestamp("imported_at", { withTimezone:true, mode:"string" }).notNull().defaultNow(),
}, table=>[uniqueIndex("ad_balance_store_date_idx").on(table.storeId,table.balanceDate),index("ad_balances_tenant_date_idx").on(table.tenantId,table.balanceDate)]);

export const managementActions = pgTable("management_actions", {
  id:bigserial("id", { mode:"number" }).primaryKey(), tenantId:text("tenant_id").notNull().references(()=>tenants.id),
  storeId:text("store_id").notNull().references(()=>stores.id), actionDate:date("action_date", { mode:"string" }).notNull(),
  category:text("category").notNull(), title:text("title").notNull(), detail:text("detail").notNull(), impact:text("impact").notNull(), createdAt:createdAt(),
}, table=>[index("management_actions_tenant_date_idx").on(table.tenantId,table.actionDate),index("management_actions_store_date_idx").on(table.storeId,table.actionDate)]);

export const inventorySkus = pgTable("inventory_skus", {
  id:text("id").primaryKey(), tenantId:text("tenant_id").notNull().references(()=>tenants.id), sku:text("sku").notNull(),
  name:text("name").notNull(), source:text("source").notNull().default("OXM"), active:boolean("active").notNull().default(true),
  syncedAt:timestamp("synced_at", { withTimezone:true, mode:"string" }).notNull().defaultNow(),
}, table=>[uniqueIndex("inventory_sku_tenant_idx").on(table.tenantId,table.sku)]);

export const packages = pgTable("packages", {
  id:text("id").primaryKey(), tenantId:text("tenant_id").notNull().references(()=>tenants.id), storeId:text("store_id").notNull().references(()=>stores.id),
  packageSku:text("package_sku").notNull(), name:text("name").notNull(), channel:text("channel").notNull().default("Shopee"),
  market:text("market").notNull().default("MY"), status:text("status", { enum:["draft","review","approved","scheduled","active","expired"] }).notNull().default("draft"),
  createdBy:text("created_by").notNull(), createdAt:createdAt(), updatedAt:timestamp("updated_at", { withTimezone:true, mode:"string" }).notNull().defaultNow(),
}, table=>[uniqueIndex("package_sku_store_idx").on(table.storeId,table.packageSku),index("packages_tenant_id_idx").on(table.tenantId)]);

type Component={inventorySku:string;name:string;quantity:number;kind:"product"|"gift"};
export const packageVersions = pgTable("package_versions", {
  id:text("id").primaryKey(), packageId:text("package_id").notNull().references(()=>packages.id), version:integer("version").notNull(),
  components:jsonb("components").$type<Component[]>().notNull(), promotionType:text("promotion_type", { enum:["monthly","custom"] }).notNull().default("monthly"),
  addedComponents:jsonb("added_components").$type<Component[]>().notNull().default([]), removedComponents:jsonb("removed_components").$type<Component[]>().notNull().default([]),
  sheetSyncStatus:text("sheet_sync_status", { enum:["pending","synced","failed"] }).notNull().default("pending"), calculatorSettings:jsonb("calculator_settings").$type<Record<string,unknown>|null>(),
  changeNote:text("change_note").notNull().default("Initial version"), effectiveFrom:date("effective_from", { mode:"string" }).notNull(), effectiveTo:date("effective_to", { mode:"string" }),
  createdBy:text("created_by").notNull(), createdAt:createdAt(),
}, table=>[uniqueIndex("package_version_idx").on(table.packageId,table.version)]);

export const packagePlatformSkus = pgTable("package_platform_skus", {
  id:text("id").primaryKey(), packageId:text("package_id").notNull().references(()=>packages.id), versionId:text("version_id").notNull().references(()=>packageVersions.id),
  storeId:text("store_id").notNull().references(()=>stores.id), platform:text("platform", { enum:["Shopee","Lazada","TikTok Shop"] }).notNull(), packageSku:text("package_sku").notNull(), createdAt:createdAt(),
}, table=>[uniqueIndex("package_platform_version_sku_idx").on(table.versionId,table.platform,table.packageSku),index("package_platform_skus_package_id_idx").on(table.packageId),index("package_platform_skus_store_id_idx").on(table.storeId)]);

export const packagePrices = pgTable("package_prices", {
  id:text("id").primaryKey(), packageId:text("package_id").notNull().references(()=>packages.id), versionId:text("version_id").notNull().references(()=>packageVersions.id),
  currency:text("currency").notNull().default("MYR"), market:text("market", { enum:["MY","SG"] }).notNull().default("MY"), priceType:text("price_type", { enum:["non_campaign","campaign"] }).notNull().default("campaign"),
  promotionType:text("promotion_type", { enum:["monthly","custom"] }).notNull().default("custom"), originalPrice:bigint("original_price", { mode:"number" }).notNull(), sellingPrice:bigint("selling_price", { mode:"number" }).notNull(),
  effectiveFrom:date("effective_from", { mode:"string" }).notNull(), effectiveTo:date("effective_to", { mode:"string" }), createdBy:text("created_by").notNull(), createdAt:createdAt(),
}, table=>[uniqueIndex("package_price_version_market_type_period_idx").on(table.versionId,table.market,table.priceType,table.effectiveFrom,table.effectiveTo),index("package_prices_package_id_idx").on(table.packageId)]);

export const packageAuditLog = pgTable("package_audit_log", {
  id:bigserial("id", { mode:"number" }).primaryKey(), packageId:text("package_id").notNull().references(()=>packages.id), action:text("action").notNull(), detail:text("detail").notNull(), actor:text("actor").notNull(), createdAt:createdAt(),
}, table=>[index("package_audit_log_package_created_idx").on(table.packageId,table.createdAt)]);

export const designReviews = pgTable("design_reviews", {
  id:text("id").primaryKey(), tenantId:text("tenant_id").notNull().references(()=>tenants.id), storeId:text("store_id"), submittedBy:text("submitted_by").notNull(),
  status:text("status", { enum:["technical_failed","awaiting_review"] }).notNull(), summary:jsonb("summary").$type<Record<string,unknown>>().notNull(), createdAt:createdAt(),
}, table=>[index("design_reviews_tenant_created_idx").on(table.tenantId,table.createdAt),index("design_reviews_store_id_idx").on(table.storeId)]);

export const designReviewImages = pgTable("design_review_images", {
  id:text("id").primaryKey(), reviewId:text("review_id").notNull().references(()=>designReviews.id,{onDelete:"cascade"}), fileName:text("file_name").notNull(), objectKey:text("object_key").notNull(),
  contentType:text("content_type").notNull(), width:integer("width").notNull(), height:integer("height").notNull(), byteSize:bigint("byte_size", { mode:"number" }).notNull(),
  detectedCategory:text("detected_category").notNull(), result:jsonb("result").$type<Record<string,unknown>>().notNull(), createdAt:createdAt(),
}, table=>[index("design_review_images_review_id_idx").on(table.reviewId),check("design_review_images_dimensions_check",sql`${table.width}>0 and ${table.height}>0`)]);

export const linkDirectoryStores = pgTable("link_directory_stores", {
  storeId:text("store_id").primaryKey().references(()=>stores.id,{onDelete:"cascade"}),
  tenantId:text("tenant_id").notNull().references(()=>tenants.id),
  storeName:text("store_name").notNull(),
  adsTopUpOwner:text("ads_top_up_owner", {enum:["Client","Client Approval","Shopee Hub"]}),
  storeGroupLink:text("store_group_link"),
  googleDriveLink:text("google_drive_link"),
  sourceSheetId:text("source_sheet_id").notNull(),
  sourceTab:text("source_tab").notNull().default("WhatsApp Group"),
  syncedAt:timestamp("synced_at",{withTimezone:true,mode:"string"}).notNull().defaultNow(),
},table=>[uniqueIndex("link_directory_store_name_idx").on(table.tenantId,table.storeName)]);

export const linkDirectoryProjects = pgTable("link_directory_projects", {
  id:bigserial("id",{mode:"number"}).primaryKey(),
  storeId:text("store_id").notNull().references(()=>linkDirectoryStores.storeId,{onDelete:"cascade"}),
  projectName:text("project_name").notNull(),
  projectGroupLink:text("project_group_link").notNull(),
  createdAt:createdAt(),
},table=>[uniqueIndex("link_directory_project_idx").on(table.storeId,table.projectName),index("link_directory_projects_store_id_idx").on(table.storeId)]);

export const projectProductCatalog = pgTable("project_product_catalog", {
  id:bigserial("id",{mode:"number"}).primaryKey(),
  sourceShopName:text("source_shop_name").notNull(),
  itemId:text("item_id").notNull(),
  productName:text("product_name").notNull(),
  productCategory:text("product_category").notNull(),
  commissionFeeRateBps:integer("commission_fee_rate_bps").notNull(),
  mainProduct:boolean("main_product").notNull().default(false),
  sourceSheetId:text("source_sheet_id").notNull(),
  sourceTab:text("source_tab").notNull().default("Commission Comparison"),
  syncedAt:timestamp("synced_at",{withTimezone:true,mode:"string"}).notNull().defaultNow(),
},table=>[
  uniqueIndex("project_product_catalog_shop_item_idx").on(table.sourceShopName,table.itemId),
  index("project_product_catalog_shop_main_idx").on(table.sourceShopName,table.mainProduct),
]);

export const coFundVouchers = pgTable("co_fund_vouchers", {
  id:bigserial("id", {mode:"number"}).primaryKey(),
  tenantId:text("tenant_id").notNull().references(()=>tenants.id),
  storeId:text("store_id").notNull().references(()=>stores.id),
  sourceStoreName:text("source_store_name").notNull(),
  campaignName:text("campaign_name").notNull(),
  campaignDate:date("campaign_date", {mode:"string"}),
  voucherName:text("voucher_name").notNull(),
  discountAmount:numeric("discount_amount", {precision:12,scale:2,mode:"number"}).notNull(),
  currency:text("currency").notNull().default("MYR"),
  quantity:integer("quantity").notNull(),
  sourceSheetId:text("source_sheet_id"),
  sourceTab:text("source_tab"),
  sourceRow:integer("source_row"),
  createdAt:createdAt(),
  updatedAt:timestamp("updated_at", {withTimezone:true,mode:"string"}).notNull().defaultNow(),
},table=>[index("co_fund_vouchers_campaign_date_idx").on(table.campaignDate),index("co_fund_vouchers_store_id_idx").on(table.storeId)]);
