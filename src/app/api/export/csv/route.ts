export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { listEntries } from '@/lib/db/queries/entries'
import { listTasksForEntry } from '@/lib/db/queries/tasks'

function escapeCsv(val: unknown): string {
  const s = String(val ?? '')
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const allEntries = listEntries(session.user.id)
  const rows: string[] = [
    'date,entry_start,entry_end,expected_minutes,task_start,task_end,task_description,task_tags,task_duration_minutes',
  ]

  for (const entry of allEntries) {
    const tasks = listTasksForEntry(entry.id)
    if (tasks.length === 0) {
      rows.push(
        [entry.date, entry.startTime ?? '', entry.endTime ?? '', entry.expectedMinutes, '', '', '', '', '']
          .map(escapeCsv)
          .join(',')
      )
    } else {
      for (const task of tasks) {
        const durationMs =
          task.endTime
            ? new Date(task.endTime).getTime() - new Date(task.startTime).getTime()
            : null
        const durationMin = durationMs !== null ? (durationMs / 60000).toFixed(1) : ''
        rows.push(
          [
            entry.date,
            entry.startTime ?? '',
            entry.endTime ?? '',
            entry.expectedMinutes,
            task.startTime,
            task.endTime ?? '',
            task.description,
            task.tags,
            durationMin,
          ]
            .map(escapeCsv)
            .join(',')
        )
      }
    }
  }

  return new NextResponse(rows.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="wiselogger-export.csv"',
    },
  })
}
