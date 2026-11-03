CREATE TABLE `email_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`statement_id` text NOT NULL,
	`recipient` text NOT NULL,
	`subject` text NOT NULL,
	`status` text NOT NULL,
	`provider_message_id` text,
	`error_code` text,
	`sent_by` text NOT NULL,
	`sent_at` text NOT NULL,
	FOREIGN KEY (`statement_id`) REFERENCES `statements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sent_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`statement_id` text NOT NULL,
	`amount` integer NOT NULL,
	`paid_at` text NOT NULL,
	`method` text NOT NULL,
	`reference` text,
	`notes` text,
	`status` text NOT NULL,
	`verified_by` text,
	`verified_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`statement_id`) REFERENCES `statements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`verified_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_statement_unique` ON `payments` (`statement_id`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`reset_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `billing_periods` ADD `shared_pool` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `billing_periods`
SET `shared_pool` = `utility_total` + `reading_service_total` - `energy_pool` - `peak_pool`;--> statement-breakpoint
ALTER TABLE `properties` ADD `owner_email` text;
