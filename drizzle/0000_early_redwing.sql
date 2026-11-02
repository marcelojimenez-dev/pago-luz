CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `balances` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`period_id` text NOT NULL,
	`amount` integer NOT NULL,
	`description` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`period_id`) REFERENCES `billing_periods`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `balance_property_period_unique` ON `balances` (`property_id`,`period_id`);--> statement-breakpoint
CREATE TABLE `billing_periods` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`name` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`due_date` text NOT NULL,
	`invoice_number` text,
	`status` text NOT NULL,
	`utility_total` integer NOT NULL,
	`reading_service_total` integer NOT NULL,
	`energy_pool` integer NOT NULL,
	`peak_pool` integer NOT NULL,
	`maintenance_fund_per_property` integer NOT NULL,
	`master_kwh` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `communities` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`utility_client_number` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `community_members` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `community_member_unique` ON `community_members` (`community_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `meter_readings` (
	`id` text PRIMARY KEY NOT NULL,
	`meter_id` text NOT NULL,
	`period_id` text NOT NULL,
	`previous_value` integer NOT NULL,
	`current_value` integer NOT NULL,
	`consumption_kwh` integer NOT NULL,
	`status` text NOT NULL,
	`captured_at` text NOT NULL,
	`submitted_by` text NOT NULL,
	`approved_by` text,
	`notes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`meter_id`) REFERENCES `meters`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`period_id`) REFERENCES `billing_periods`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`submitted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meter_period_reading_unique` ON `meter_readings` (`meter_id`,`period_id`);--> statement-breakpoint
CREATE TABLE `meters` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`property_id` text,
	`serial_number` text NOT NULL,
	`label` text NOT NULL,
	`kind` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meter_serial_unique` ON `meters` (`community_id`,`serial_number`);--> statement-breakpoint
CREATE TABLE `properties` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`parcel_number` text NOT NULL,
	`owner_label` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `property_parcel_unique` ON `properties` (`community_id`,`parcel_number`);--> statement-breakpoint
CREATE TABLE `property_members` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `property_member_unique` ON `property_members` (`property_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `reading_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`reading_id` text NOT NULL,
	`object_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`reading_id`) REFERENCES `meter_readings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reading_photos_object_key_unique` ON `reading_photos` (`object_key`);--> statement-breakpoint
CREATE TABLE `statements` (
	`id` text PRIMARY KEY NOT NULL,
	`period_id` text NOT NULL,
	`property_id` text NOT NULL,
	`consumption_kwh` integer NOT NULL,
	`energy_charge` integer NOT NULL,
	`peak_charge` integer NOT NULL,
	`shared_charge` integer NOT NULL,
	`maintenance_fund` integer NOT NULL,
	`previous_balance` integer NOT NULL,
	`rounding_adjustment` integer NOT NULL,
	`total` integer NOT NULL,
	`status` text NOT NULL,
	`calculated_at` text NOT NULL,
	FOREIGN KEY (`period_id`) REFERENCES `billing_periods`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `statement_property_period_unique` ON `statements` (`property_id`,`period_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text NOT NULL
);
