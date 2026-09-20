CREATE TABLE `recommendations` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`date` text NOT NULL,
	`items` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recommendations_profile_date_key` ON `recommendations` (`profile_id`,`date`);--> statement-breakpoint
ALTER TABLE `profiles` ADD `diet_preference` text DEFAULT 'veg' NOT NULL;