import { db } from '@/lib/db'
import { users } from '@db/schema'
import { eq, sql } from 'drizzle-orm'

export function getUserById(id: string) {
  return db.select().from(users).where(eq(users.id, id)).get()
}

export function getUserByEmail(email: string) {
  return db.select().from(users).where(eq(users.email, email)).get()
}

export function getUserByUsername(username: string) {
  return db.select().from(users)
    .where(eq(sql`LOWER(${users.username})`, username.toLowerCase()))
    .get()
}

export function getUserByMcpKeyHash(hash: string) {
  return db.select().from(users).where(eq(users.mcpApiKeyHash, hash)).get()
}

export function listUsers() {
  return db.select().from(users).all()
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
  const result = db.select({ count: users.id }).from(users).all()
  return result.length
}
