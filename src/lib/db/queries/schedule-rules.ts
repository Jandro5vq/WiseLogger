import { db } from '@/lib/db'
import { workScheduleRules } from '@db/schema'
import { eq } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'

export function getScheduleRules(userId: string) {
  return db
    .select()
    .from(workScheduleRules)
    .where(eq(workScheduleRules.userId, userId))
    .all()
}

export function getRuleById(id: string) {
  return db.select().from(workScheduleRules).where(eq(workScheduleRules.id, id)).get()
}

// Default rules from the spec:
// 8h15m (495 min) default, 6h15m (375 min) Friday, 7h (420 min) August
export function createDefaultRules(userId: string) {
  const now = new Date().toISOString()
  const rules = [
    {
      id: uuidv4(),
      userId,
      ruleType: 'default' as const,
      durationMinutes: 495,
      label: 'Jornada estándar',
    },
    {
      id: uuidv4(),
      userId,
      ruleType: 'weekday' as const,
      weekday: 5, // Friday
      durationMinutes: 375,
      label: 'Viernes intensivo',
    },
    {
      id: uuidv4(),
      userId,
      ruleType: 'month' as const,
      weekday: null,
      month: 8, // August
      durationMinutes: 420,
      label: 'Horario de verano',
    },
    {
      id: uuidv4(),
      userId,
      ruleType: 'weekday' as const,
      weekday: 6, // Saturday
      durationMinutes: 0,
      label: 'Sábado',
    },
    {
      id: uuidv4(),
      userId,
      ruleType: 'weekday' as const,
      weekday: 0, // Sunday
      durationMinutes: 0,
      label: 'Domingo',
    },
  ]
  return db.insert(workScheduleRules).values(rules).returning().all()
}

export function createRule(data: {
  id: string
  userId: string
  ruleType: 'default' | 'weekday' | 'month' | 'date'
  weekday?: number | null
  month?: number | null
  specificDate?: string | null
  durationMinutes: number
  label?: string | null
}) {
  return db.insert(workScheduleRules).values(data).returning().get()
}

export function updateRule(id: string, data: Partial<typeof workScheduleRules.$inferInsert>) {
  return db
    .update(workScheduleRules)
    .set(data)
    .where(eq(workScheduleRules.id, id))
    .returning()
    .get()
}

export function deleteRule(id: string) {
  return db.delete(workScheduleRules).where(eq(workScheduleRules.id, id)).returning().get()
}
