#!/usr/bin/env node
'use strict'

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })

const path = require('path')
const fs = require('fs')

const dbPath = process.env.DB_PATH || '/data/wiselogger.db'
const migrationsPath = path.join(__dirname, '..', 'drizzle', 'migrations')

// Ensure the data directory exists
const dbDir = path.dirname(dbPath)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

const Database = require('better-sqlite3')
const { migrate } = require('drizzle-orm/better-sqlite3/migrator')
const { drizzle } = require('drizzle-orm/better-sqlite3')

const sqlite = new Database(dbPath)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

const db = drizzle(sqlite)

console.log('[migrate] Running migrations from:', migrationsPath)
migrate(db, { migrationsFolder: migrationsPath })
console.log('[migrate] Migrations complete')

sqlite.close()
