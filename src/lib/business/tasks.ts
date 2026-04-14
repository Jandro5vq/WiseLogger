import { v4 as uuidv4 } from 'uuid'
import { getEntryByDate, createEntry } from '@/lib/db/queries/entries'
import { getUserById } from '@/lib/db/queries/users'
import { resolveExpectedMinutes } from '@/lib/business/schedule'
import { applyBreakRulesForEntry } from '@/lib/business/breaks'

/**
 * Gets or auto-creates a shift entry for the given user/date.
 * Sets startTime to now on auto-creation.
 * On first creation, seeds break records from break rules using the user's timezone.
 */
export function autoCreateEntry(userId: string, date: string) {
  const existing = getEntryByDate(userId, date)
  if (existing) return existing

  const expectedMinutes = resolveExpectedMinutes(userId, date)
  const entry = createEntry({
    id: uuidv4(),
    userId,
    date,
    startTime: new Date().toISOString(),
    expectedMinutes,
  })
  const user = getUserById(userId)
  applyBreakRulesForEntry(userId, entry.id, date, expectedMinutes, user?.timezone ?? 'UTC')
  return entry
}

export function todayDateString(timezone = 'UTC'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
}
