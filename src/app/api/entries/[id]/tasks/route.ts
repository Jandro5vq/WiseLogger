export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getSession } from '@/lib/auth/session'
import { getEntryById } from '@/lib/db/queries/entries'
import { getActiveTask, createTask, updateTask, listTasksForEntry } from '@/lib/db/queries/tasks'
import { getEntryBreaks } from '@/lib/db/queries/entry-breaks'
import { parseTaskTags } from '@/types/db'
import { breakToInterval, buildEntryIntervals, detectOverlap } from '@/lib/business/breaks'
import { adjustPrecedingTask } from '@/lib/business/spans'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(_req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const entry = getEntryById(params.id)
  if (!entry || entry.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const rawTasks = listTasksForEntry(params.id)
  return NextResponse.json(rawTasks.map(parseTaskTags))
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const entry = getEntryById(params.id)
  if (!entry || entry.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json()
  const { description, startTime, endTime, tags } = body as {
    description: string
    startTime?: string
    endTime?: string
    tags?: string[]
  }

  if (!description) return NextResponse.json({ error: 'La descripción es obligatoria' }, { status: 400 })

  const effectiveStart = startTime ?? new Date().toISOString()
  const tStart = new Date(effectiveStart).getTime()

  if (endTime) {
    const tEnd = new Date(endTime).getTime()
    if (tEnd <= tStart) {
      return NextResponse.json({ error: 'La hora de fin debe ser posterior a la de inicio' }, { status: 400 })
    }
  }

  // Reject if startTime falls inside a break (breaks are immutable)
  const entryBreaks = getEntryBreaks(params.id)
  const insideBreak = entryBreaks.some((b) => {
    const { startIso, endIso } = breakToInterval(b, entry.date)
    return new Date(startIso).getTime() < tStart && new Date(endIso).getTime() > tStart
  })
  if (insideBreak) {
    return NextResponse.json(
      { error: 'La hora de inicio cae dentro de una pausa' },
      { status: 400 }
    )
  }

  // Truncate any preceding completed task that overlaps at the new task's startTime
  adjustPrecedingTask(params.id, effectiveStart)

  // Validate no remaining overlaps for completed tasks
  if (endTime) {
    const existing = buildEntryIntervals(params.id, entry.date)
    if (detectOverlap(existing, { start: tStart, end: new Date(endTime).getTime() })) {
      return NextResponse.json(
        { error: 'El intervalo se solapa con una tarea o pausa existente' },
        { status: 400 }
      )
    }
  }

  // If starting a new active task, auto-stop any existing active task.
  // Use the new task's startTime as the endTime so there's no gap.
  if (!endTime) {
    const active = getActiveTask(session.user.id)
    if (active) {
      updateTask(active.id, { endTime: effectiveStart })
    }
  }

  const task = createTask({
    id: uuidv4(),
    entryId: params.id,
    userId: session.user.id,
    startTime: effectiveStart,
    endTime,
    description,
    tags: JSON.stringify(tags ?? []),
  })

  return NextResponse.json(parseTaskTags(task), { status: 201 })
}
