import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '@db/schema'
import path from 'path'
import fs from 'fs'

// Singleton pattern — prevents multiple connections during Next.js hot reload
const globalForDb = global as typeof global & {
  __sqlite?: Database.Database
  __drizzle?: ReturnType<typeof drizzle>
}

function getOrCreateDb(): Database.Database {
  if (!globalForDb.__sqlite) {
    // Lazy: only access env vars at runtime, not at build time
    const dbPath = process.env.DB_PATH ?? '/data/wiselogger.db'
    const dbDir = path.dirname(dbPath)
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }
    const sqlite = new Database(dbPath)
    sqlite.pragma('journal_mode = WAL')
    sqlite.pragma('foreign_keys = ON')
    globalForDb.__sqlite = sqlite
  }
  return globalForDb.__sqlite
}

export const sqlite = new Proxy({} as Database.Database, {
  get(_target, prop) {
    return (getOrCreateDb() as unknown as Record<string | symbol, unknown>)[prop]
  },
})

function getOrCreateDrizzle(): ReturnType<typeof drizzle> {
  if (!globalForDb.__drizzle) {
    globalForDb.__drizzle = drizzle(getOrCreateDb(), { schema })
  }
  return globalForDb.__drizzle
}

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    return (getOrCreateDrizzle() as unknown as Record<string | symbol, unknown>)[prop]
  },
})
