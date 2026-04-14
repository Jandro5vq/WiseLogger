#!/usr/bin/env node
'use strict'

const path = require('path')
const fs = require('fs')

const dbPath = process.env.DB_PATH || '/data/wiselogger.db'
const migrationsDir = path.join(__dirname, '..', 'drizzle', 'migrations')

const dbDir = path.dirname(dbPath)
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })

const Database = require('better-sqlite3')
const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// Create our migration tracking table
db.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    filename TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`)

// One-time transition from Drizzle's hash-based __drizzle_migrations table.
// Drizzle stores one row per applied migration (in order). We map those rows
// to the first N sorted .sql files and mark them as already done.
const hasDrizzleTable = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'"
).get()

if (hasDrizzleTable) {
  const { n: drizzleCount } = db.prepare('SELECT COUNT(*) AS n FROM __drizzle_migrations').get()
  if (drizzleCount > 0) {
    const sqlFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort()
      .slice(0, drizzleCount)
    const insert = db.prepare('INSERT OR IGNORE INTO _migrations (filename) VALUES (?)')
    for (const f of sqlFiles) insert.run(f)
    console.log(`[migrate] Transitioned ${sqlFiles.length} existing Drizzle migration(s) to new tracker`)
  }
}

// Collect all .sql files in sorted order and apply any not yet tracked
const files = fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort()

let applied = 0
for (const file of files) {
  if (db.prepare('SELECT 1 FROM _migrations WHERE filename = ?').get(file)) continue

  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
  console.log(`[migrate] Applying: ${file}`)
  try {
    db.exec(sql)
  } catch (err) {
    // Treat "already exists" / "duplicate column" as a no-op so manual hotfixes
    // on a live DB don't block future container restarts.
    if (
      err.message.includes('already exists') ||
      err.message.includes('duplicate column name')
    ) {
      console.warn(`[migrate] Warning — ${file} may have been partially applied manually (${err.message}), marking as done`)
    } else {
      console.error(`[migrate] FAILED on ${file}:`, err.message)
      process.exit(1)
    }
  }
  db.prepare('INSERT INTO _migrations (filename) VALUES (?)').run(file)
  applied++
}

if (applied === 0) {
  console.log('[migrate] Database is up to date')
} else {
  console.log(`[migrate] Done — ${applied} migration(s) applied`)
}

db.close()
