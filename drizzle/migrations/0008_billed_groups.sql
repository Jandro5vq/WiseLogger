CREATE TABLE `billed_groups` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `date` text NOT NULL,
  `description` text NOT NULL,
  `signature` text NOT NULL,
  `billed_at` integer NOT NULL,
  UNIQUE(`user_id`, `date`, `description`)
);

CREATE INDEX IF NOT EXISTS idx_billed_groups_user_id ON billed_groups(user_id);
