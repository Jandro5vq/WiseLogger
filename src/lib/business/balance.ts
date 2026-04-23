import { listEntries, getEntryById } from '@/lib/db/queries/entries'
import { listTasksForEntry, listTasksForEntries } from '@/lib/db/queries/tasks'
import { getEntryBreaks, getBreaksForEntries } from '@/lib/db/queries/entry-breaks'
import { breakToInterval } from '@/lib/business/breaks'

export interface DaySummary {
  date: string
  workedMinutes: number
  expectedMinutes: number
  dayBalance: number
}

export interface BalanceResult {
  days: DaySummary[]
  totalWorkedMinutes: number
  totalExpectedMinutes: number
  cumulativeBalance: number
}

/**
 * Net task duration minus any overlapping break time, in minutes.
 * Known limitation: tasks spanning midnight are not split across entries.
 * Breaks on the next calendar day won't be deducted from midnight-spanning tasks.
 */
function netTaskMinutes(
  startTime: string,
  endTime: string,
  breakIntervals: Array<{ startIso: string; endIso: string }>
): number {
  const taskStart = new Date(startTime).getTime()
  const taskEnd = new Date(endTime).getTime()
  const taskMs = taskEnd - taskStart

  const overlapMs = breakIntervals.reduce((ov, bi) => {
    const oStart = Math.max(taskStart, new Date(bi.startIso).getTime())
    const oEnd = Math.min(taskEnd, new Date(bi.endIso).getTime())
    return ov + Math.max(0, oEnd - oStart)
  }, 0)

  return Math.max(0, taskMs - overlapMs) / 60_000
}

/**
 * Computes balance for a user up to the given date (inclusive).
 * Always reads from DB — never cached.
 */
export function computeBalance(userId: string, upToDate?: string): BalanceResult {
  const to = upToDate ?? new Date().toISOString().split('T')[0]
  const allEntries = listEntries(userId, undefined, to)
  const entryIds = allEntries.map((e) => e.id)

  // Batch-fetch all tasks and breaks in 2 queries instead of 2N
  const tasksMap = listTasksForEntries(entryIds)
  const breaksMap = getBreaksForEntries(entryIds)

  const days: DaySummary[] = []
  let totalWorked = 0
  let totalExpected = 0

  for (const entry of allEntries) {
    const entryTasks = tasksMap.get(entry.id) ?? []
    const entryBreaks = breaksMap.get(entry.id) ?? []
    const breakIntervals = entryBreaks.map((b) => breakToInterval(b, entry.date))

    const workedMinutes = entryTasks
      .filter((t) => t.startTime && t.endTime)
      .reduce((sum, t) => sum + netTaskMinutes(t.startTime, t.endTime!, breakIntervals), 0)

    const dayBalance = workedMinutes - entry.expectedMinutes
    totalWorked += workedMinutes
    totalExpected += entry.expectedMinutes

    days.push({
      date: entry.date,
      workedMinutes,
      expectedMinutes: entry.expectedMinutes,
      dayBalance,
    })
  }

  return {
    days,
    totalWorkedMinutes: totalWorked,
    totalExpectedMinutes: totalExpected,
    cumulativeBalance: totalWorked - totalExpected,
  }
}

/**
 * Computes net worked minutes for a single entry's tasks (breaks subtracted).
 */
export function computeEntryWorkedMinutes(entryId: string): number {
  const entry = getEntryById(entryId)
  if (!entry) return 0

  const entryTasks = listTasksForEntry(entryId)
  const entryBreaks = getEntryBreaks(entryId)
  const breakIntervals = entryBreaks.map((b) => breakToInterval(b, entry.date))

  return entryTasks
    .filter((t) => t.startTime && t.endTime)
    .reduce((sum, t) => sum + netTaskMinutes(t.startTime, t.endTime!, breakIntervals), 0)
}
