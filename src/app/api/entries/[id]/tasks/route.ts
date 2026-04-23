export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getSession } from '@/lib/auth/session'
import { getEntryById } from '@/lib/db/queries/entries'
import { getActiveTask, createTask, updateTask, listTasksForEntry } from '@/lib/db/queries/tasks'
import { sqlite } from '@/lib/db'
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
  const { description, startTime, endTime, tags, notes } = body as {
    description: string
    startTime?: string
    endTime?: string
    tags?: string[]
    notes?: string | null
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

  // Reject if task overlaps any break (breaks are immutable)
  const entryBreaks = getEntryBreaks(params.id)
  const breakIntervals = entryBreaks.map((b) => {
    const { startIso, endIso } = breakToInterval(b, entry.date)
    return { start: new Date(startIso).getTime(), end: new Date(endIso).getTime() }
  })
  if (endTime) {
    // Completed task: full interval overlap check
    if (detectOverlap(breakIntervals, { start: tStart, end: new Date(endTime).getTime() })) {
      return NextResponse.json(
        { error: 'El intervalo se solapa con una pausa existente' },
        { status: 400 }
      )
    }
  } else {
    // Active task: point-in-break check for startTime only
    const insideBreak = breakIntervals.some((iv) => tStart > iv.start && tStart < iv.end)
    if (insideBreak) {
      return NextResponse.json(
        { error: 'La hora de inicio cae dentro de una pausa' },
        { status: 400 }
      )
    }
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

  // Atomic: stop active task + create new one in a transaction to prevent races
  const task = sqlite.transaction(() => {
    if (!endTime) {
      const active = getActiveTask(session.user.id)
      if (active) {
        updateTask(active.id, { endTime: effectiveStart })
      }
    }

    return createTask({
      id: uuidv4(),
      entryId: params.id,
      userId: session.user.id,
      startTime: effectiveStart,
      endTime,
      description,
      tags: JSON.stringify(tags ?? []),
      notes: notes ?? null,
    })
  })()

  return NextResponse.json(parseTaskTags(task), { status: 201 })
}
