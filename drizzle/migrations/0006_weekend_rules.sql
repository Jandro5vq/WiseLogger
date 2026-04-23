-- Add Saturday (weekday=6) and Sunday (weekday=0) as 0-minute rules
-- for existing users who don't already have a weekday rule for those days.

INSERT INTO work_schedule_rules (id, user_id, rule_type, weekday, duration_minutes, label)
SELECT
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
  u.id,
  'weekday',
  6,
  0,
  'Sábado'
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM work_schedule_rules r
  WHERE r.user_id = u.id AND r.rule_type = 'weekday' AND r.weekday = 6
);

INSERT INTO work_schedule_rules (id, user_id, rule_type, weekday, duration_minutes, label)
SELECT
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
  u.id,
  'weekday',
  0,
  0,
  'Domingo'
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM work_schedule_rules r
  WHERE r.user_id = u.id AND r.rule_type = 'weekday' AND r.weekday = 0
);
