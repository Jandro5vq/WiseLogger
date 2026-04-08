#!/usr/bin/env node
'use strict'

const path = require('path')
const crypto = require('crypto')

const dbPath = process.env.DB_PATH || '/data/wiselogger.db'
const adminEmail = process.env.ADMIN_EMAIL

if (!adminEmail) {
  console.error('[seed-admin] ADMIN_EMAIL environment variable is required')
  process.exit(1)
}

const Database = require('better-sqlite3')
const sqlite = new Database(dbPath)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

const count = sqlite.prepare('SELECT COUNT(*) as count FROM users').get()
if (count.count > 0) {
  console.log('[seed-admin] Users already exist, skipping admin seed')
  sqlite.close()
  process.exit(0)
}

const { v4: uuidv4 } = require('uuid')

const adminId = uuidv4()
const now = new Date().toISOString()

// Generate MCP API key for admin
const rawApiKey = 'wl_' + crypto.randomBytes(32).toString('hex')
const mcpApiKeyHash = crypto.createHash('sha256').update(rawApiKey).digest('hex')

sqlite
  .prepare(
    `INSERT INTO users (id, username, email, password_hash, role, mcp_api_key_hash, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  .run(adminId, 'admin', adminEmail, 'NEEDS_RESET', 'admin', mcpApiKeyHash, 1, now)

// Create default schedule rules for admin
const rules = [
  { id: uuidv4(), userId: adminId, ruleType: 'default', weekday: null, month: null, specificDate: null, durationMinutes: 495, label: 'Jornada estándar' },
  { id: uuidv4(), userId: adminId, ruleType: 'weekday', weekday: 5, month: null, specificDate: null, durationMinutes: 375, label: 'Viernes intensivo' },
  { id: uuidv4(), userId: adminId, ruleType: 'month', weekday: null, month: 8, specificDate: null, durationMinutes: 420, label: 'Horario de verano' },
]

const insertRule = sqlite.prepare(
  `INSERT INTO work_schedule_rules (id, user_id, rule_type, weekday, month, specific_date, duration_minutes, label)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
)

for (const r of rules) {
  insertRule.run(r.id, r.userId, r.ruleType, r.weekday, r.month, r.specificDate, r.durationMinutes, r.label)
}

console.log(`[seed-admin] Admin account created for: ${adminEmail}`)
console.log('[seed-admin] Admin must set their password on first login at /setup')

sqlite.close()
