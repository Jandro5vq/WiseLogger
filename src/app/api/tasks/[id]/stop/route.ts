export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getTaskById, listTasksForEntry, updateTask } from '@/lib/db/queries/tasks'
import { getEntryBreaks } from '@/lib/db/queries/entry-breaks'
import { getEntryById } from '@/lib/db/queries/entries'
import { breakToInterval } from '@/lib/business/breaks'
import { parseTaskTags } from '@/types/db'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const task = getTaskById(params.id)
  if (!task || task.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (task.endTime) {
    return NextResponse.json({ error: 'Task already stopped' }, { status: 409 })
  }

  // Allow caller to pass a specific endTime (e.g. the start time of the next task)
  let endTime = new Date().toISOString()
  try {
    const body = await req.json()
    if (body?.endTime) endTime = body.endTime
  } catch {
    // no body or not JSON — use now
  }

  // Clamp endTime to the earliest obstacle (existing completed span or break) that
  // starts after the active task's own startTime and before the proposed endTime.
  const taskStart = new Date(task.startTime).getTime()
  const proposed = new Date(endTime).getTime()

  const obstacles: number[] = []

  // Completed spans that would be overlapped
  const siblings = listTasksForEntry(task.entryId)
  for (const t of siblings) {
    if (t.id === params.id || !t.endTime) continue
    const tStart = new Date(t.startTime).getTime()
    if (tStart > taskStart && tStart < proposed) obstacles.push(tStart)
  }

  // Breaks that would be overlapped
  const entry = getEntryById(task.entryId)
  if (entry) {
    for (const b of getEntryBreaks(task.entryId)) {
      const { startIso } = breakToInterval(b, entry.date)
      const bStart = new Date(startIso).getTime()
      if (bStart > taskStart && bStart < proposed) obstacles.push(bStart)
    }
  }

  if (obstacles.length > 0) {
    endTime = new Date(Math.min(...obstacles)).toISOString()
  }

  const updated = updateTask(params.id, { endTime })
  return NextResponse.json(parseTaskTags(updated!))
}
