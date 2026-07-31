CREATE TABLE `ad_balances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` text NOT NULL,
	`store_id` text NOT NULL,
	`source_store_name` text NOT NULL,
	`balance_cents` integer NOT NULL,
	`balance_date` text NOT NULL,
	`imported_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ad_balance_store_date_idx` ON `ad_balances` (`store_id`,`balance_date`);
