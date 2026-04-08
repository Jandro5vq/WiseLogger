export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getEntryByDate } from '@/lib/db/queries/entries'
import { listTasksForEntry } from '@/lib/db/queries/tasks'
import { computeBalance, computeEntryWorkedMinutes } from '@/lib/business/balance'
import { parseTaskTags } from '@/types/db'

export async function GET(req: NextRequest, { params }: { params: { date: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { date } = params
  const entry = getEntryByDate(session.user.id, date)

  if (!entry) {
    return NextResponse.json({ date, entry: null, tasks: [], workedMinutes: 0, dayBalance: 0 })
  }

  const rawTasks = listTasksForEntry(entry.id)
  const workedMinutes = computeEntryWorkedMinutes(entry.id)
  const dayBalance = workedMinutes - entry.expectedMinutes
  const { cumulativeBalance } = computeBalance(session.user.id, date)

  return NextResponse.json({
    date,
    entry,
    tasks: rawTasks.map(parseTaskTags),
    workedMinutes,
    dayBalance,
    cumulativeBalance,
  })
}
