ALTER TABLE `package_prices` ADD `market` text DEFAULT 'MY' NOT NULL;--> statement-breakpoint
ALTER TABLE `package_prices` ADD `price_type` text DEFAULT 'campaign' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `package_price_version_market_type_idx` ON `package_prices` (`version_id`,`market`,`price_type`);
