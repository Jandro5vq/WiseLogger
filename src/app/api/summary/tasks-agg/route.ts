export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { listEntries } from '@/lib/db/queries/entries'
import { listTasksForEntries } from '@/lib/db/queries/tasks'
import { getBreaksForEntries } from '@/lib/db/queries/entry-breaks'
import { breakToInterval } from '@/lib/business/breaks'
import { netTaskMinutes } from '@/lib/business/balance'

interface TaskAggRow {
  description: string
  totalMinutes: number
  sessions: number
}

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = new URL(req.url).searchParams
  const from = params.get('from') ?? undefined
  const to = params.get('to') ?? undefined

  const entries = listEntries(session.user.id, from, to)
  const entryIds = entries.map((e) => e.id)
  const tasksMap = listTasksForEntries(entryIds)
  const breaksMap = getBreaksForEntries(entryIds)

  const agg = new Map<string, { totalMinutes: number; sessions: number }>()

  for (const entry of entries) {
    const entryTasks = tasksMap.get(entry.id) ?? []
    const entryBreaks = breaksMap.get(entry.id) ?? []
    const breakIntervals = entryBreaks.map((b) => breakToInterval(b, entry.date))

    for (const t of entryTasks) {
      if (!t.startTime || !t.endTime) continue
      const net = netTaskMinutes(t.startTime, t.endTime, breakIntervals)
      if (net <= 0) continue
      const prev = agg.get(t.description)
      if (prev) {
        prev.totalMinutes += net
        prev.sessions += 1
      } else {
        agg.set(t.description, { totalMinutes: net, sessions: 1 })
      }
    }
  }

  const tasks: TaskAggRow[] = Array.from(agg.entries())
    .map(([description, v]) => ({ description, totalMinutes: v.totalMinutes, sessions: v.sessions }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes)

  return NextResponse.json({ tasks }, {
    headers: { 'Cache-Control': 'private, max-age=60' },
  })
}
