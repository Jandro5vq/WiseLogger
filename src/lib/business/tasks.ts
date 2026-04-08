import { v4 as uuidv4 } from 'uuid'
import { getEntryByDate, createEntry } from '@/lib/db/queries/entries'
import { resolveExpectedMinutes } from '@/lib/business/schedule'
import { applyBreakRulesForEntry } from '@/lib/business/breaks'

/**
 * Gets or auto-creates a shift entry for the given user/date.
 * Sets startTime to now on auto-creation.
 * On first creation, seeds break records from break rules.
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
  applyBreakRulesForEntry(userId, entry.id, date, expectedMinutes)
  return entry
}

export function todayDateString(): string {
  return new Date().toISOString().split('T')[0]
}
