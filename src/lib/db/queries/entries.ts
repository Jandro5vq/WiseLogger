import { db } from '@/lib/db'
import { entries } from '@db/schema'
import { eq, and, gte, lte } from 'drizzle-orm'

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
