import { db } from '@/lib/db'
import { breakRules } from '@db/schema'
import { eq } from 'drizzle-orm'

export function getBreakRules(userId: string) {
  return db.select().from(breakRules).where(eq(breakRules.userId, userId)).all()
}

export function getBreakRuleById(id: string) {
  return db.select().from(breakRules).where(eq(breakRules.id, id)).get()
}

export function createBreakRule(data: typeof breakRules.$inferInsert) {
  return db.insert(breakRules).values(data).returning().get()
}

export function updateBreakRule(id: string, data: Partial<typeof breakRules.$inferInsert>) {
  return db.update(breakRules).set(data).where(eq(breakRules.id, id)).returning().get()
}

export function deleteBreakRule(id: string) {
  return db.delete(breakRules).where(eq(breakRules.id, id)).returning().get()
}
