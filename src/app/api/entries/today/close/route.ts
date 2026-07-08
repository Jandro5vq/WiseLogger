export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getEntryByDate, updateEntry } from '@/lib/db/queries/entries'
import { listTasksForEntry } from '@/lib/db/queries/tasks'
import { todayDateString } from '@/lib/business/tasks'
import { stopTask } from '@/lib/business/stop'

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = todayDateString(session.user.timezone)
  const entry = getEntryByDate(session.user.id, today)
  if (!entry) return NextResponse.json({ error: 'No entry for today' }, { status: 404 })

  if (entry.endTime) {
    return NextResponse.json({ error: 'Entry already closed' }, { status: 409 })
  }

  const closeTime = new Date().toISOString()
  for (const t of listTasksForEntry(entry.id).filter((t) => !t.endTime)) {
    // stopTask validates and splits across local midnights. It can only fail here
    // if the row is already corrupt (start in the future) — skip rather than 500.
    stopTask(t.id, session.user.id, session.user.timezone, closeTime)
  }

  const updated = updateEntry(entry.id, { endTime: closeTime })
  return NextResponse.json(updated)
}
