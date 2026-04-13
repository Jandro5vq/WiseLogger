import { v4 as uuidv4 } from 'uuid'
import { getBreakRules } from '@/lib/db/queries/break-rules'
import { getEntryBreaks, createEntryBreak, getEntryBreakById } from '@/lib/db/queries/entry-breaks'
import { listTasksForEntry } from '@/lib/db/queries/tasks'

/**
 * Convert a local HH:MM time on a given YYYY-MM-DD date to a UTC ISO string,
 * using the provided IANA timezone.
 * Falls back to treating HH:MM as server local time if the timezone is invalid.
 */
export function hhmmToUTC(dateStr: string, timeStr: string, timezone: string): string {
  try {
    // Build a "naive" UTC stamp treating the input as if it were UTC
    const naive = new Date(`${dateStr}T${timeStr}:00Z`)
    // Determine what local time that UTC moment reads as in the target timezone
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(naive)
    const p: Record<string, number> = {}
    for (const { type, value } of parts) p[type] = parseInt(value)
    const localH = (p.hour ?? 0) % 24  // some engines emit 24 for midnight
    const [wantedH, wantedM] = timeStr.split(':').map(Number)
    // Shift the naive stamp so its local representation equals the desired HH:MM
    const offsetMs = (localH - wantedH) * 3_600_000 + ((p.minute ?? 0) - wantedM) * 60_000
    return new Date(naive.getTime() - offsetMs).toISOString()
  } catch {
    return new Date(`${dateStr}T${timeStr}:00`).toISOString()
  }
}

// ─── interval helpers ─────────────────────────────────────────────────────────

export interface Interval {
  start: number // ms epoch
  end: number
}

/**
 * Convert an entryBreak to an absolute ISO interval.
 * breakStart can be either:
 *   - A full UTC ISO string (new format, created from the browser)
 *   - 'HH:MM' local time (legacy / rule-seeded breaks). Converted using entryDate
 *     and the server's local timezone — works correctly when server TZ matches user TZ.
 */
export function breakToInterval(
  breakRec: { breakStart: string; durationMinutes: number },
  entryDate: string
): { startIso: string; endIso: string } {
  const isIso = breakRec.breakStart.length > 5
  const startIso = isIso
    ? breakRec.breakStart
    : new Date(`${entryDate}T${breakRec.breakStart}:00`).toISOString()
  const endIso = new Date(new Date(startIso).getTime() + breakRec.durationMinutes * 60_000).toISOString()
  return { startIso, endIso }
}

/** Returns true if candidate overlaps any of the existing intervals. */
export function detectOverlap(existing: Interval[], candidate: Interval): boolean {
  return existing.some((iv) => candidate.start < iv.end && candidate.end > iv.start)
}

/**
 * Build all current intervals for an entry (tasks + breaks), optionally
 * excluding one ID (for edit scenarios).
 */
export function buildEntryIntervals(
  entryId: string,
  entryDate: string,
  options: { excludeTaskId?: string; excludeBreakId?: string } = {}
): Interval[] {
  const intervals: Interval[] = []

  const tasks = listTasksForEntry(entryId)
  for (const t of tasks) {
    if (options.excludeTaskId && t.id === options.excludeTaskId) continue
    if (!t.endTime) continue
    intervals.push({
      start: new Date(t.startTime).getTime(),
      end: new Date(t.endTime).getTime(),
    })
  }

  const breaks = getEntryBreaks(entryId)
  for (const b of breaks) {
    if (options.excludeBreakId && b.id === options.excludeBreakId) continue
    const { startIso, endIso } = breakToInterval(b, entryDate)
    intervals.push({
      start: new Date(startIso).getTime(),
      end: new Date(endIso).getTime(),
    })
  }

  return intervals
}

/**
 * Called once when a new entry is created.
 * Applies all matching break rules and seeds entryBreaks records.
 * Break rule times (HH:MM) are converted to UTC ISO using the user's timezone.
 */
export function applyBreakRulesForEntry(
  userId: string,
  entryId: string,
  date: string,
  expectedMinutes: number,
  timezone = 'UTC'
): void {
  const rules = getBreakRules(userId)
  const existing = getEntryBreaks(entryId)
  const existingRuleIds = new Set(existing.map((b) => b.fromRuleId).filter(Boolean))

  // Day-of-week for the entry date (0=Sun … 6=Sat)
  const dayOfWeek = new Date(date + 'T12:00:00Z').getDay()

  for (const rule of rules) {
    if (existingRuleIds.has(rule.id)) continue

    const matches =
      rule.ruleType === 'always' ||
      (rule.ruleType === 'schedule_duration' && rule.scheduleDuration === expectedMinutes) ||
      (rule.ruleType === 'weekday' && rule.weekday === dayOfWeek)

    if (matches) {
      createEntryBreak({
        id: uuidv4(),
        entryId,
        userId,
        breakStart: hhmmToUTC(date, rule.breakStart, timezone),
        durationMinutes: rule.durationMinutes,
        label: rule.label ?? null,
        fromRuleId: rule.id,
      })
    }
  }
}
