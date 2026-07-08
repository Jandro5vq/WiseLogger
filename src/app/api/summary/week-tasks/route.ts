export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { listEntries } from '@/lib/db/queries/entries'
import { listTasksForEntries } from '@/lib/db/queries/tasks'
import { getBreaksForEntries } from '@/lib/db/queries/entry-breaks'
import { breakToInterval } from '@/lib/business/breaks'
import { sumWorkedMinutes } from '@/lib/business/break-math'
import { getWeekBounds, addDateStr, dateStringInTz } from '@/lib/tz'
import { parseTaskTags } from '@/types/db'

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Default to today in the user's timezone — the UTC date can be a day off.
  const date = new URL(req.url).searchParams.get('date') ?? dateStringInTz(new Date(), session.user.timezone)
  const { from, to } = getWeekBounds(date)

  // Build date range for the week
  const weekDates: string[] = []
  for (let i = 0; i < 7; i++) weekDates.push(addDateStr(from, i))

  // Batch-fetch entries, tasks, and breaks (3 queries instead of 21+)
  const weekEntries = listEntries(session.user.id, from, to)
  const entryByDate = new Map(weekEntries.map((e) => [e.date, e]))
  const entryIds = weekEntries.map((e) => e.id)
  const tasksMap = listTasksForEntries(entryIds)
  const breaksMap = getBreaksForEntries(entryIds)

  function breakIntervalsFor(entryId: string, entryDate: string) {
    return (breaksMap.get(entryId) ?? []).map((b) => breakToInterval(b, entryDate))
  }

  const days = weekDates.map((dayDate) => {
    const entry = entryByDate.get(dayDate)
    const breaks = entry ? breakIntervalsFor(entry.id, entry.date) : []
    const tasks = entry ? (tasksMap.get(entry.id) ?? []).map(parseTaskTags) : []
    const workedMinutes = entry ? sumWorkedMinutes(tasksMap.get(entry.id) ?? [], breaks) : 0
    const expectedMinutes = entry?.expectedMinutes ?? 0
    return {
      date: dayDate,
      entry: entry ?? null,
      tasks,
      breaks,
      workedMinutes,
      expectedMinutes,
      dayBalance: workedMinutes - expectedMinutes,
    }
  })

  return NextResponse.json({
    from,
    to,
    days,
    totalWorkedMinutes: days.reduce((s, d) => s + d.workedMinutes, 0),
    totalExpectedMinutes: days.reduce((s, d) => s + d.expectedMinutes, 0),
    weekBalance: days.reduce((s, d) => s + d.dayBalance, 0),
  })
}
