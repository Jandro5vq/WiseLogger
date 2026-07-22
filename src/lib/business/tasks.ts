import { v4 as uuidv4 } from 'uuid'
import { getEntryByDate, createEntry } from '@/lib/db/queries/entries'
import { getUserById } from '@/lib/db/queries/users'
import { resolveExpectedMinutes } from '@/lib/business/schedule'
import { applyBreakRulesForEntry } from '@/lib/business/breaks'
import { dateStringInTz, hhmmToUTC } from '@/lib/tz'

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

/**
 * Explicitly creates a shift entry for a date the user picks themselves — e.g.
 * retroactively logging a past day they forgot. Unlike autoCreateEntry (which
 * anchors startTime to the real "now", meaningful only because it's always
 * called for today), this always belongs to a specific already-past date, so
 * startTime is anchored to 09:00 local on that date instead.
 */
export function createEntryForDate(userId: string, date: string) {
  const existing = getEntryByDate(userId, date)
  if (existing) return existing

  const user = getUserById(userId)
  const timezone = user?.timezone ?? 'UTC'
  const expectedMinutes = resolveExpectedMinutes(userId, date)
  const entry = createEntry({
    id: uuidv4(),
    userId,
    date,
    startTime: hhmmToUTC(date, '09:00', timezone),
    expectedMinutes,
  })
  applyBreakRulesForEntry(userId, entry.id, date, expectedMinutes, timezone)
  return entry
}

export function todayDateString(timezone = 'UTC'): string {
  return dateStringInTz(new Date(), timezone)
}
