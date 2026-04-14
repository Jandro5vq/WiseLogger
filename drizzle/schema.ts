import { sqliteTable, text, integer, unique } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'user'] }).notNull().default('user'),
  mcpApiKeyHash: text('mcp_api_key_hash'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  timezone: text('timezone').notNull().default('UTC'), // IANA timezone identifier
  validSince: text('valid_since').notNull().default('1970-01-01T00:00:00.000Z'), // invalidates tokens issued before this
  onboardingResetAt: text('onboarding_reset_at'), // when non-null, clients with an older wl:onboarded timestamp re-run the tour
  createdAt: text('created_at').notNull(),
  lastLoginAt: text('last_login_at'),
})

export const entries = sqliteTable(
  'entries',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: text('date').notNull(), // YYYY-MM-DD
    startTime: text('start_time'), // full ISO 8601, informational only
    endTime: text('end_time'), // full ISO 8601, informational only
    expectedMinutes: integer('expected_minutes').notNull().default(495), // 8h15m
    notes: text('notes'),
  },
  (t) => ({
    uniqueUserDate: unique().on(t.userId, t.date),
  })
)

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  entryId: text('entry_id')
    .notNull()
    .references(() => entries.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  startTime: text('start_time').notNull(), // full ISO 8601
  endTime: text('end_time'), // null = task still active
  description: text('description').notNull(),
  tags: text('tags').notNull().default('[]'), // JSON array stored as TEXT
})

export const workScheduleRules = sqliteTable('work_schedule_rules', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  ruleType: text('rule_type', {
    enum: ['default', 'weekday', 'month', 'date'],
  }).notNull(),
  weekday: integer('weekday'), // 0=Sunday … 6=Saturday
  month: integer('month'), // 1–12
  specificDate: text('specific_date'), // YYYY-MM-DD
  durationMinutes: integer('duration_minutes').notNull(),
  label: text('label'),
})

export const breakRules = sqliteTable('break_rules', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  ruleType: text('rule_type', {
    enum: ['always', 'schedule_duration', 'weekday'],
  }).notNull(),
  scheduleDuration: integer('schedule_duration'), // applies when entry.expectedMinutes == this
  weekday: integer('weekday'), // 0=Sunday … 6=Saturday
  breakStart: text('break_start').notNull(), // 'HH:MM'
  durationMinutes: integer('duration_minutes').notNull(),
  label: text('label'),
})

export const entryBreaks = sqliteTable('entry_breaks', {
  id: text('id').primaryKey(),
  entryId: text('entry_id')
    .notNull()
    .references(() => entries.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  breakStart: text('break_start').notNull(), // UTC ISO 8601 (new) or 'HH:MM' local (legacy rule-seeded)
  durationMinutes: integer('duration_minutes').notNull(),
  label: text('label'),
  fromRuleId: text('from_rule_id'), // which rule generated this (info only)
})

export const invitations = sqliteTable('invitations', {
  id: text('id').primaryKey(),
  token: text('token').notNull().unique(),
  email: text('email'), // optional pre-fill
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id),
  expiresAt: text('expires_at').notNull(),
  usedAt: text('used_at'),
  usedBy: text('used_by').references(() => users.id),
})
