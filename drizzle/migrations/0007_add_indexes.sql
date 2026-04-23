-- Add missing indexes on foreign key columns for query performance
CREATE INDEX IF NOT EXISTS idx_tasks_entry_id ON tasks(entry_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_entry_breaks_entry_id ON entry_breaks(entry_id);
CREATE INDEX IF NOT EXISTS idx_entry_breaks_user_id ON entry_breaks(user_id);
CREATE INDEX IF NOT EXISTS idx_break_rules_user_id ON break_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_work_schedule_rules_user_id ON work_schedule_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_entries_user_date ON entries(user_id, date);
