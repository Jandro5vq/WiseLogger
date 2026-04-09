import { v4 as uuidv4 } from 'uuid'
import { getBreakRules } from '@/lib/db/queries/break-rules'
import { getEntryBreaks, createEntryBreak, getEntryBreakById } from '@/lib/db/queries/entry-breaks'
import { listTasksForEntry } from '@/lib/db/queries/tasks'

// ─── interval helpers ─────────────────────────────────────────────────────────

export interface Interval {
  start: number // ms epoch
  end: number
}

/** Convert an entryBreak (HH:MM + duration) to an absolute ISO interval using the entry date. */
export function breakToInterval(
  breakRec: { breakStart: string; durationMinutes: number },
  entryDate: string
): { startIso: string; endIso: string } {
  const startIso = new Date(`${entryDate}T${breakRec.breakStart}:00`).toISOString()
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
 */
export function applyBreakRulesForEntry(
  userId: string,
  entryId: string,
  date: string,
  expectedMinutes: number
): void {
  const rules = getBreakRules(userId)
  const existing = getEntryBreaks(entryId)
  const existingRuleIds = new Set(existing.map((b) => b.fromRuleId).filter(Boolean))

  // Day-of-week for the entry date (0=Sun … 6=Sat)
  const dayOfWeek = new Date(date + 'T12:00:00').getDay()

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
        breakStart: rule.breakStart,
        durationMinutes: rule.durationMinutes,
        label: rule.label ?? null,
        fromRuleId: rule.id,
      })
    }
  }
}
