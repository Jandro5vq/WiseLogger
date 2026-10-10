CREATE TABLE IF NOT EXISTS `instance_settings` (
  `id` integer PRIMARY KEY CHECK (`id` = 1),
  `seasonal_theme_mode` text NOT NULL DEFAULT 'automatic',
  `manual_seasonal_theme` text,
  `manual_seasonal_theme_until` text,
  `updated_at` text NOT NULL
);

INSERT OR IGNORE INTO instance_settings (id, updated_at)
VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
