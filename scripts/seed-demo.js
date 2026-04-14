#!/usr/bin/env node
'use strict'

const crypto = require('crypto')

const dbPath = process.env.DB_PATH || '/data/wiselogger.db'

const Database = require('better-sqlite3')
const sqlite = new Database(dbPath)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

const existing = sqlite.prepare('SELECT id FROM users WHERE username = ?').get('demo')
if (existing) {
  console.log('[seed-demo] Demo user already exists, skipping')
  sqlite.close()
  process.exit(0)
}

const { v4: uuidv4 } = require('uuid')

const demoId = uuidv4()
const now = new Date().toISOString()
// Pre-computed bcrypt hash for 'demo1234' (cost 10) — password is intentionally public
const passwordHash = '$2a$10$YpDTkRRzE6tIIsMcDpyYXu7NFLuHB9mKzlzljk/.ZSXnfE.pJ2QWW'

// Generate MCP API key for demo user
const rawApiKey = 'wl_' + crypto.randomBytes(32).toString('hex')
const mcpApiKeyHash = crypto.createHash('sha256').update(rawApiKey).digest('hex')

sqlite
  .prepare(
    `INSERT INTO users (id, username, email, password_hash, role, mcp_api_key_hash, is_active, timezone, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  .run(demoId, 'demo', 'demo@demo.local', passwordHash, 'user', mcpApiKeyHash, 1, 'UTC', now)

// Create default work schedule rules
const scheduleRules = [
  { id: uuidv4(), userId: demoId, ruleType: 'default', weekday: null, month: null, specificDate: null, durationMinutes: 495, label: 'Jornada estándar' },
  { id: uuidv4(), userId: demoId, ruleType: 'weekday', weekday: 5, month: null, specificDate: null, durationMinutes: 375, label: 'Viernes intensivo' },
  { id: uuidv4(), userId: demoId, ruleType: 'month', weekday: null, month: 8, specificDate: null, durationMinutes: 420, label: 'Horario de verano' },
]

const insertScheduleRule = sqlite.prepare(
  `INSERT INTO work_schedule_rules (id, user_id, rule_type, weekday, month, specific_date, duration_minutes, label)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
)
for (const r of scheduleRules) {
  insertScheduleRule.run(r.id, r.userId, r.ruleType, r.weekday, r.month, r.specificDate, r.durationMinutes, r.label)
}

// Create default break rules
const breakRules = [
  { id: uuidv4(), userId: demoId, ruleType: 'always', scheduleDuration: null, weekday: null, breakStart: '14:00', durationMinutes: 60, label: 'Almuerzo' },
  { id: uuidv4(), userId: demoId, ruleType: 'always', scheduleDuration: null, weekday: null, breakStart: '11:00', durationMinutes: 15, label: 'Café' },
]

const insertBreakRule = sqlite.prepare(
  `INSERT INTO break_rules (id, user_id, rule_type, schedule_duration, weekday, break_start, duration_minutes, label)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
)
for (const r of breakRules) {
  insertBreakRule.run(r.id, r.userId, r.ruleType, r.scheduleDuration, r.weekday, r.breakStart, r.durationMinutes, r.label)
}

console.log('[seed-demo] Demo user ready (username: demo, password: demo1234)')
sqlite.close()
