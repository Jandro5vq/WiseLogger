import { listEntries } from '@/lib/db/queries/entries'
import { listTasksForEntry } from '@/lib/db/queries/tasks'

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

function taskDurationMinutes(startTime: string, endTime: string): number {
  const ms = new Date(endTime).getTime() - new Date(startTime).getTime()
  return ms / 60000
}

/**
 * Computes balance for a user up to the given date (inclusive).
 * Always reads from DB — never cached.
 */
export function computeBalance(userId: string, upToDate?: string): BalanceResult {
  const to = upToDate ?? new Date().toISOString().split('T')[0]
  const allEntries = listEntries(userId, undefined, to)

  const days: DaySummary[] = []
  let totalWorked = 0
  let totalExpected = 0

  for (const entry of allEntries) {
    const entryTasks = listTasksForEntry(entry.id)
    const workedMinutes = entryTasks
      .filter((t) => t.startTime && t.endTime)
      .reduce((sum, t) => sum + taskDurationMinutes(t.startTime, t.endTime!), 0)

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
 * Computes worked minutes for a single entry's tasks.
 */
export function computeEntryWorkedMinutes(entryId: string): number {
  const entryTasks = listTasksForEntry(entryId)
  return entryTasks
    .filter((t) => t.startTime && t.endTime)
    .reduce((sum, t) => sum + taskDurationMinutes(t.startTime, t.endTime!), 0)
}
