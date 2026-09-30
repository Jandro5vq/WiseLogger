CREATE TABLE IF NOT EXISTS `password_reset_requests` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `requested_at` text NOT NULL,
  `resolved_at` text
);

CREATE INDEX IF NOT EXISTS idx_password_reset_requests_user_id ON password_reset_requests(user_id);

CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `token_hash` text NOT NULL UNIQUE,
  `created_by` text,
  `created_at` text NOT NULL,
  `expires_at` text NOT NULL,
  `used_at` text
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);

-- Soft delete: non-null = in the 30-day trash, purged by src/lib/business/user-purge.ts
ALTER TABLE `users` ADD `deleted_at` text;
