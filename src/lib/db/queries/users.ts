import { db } from '@/lib/db'
import { users } from '@db/schema'
import { eq, isNull, sql } from 'drizzle-orm'
import { normalizeEmail, usernameKey } from '@/lib/auth/username'

// Lookups below also return soft-deleted users (deletedAt set): their username and
// email stay reserved while they are in the trash. Callers that authenticate must
// reject them explicitly.

export function getUserById(id: string) {
  return db.select().from(users).where(eq(users.id, id)).get()
}

export function getUserByEmail(email: string) {
  return db.select().from(users).where(eq(users.email, normalizeEmail(email))).get()
}

export function getUserByUsername(username: string) {
  // Compared in JS: SQLite's LOWER() only folds ASCII, so 'Íñigo' ≠ 'íñigo' there.
  const key = usernameKey(username)
  if (!key) return undefined
  return db.select().from(users).all().find((u) => usernameKey(u.username) === key)
}

export function getUserByMcpKeyHash(hash: string) {
  return db.select().from(users).where(eq(users.mcpApiKeyHash, hash)).get()
}

/** Every user, including soft-deleted ones (admin views). */
export function listUsers() {
  return db.select().from(users).all()
}

/** Users that are not in the trash — use this for background jobs and stats. */
export function listLiveUsers() {
  return db.select().from(users).where(isNull(users.deletedAt)).all()
}

export function createUser(data: {
  id: string
  username: string
  email: string
  passwordHash: string
  role?: 'admin' | 'user'
  mcpApiKeyHash?: string
  createdAt: string
}) {
  return db.insert(users).values(data).returning().get()
}

export function updateUser(id: string, data: Partial<typeof users.$inferInsert>) {
  return db.update(users).set(data).where(eq(users.id, id)).returning().get()
}

export function countUsers(): number {
  const result = db.select({ count: sql<number>`count(*)` }).from(users).get()
  return result?.count ?? 0
}
