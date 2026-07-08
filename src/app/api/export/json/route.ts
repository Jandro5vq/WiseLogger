export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { listEntries } from '@/lib/db/queries/entries'
import { listTasksForEntries } from '@/lib/db/queries/tasks'
import { getScheduleRules } from '@/lib/db/queries/schedule-rules'
import { parseTaskTags } from '@/types/db'

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Optional from/to scope the export to the period selected on the Stats page;
  // omitting them keeps the full-history behavior.
  const sp = new URL(req.url).searchParams
  const from = sp.get('from') ?? undefined
  const to = sp.get('to') ?? undefined

  const allEntries = listEntries(session.user.id, from, to)
  const tasksMap = listTasksForEntries(allEntries.map((e) => e.id))
  const entriesWithTasks = allEntries.map((entry) => ({
    ...entry,
    tasks: (tasksMap.get(entry.id) ?? []).map(parseTaskTags),
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
