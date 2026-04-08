CREATE TABLE `break_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`rule_type` text NOT NULL,
	`schedule_duration` integer,
	`weekday` integer,
	`break_start` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`label` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `entry_breaks` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`user_id` text NOT NULL,
	`break_start` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`label` text,
	`from_rule_id` text,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
