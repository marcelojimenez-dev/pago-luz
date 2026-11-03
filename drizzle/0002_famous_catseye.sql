CREATE TABLE `adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`source_period_id` text NOT NULL,
	`apply_period_id` text NOT NULL,
	`amount` integer NOT NULL,
	`reason` text NOT NULL,
	`status` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_period_id`) REFERENCES `billing_periods`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`apply_period_id`) REFERENCES `billing_periods`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `utility_bills` (
	`id` text PRIMARY KEY NOT NULL,
	`period_id` text NOT NULL,
	`invoice_number` text NOT NULL,
	`object_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`issued_at` text NOT NULL,
	`due_date` text NOT NULL,
	`total` integer NOT NULL,
	`consumption_kwh` integer NOT NULL,
	`previous_payment_amount` integer,
	`previous_payment_at` text,
	`status` text NOT NULL,
	`paid_amount` integer,
	`paid_at` text,
	`payment_reference` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`period_id`) REFERENCES `billing_periods`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `utility_bills_object_key_unique` ON `utility_bills` (`object_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `utility_bills_sha256_unique` ON `utility_bills` (`sha256`);--> statement-breakpoint
CREATE UNIQUE INDEX `utility_bill_period_unique` ON `utility_bills` (`period_id`);