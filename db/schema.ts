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
