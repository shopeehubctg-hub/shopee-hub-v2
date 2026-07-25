CREATE TABLE `inventory_skus` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`sku` text NOT NULL,
	`name` text NOT NULL,
	`source` text DEFAULT 'OXM' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`synced_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_sku_tenant_idx` ON `inventory_skus` (`tenant_id`,`sku`);--> statement-breakpoint
CREATE TABLE `package_audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`package_id` text NOT NULL,
	`action` text NOT NULL,
	`detail` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `packages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `package_prices` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`version_id` text NOT NULL,
	`currency` text DEFAULT 'MYR' NOT NULL,
	`original_price` integer NOT NULL,
	`selling_price` integer NOT NULL,
	`effective_from` text NOT NULL,
	`effective_to` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `packages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_id`) REFERENCES `package_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `package_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`version` integer NOT NULL,
	`components` text NOT NULL,
	`change_note` text DEFAULT 'Initial version' NOT NULL,
	`effective_from` text NOT NULL,
	`effective_to` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `packages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `package_version_idx` ON `package_versions` (`package_id`,`version`);--> statement-breakpoint
CREATE TABLE `packages` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`store_id` text NOT NULL,
	`package_sku` text NOT NULL,
	`name` text NOT NULL,
	`channel` text DEFAULT 'Shopee' NOT NULL,
	`market` text DEFAULT 'MY' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `package_sku_store_idx` ON `packages` (`store_id`,`package_sku`);