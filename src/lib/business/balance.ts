import { listEntries, getEntryById } from '@/lib/db/queries/entries'
import { listTasksForEntry, listTasksForEntries } from '@/lib/db/queries/tasks'
import { getEntryBreaks, getBreaksForEntries } from '@/lib/db/queries/entry-breaks'
import { breakToInterval } from '@/lib/business/breaks'
import { sumWorkedMinutes } from '@/lib/business/break-math'

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
 * Computes balance for a user within [fromDate, upToDate] (both inclusive).
 * If fromDate is omitted, reads from the start of history.
 * Always reads from DB — never cached.
 */
export function computeBalance(userId: string, upToDate?: string, fromDate?: string): BalanceResult {
  const to = upToDate ?? new Date().toISOString().split('T')[0]
  const allEntries = listEntries(userId, fromDate, to)
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

    const workedMinutes = sumWorkedMinutes(entryTasks, breakIntervals)

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

  return sumWorkedMinutes(entryTasks, breakIntervals)
}
