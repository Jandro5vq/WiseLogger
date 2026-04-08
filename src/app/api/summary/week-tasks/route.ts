export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getEntryByDate } from '@/lib/db/queries/entries'
import { listTasksForEntry } from '@/lib/db/queries/tasks'
import { computeEntryWorkedMinutes } from '@/lib/business/balance'
import { parseTaskTags } from '@/types/db'

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

  const days = []
  for (let i = 0; i < 7; i++) {
    const dayDate = addDays(from, i)
    const entry = getEntryByDate(session.user.id, dayDate)
    const tasks = entry ? listTasksForEntry(entry.id).map(parseTaskTags) : []
    const workedMinutes = entry ? computeEntryWorkedMinutes(entry.id) : 0
    const expectedMinutes = entry?.expectedMinutes ?? 0
    days.push({
      date: dayDate,
      entry: entry ?? null,
      tasks,
      workedMinutes,
      expectedMinutes,
      dayBalance: workedMinutes - expectedMinutes,
    })
  }

  return NextResponse.json({
    from,
    to,
    days,
    totalWorkedMinutes: days.reduce((s, d) => s + d.workedMinutes, 0),
    totalExpectedMinutes: days.reduce((s, d) => s + d.expectedMinutes, 0),
    weekBalance: days.reduce((s, d) => s + d.dayBalance, 0),
  })
}
