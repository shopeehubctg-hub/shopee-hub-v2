CREATE TABLE `package_platform_skus` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`version_id` text NOT NULL,
	`store_id` text NOT NULL,
	`platform` text NOT NULL,
	`package_sku` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `packages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_id`) REFERENCES `package_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `package_platform_version_idx` ON `package_platform_skus` (`version_id`,`platform`);--> statement-breakpoint
ALTER TABLE `package_versions` ADD `promotion_type` text DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE `package_versions` ADD `added_components` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `package_versions` ADD `removed_components` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `package_versions` ADD `sheet_sync_status` text DEFAULT 'pending' NOT NULL;