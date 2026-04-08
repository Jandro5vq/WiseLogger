import { db } from '@/lib/db'
import { tasks } from '@db/schema'
import { eq, and, isNull, sql } from 'drizzle-orm'

export function getTaskById(id: string) {
  return db.select().from(tasks).where(eq(tasks.id, id)).get()
}

export function getActiveTask(userId: string) {
  return db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, userId), isNull(tasks.endTime)))
    .get()
}

export function listTasksForEntry(entryId: string) {
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.entryId, entryId))
    .orderBy(tasks.startTime)
    .all()
}

export function getFavorites(userId: string, limit = 10) {
  return db
    .select({
      description: tasks.description,
      tags: tasks.tags,
      uses: sql<number>`count(*)`.as('uses'),
    })
    .from(tasks)
    .where(eq(tasks.userId, userId))
    .groupBy(tasks.description)
    .orderBy(sql`count(*) desc`)
    .limit(limit)
    .all()
}

export function createTask(data: {
  id: string
  entryId: string
  userId: string
  startTime: string
  endTime?: string
  description: string
  tags?: string
}) {
  return db
    .insert(tasks)
    .values({ ...data, tags: data.tags ?? '[]' })
    .returning()
    .get()
}

export function updateTask(id: string, data: Partial<typeof tasks.$inferInsert>) {
  return db.update(tasks).set(data).where(eq(tasks.id, id)).returning().get()
}

export function deleteTask(id: string) {
  return db.delete(tasks).where(eq(tasks.id, id)).returning().get()
}
