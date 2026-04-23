export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { listEntries } from '@/lib/db/queries/entries'
import { listTasksForEntries } from '@/lib/db/queries/tasks'
import { getBreaksForEntries } from '@/lib/db/queries/entry-breaks'
import { breakToInterval } from '@/lib/business/breaks'
import { parseTaskTags } from '@/types/db'
import type { Task } from '@/types/db'

function localDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getWeekBounds(dateStr: string): { from: string; to: string } {
  const d = new Date(dateStr + 'T00:00:00')
  const monday = new Date(d)
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { from: localDate(monday), to: localDate(sunday) }
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return localDate(d)
}

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const date = new URL(req.url).searchParams.get('date') ?? new Date().toISOString().split('T')[0]
  const { from, to } = getWeekBounds(date)

  // Build date range for the week
  const weekDates: string[] = []
  for (let i = 0; i < 7; i++) weekDates.push(addDays(from, i))

  // Batch-fetch entries, tasks, and breaks (3 queries instead of 21+)
  const weekEntries = listEntries(session.user.id, from, to)
  const entryByDate = new Map(weekEntries.map((e) => [e.date, e]))
  const entryIds = weekEntries.map((e) => e.id)
  const tasksMap = listTasksForEntries(entryIds)
  const breaksMap = getBreaksForEntries(entryIds)

  function computeWorked(entryId: string, entryDate: string): number {
    const entryTasks = tasksMap.get(entryId) ?? []
    const entryBreaks = breaksMap.get(entryId) ?? []
    const breakIntervals = entryBreaks.map((b) => breakToInterval(b, entryDate))

    return entryTasks
      .filter((t: Task) => t.startTime && t.endTime)
      .reduce((sum: number, t: Task) => {
        const taskStart = new Date(t.startTime).getTime()
        const taskEnd = new Date(t.endTime!).getTime()
        const taskMs = taskEnd - taskStart
        const overlapMs = breakIntervals.reduce((ov, bi) => {
          const oStart = Math.max(taskStart, new Date(bi.startIso).getTime())
          const oEnd = Math.min(taskEnd, new Date(bi.endIso).getTime())
          return ov + Math.max(0, oEnd - oStart)
        }, 0)
        return sum + Math.max(0, taskMs - overlapMs) / 60_000
      }, 0)
  }

  const days = weekDates.map((dayDate) => {
    const entry = entryByDate.get(dayDate)
    const tasks = entry ? (tasksMap.get(entry.id) ?? []).map(parseTaskTags) : []
    const workedMinutes = entry ? computeWorked(entry.id, entry.date) : 0
    const expectedMinutes = entry?.expectedMinutes ?? 0
    return {
      date: dayDate,
      entry: entry ?? null,
      tasks,
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
