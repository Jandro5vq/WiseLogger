import { db } from '@/lib/db'
import { entryBreaks } from '@db/schema'
import { eq, inArray } from 'drizzle-orm'
import type { InferSelectModel } from 'drizzle-orm'

type EntryBreak = InferSelectModel<typeof entryBreaks>

export function getEntryBreaks(entryId: string) {
  return db.select().from(entryBreaks).where(eq(entryBreaks.entryId, entryId)).all()
}

export function getEntryBreakById(id: string) {
  return db.select().from(entryBreaks).where(eq(entryBreaks.id, id)).get()
}

export function createEntryBreak(data: typeof entryBreaks.$inferInsert) {
  return db.insert(entryBreaks).values(data).returning().get()
}

export function updateEntryBreak(id: string, data: Partial<typeof entryBreaks.$inferInsert>) {
  return db.update(entryBreaks).set(data).where(eq(entryBreaks.id, id)).returning().get()
}

export function deleteEntryBreak(id: string) {
  return db.delete(entryBreaks).where(eq(entryBreaks.id, id)).returning().get()
}

export function getTotalBreakMinutes(entryId: string): number {
  const breaks = getEntryBreaks(entryId)
  return breaks.reduce((sum, b) => sum + b.durationMinutes, 0)
}

/** Batch-fetch breaks for multiple entries in a single query. */
export function getBreaksForEntries(entryIds: string[]): Map<string, EntryBreak[]> {
  const map = new Map<string, EntryBreak[]>()
  if (entryIds.length === 0) return map
  const rows = db.select().from(entryBreaks).where(inArray(entryBreaks.entryId, entryIds)).all()
  for (const row of rows) {
    const list = map.get(row.entryId)
    if (list) list.push(row)
    else map.set(row.entryId, [row])
  }
  return map
}
