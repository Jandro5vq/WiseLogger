import type { TaskWithTags } from '@/types/db'

export interface Gap {
  startIso: string
  endIso: string
  durationMinutes: number
}

interface BreakSlot {
  startIso: string
  endIso: string
}

/**
 * Computes unoccupied time slots within the workday.
 * "Workday" is defined as [first period start, last period end].
 * Active tasks (no endTime) use the current time as their end.
 */
export function computeGaps(tasks: TaskWithTags[], breaks: BreakSlot[]): Gap[] {
  const now = new Date().toISOString()

  const intervals = [
    ...tasks.map((t) => ({ start: t.startTime, end: t.endTime ?? now })),
    ...breaks.map((b) => ({ start: b.startIso, end: b.endIso })),
  ]
    .map((iv) => ({ start: new Date(iv.start).getTime(), end: new Date(iv.end).getTime() }))
    .filter((iv) => iv.end > iv.start)
    .sort((a, b) => a.start - b.start)

  if (intervals.length === 0) return []

  const workdayStart = intervals[0].start
  const workdayEnd = intervals[intervals.length - 1].end

  // Merge overlapping intervals to find covered slots
  const covered: { start: number; end: number }[] = []
  for (const iv of intervals) {
    const last = covered[covered.length - 1]
    if (last && iv.start <= last.end) {
      last.end = Math.max(last.end, iv.end)
    } else {
      covered.push({ ...iv })
    }
  }

  // Gaps are the uncovered slots within [workdayStart, workdayEnd]
  const gaps: Gap[] = []
  let cursor = workdayStart
  for (const slot of covered) {
    if (cursor < slot.start) {
      const durationMinutes = Math.round((slot.start - cursor) / 60000)
      if (durationMinutes >= 1) {
        gaps.push({
          startIso: new Date(cursor).toISOString(),
          endIso: new Date(slot.start).toISOString(),
          durationMinutes,
        })
      }
    }
    cursor = Math.max(cursor, slot.end)
  }
  if (cursor < workdayEnd) {
    const durationMinutes = Math.round((workdayEnd - cursor) / 60000)
    if (durationMinutes >= 1) {
      gaps.push({
        startIso: new Date(cursor).toISOString(),
        endIso: new Date(workdayEnd).toISOString(),
        durationMinutes,
      })
    }
  }

  return gaps
}
