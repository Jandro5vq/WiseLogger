import { db } from '@/lib/db'
import { entries } from '@db/schema'
import { eq, and, gte, lte, lt, isNull } from 'drizzle-orm'
// listAllUnclosedEntriesBefore was removed: auto-close now iterates users per their
// own timezone (see lib/business/auto-close.ts) instead of a single UTC cutoff.

export function getEntryById(id: string) {
  return db.select().from(entries).where(eq(entries.id, id)).get()
}

export function getEntryByDate(userId: string, date: string) {
  return db
    .select()
    .from(entries)
    .where(and(eq(entries.userId, userId), eq(entries.date, date)))
    .get()
}

export function listEntries(userId: string, from?: string, to?: string) {
  const conditions = [eq(entries.userId, userId)]
  if (from) conditions.push(gte(entries.date, from))
  if (to) conditions.push(lte(entries.date, to))
  return db
    .select()
    .from(entries)
    .where(and(...conditions))
    .orderBy(entries.date)
    .all()
}

export function createEntry(data: {
  id: string
  userId: string
  date: string
  startTime?: string
  expectedMinutes: number
  notes?: string
}) {
  return db.insert(entries).values(data).returning().get()
}

export function updateEntry(id: string, data: Partial<typeof entries.$inferInsert>) {
  return db.update(entries).set(data).where(eq(entries.id, id)).returning().get()
}

export function deleteEntry(id: string) {
  return db.delete(entries).where(eq(entries.id, id)).returning().get()
}

/** Entries from before `date` that were never closed (no endTime). */
export function listUnclosedEntriesBefore(userId: string, date: string) {
  return db
    .select()
    .from(entries)
    .where(and(eq(entries.userId, userId), lt(entries.date, date), isNull(entries.endTime)))
    .orderBy(entries.date)
    .all()
}

/** Every entry across every user — used by the startup overlap sweep. */
export function listAllEntries() {
  return db.select().from(entries).all()
}
