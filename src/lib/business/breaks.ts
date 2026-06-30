import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { getBreakRules } from '@/lib/db/queries/break-rules'
import { getEntryBreaks, createEntryBreak, getEntryBreakById } from '@/lib/db/queries/entry-breaks'
import { listTasksForEntry } from '@/lib/db/queries/tasks'
import { hhmmToUTC, weekdayOf } from '@/lib/tz'

// Re-export for existing importers.
export { hhmmToUTC }

/** No break can be longer than a full day. */
const MAX_BREAK_MINUTES = 24 * 60

/** Validates break input on create: a non-empty start and a strictly positive, bounded duration. */
export const CreateBreakSchema = z.object({
  breakStart: z.string().min(1, 'breakStart es obligatorio'),
  durationMinutes: z
    .number()
    .int('La duración debe ser un número entero de minutos')
    .positive('La duración debe ser mayor que 0')
    .max(MAX_BREAK_MINUTES, 'La duración de la pausa es demasiado larga'),
  label: z.string().nullable().optional(),
})

/** Same fields as {@link CreateBreakSchema} but all optional, for partial edits. */
export const UpdateBreakSchema = CreateBreakSchema.partial()

/**
 * Normalize a break's start value to a UTC ISO instant. Accepts either an ISO
 * string (returned unchanged) or legacy 'HH:MM' local time, resolved against the
 * entry date in the given timezone. Every writer should persist the result so that
 * read-time interpretation never depends on the server's timezone.
 */
export function toBreakStartIso(value: string, dateStr: string, timezone = 'UTC'): string {
  const isIso = /^\d{4}-\d{2}-\d{2}T/.test(value)
  return isIso ? value : hhmmToUTC(dateStr, value, timezone)
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
  const isIso = /^\d{4}-\d{2}-\d{2}T/.test(breakRec.breakStart)
  const startIso = isIso
    ? breakRec.breakStart
    : new Date(`${entryDate}T${breakRec.breakStart}:00`).toISOString()
  // Clamp to ≥0 so a corrupt/negative duration can never yield an inverted interval
  // (endIso < startIso), which would break overlap math and span-carving downstream.
  const durationMs = Math.max(0, breakRec.durationMinutes) * 60_000
  const endIso = new Date(new Date(startIso).getTime() + durationMs).toISOString()
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
 * Note: break rules are not retroactive — changing rules won't update existing entries.
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

  // Day-of-week for the entry date (0=Sun … 6=Sat), host-tz independent.
  const dayOfWeek = weekdayOf(date)

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
