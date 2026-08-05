DROP INDEX `package_platform_version_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `package_platform_version_sku_idx` ON `package_platform_skus` (`version_id`,`platform`,`package_sku`);--> statement-breakpoint
DROP INDEX `package_price_version_market_type_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `package_price_version_market_type_period_idx` ON `package_prices` (`version_id`,`market`,`price_type`,`effective_from`,`effective_to`);