CREATE TABLE `body_measurements` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`height_cm` real,
	`weight_kg` real,
	`measured_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `body_measurements_profile_measured_idx` ON `body_measurements` (`profile_id`,`measured_at`);--> statement-breakpoint
CREATE TABLE `meal_items` (
	`id` text PRIMARY KEY NOT NULL,
	`meal_id` text NOT NULL,
	`name` text NOT NULL,
	`quantity_amount` real NOT NULL,
	`quantity_unit` text NOT NULL,
	`calories` real,
	`nutrients` text DEFAULT '[]' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`food_group` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `meal_items_meal_idx` ON `meal_items` (`meal_id`,`position`);--> statement-breakpoint
CREATE TABLE `meals` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`category` text NOT NULL,
	`logged_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`total_calories` real DEFAULT 0 NOT NULL,
	`total_nutrients` text DEFAULT '[]' NOT NULL,
	`client_token` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `meals_profile_logged_idx` ON `meals` (`profile_id`,`logged_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `meals_profile_client_token_key` ON `meals` (`profile_id`,`client_token`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`phone` text NOT NULL,
	`name` text,
	`date_of_birth` text,
	`gender` text,
	`is_verified` integer DEFAULT false NOT NULL,
	`is_profile_complete` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_phone_unique` ON `profiles` (`phone`);