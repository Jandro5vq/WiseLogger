export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { listEntries } from '@/lib/db/queries/entries'
import { listTasksForEntry } from '@/lib/db/queries/tasks'
import { getScheduleRules } from '@/lib/db/queries/schedule-rules'
import { parseTaskTags } from '@/types/db'

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const allEntries = listEntries(session.user.id)
  const entriesWithTasks = allEntries.map((entry) => ({
    ...entry,
    tasks: listTasksForEntry(entry.id).map(parseTaskTags),
  }))

  const backup = {
    exportedAt: new Date().toISOString(),
    user: { id: session.user.id, username: session.user.username, email: session.user.email },
    scheduleRules: getScheduleRules(session.user.id),
    entries: entriesWithTasks,
  }

  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="wiselogger-backup.json"',
    },
  })
}
