import { db } from '@/lib/db'
import { billedGroups } from '@db/schema'
import { eq, and } from 'drizzle-orm'

export function getBilledForUser(userId: string) {
  return db.select().from(billedGroups).where(eq(billedGroups.userId, userId)).all()
}

export function upsertBilled(data: {
  id: string
  userId: string
  date: string
  description: string
  signature: string
  billedAt: number
}) {
  return db
    .insert(billedGroups)
    .values(data)
    .onConflictDoUpdate({
      target: [billedGroups.userId, billedGroups.date, billedGroups.description],
      set: { signature: data.signature, billedAt: data.billedAt },
    })
    .returning()
    .get()
}

export function deleteBilled(userId: string, date: string, description: string) {
  return db
    .delete(billedGroups)
    .where(
      and(
        eq(billedGroups.userId, userId),
        eq(billedGroups.date, date),
        eq(billedGroups.description, description)
      )
    )
    .returning()
    .get()
}
