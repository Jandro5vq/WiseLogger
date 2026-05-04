export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { z } from 'zod'
import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getSession } from '@/lib/auth/session'
import { getEntryById } from '@/lib/db/queries/entries'
import { getActiveTask, createTask, updateTask, listTasksForEntry } from '@/lib/db/queries/tasks'
import { sqlite } from '@/lib/db'
import { getEntryBreaks } from '@/lib/db/queries/entry-breaks'
import { parseTaskTags } from '@/types/db'
import { breakToInterval, buildEntryIntervals, detectOverlap } from '@/lib/business/breaks'
import { adjustPrecedingTask, splitIntervalAroundBreaks, adjustAdjacentTasksForEdit, mergeContiguousSpans } from '@/lib/business/spans'
import { parseBody } from '@/lib/api'

const CreateTaskSchema = z.object({
  description: z.string().min(1, 'La descripción es obligatoria'),
  startTime: z.string().datetime({ message: 'startTime debe ser una fecha ISO válida' }).optional(),
  endTime: z.string().datetime({ message: 'endTime debe ser una fecha ISO válida' }).optional(),
  tags: z.array(z.string()).default([]),
  notes: z.string().nullable().optional(),
})

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

  const raw = await req.json()
  const parsed = parseBody(CreateTaskSchema, raw)
  if (!parsed.ok) return parsed.response
  const { description, startTime, endTime, tags, notes } = parsed.data

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
  let deletedDescriptions: string[] = []

  if (endTime) {
    const tEnd = new Date(endTime).getTime()
    if (detectOverlap(breakIntervals, { start: tStart, end: tEnd })) {
      // Completed task overlaps break(s) → split into multiple segments
      const segments = splitIntervalAroundBreaks(tStart, tEnd, breakIntervals)
      if (segments.length === 0) {
        return NextResponse.json(
          { error: 'El intervalo cae completamente dentro de una pausa' },
          { status: 400 }
        )
      }

      // Pisa tareas que queden completamente cubiertas por los nuevos segmentos
      const { deletedDescriptions: dd } = adjustAdjacentTasksForEdit(params.id, '', effectiveStart, endTime)
      deletedDescriptions = dd

      adjustPrecedingTask(params.id, new Date(segments[0].start).toISOString())

      const createdTasks = sqlite.transaction(() => {
        return segments.map((seg) =>
          createTask({
            id: uuidv4(),
            entryId: params.id,
            userId: session.user.id,
            startTime: new Date(seg.start).toISOString(),
            endTime: new Date(seg.end).toISOString(),
            description,
            tags: JSON.stringify(tags ?? []),
            notes: notes ?? null,
          })
        )
      })()

      mergeContiguousSpans(params.id)
      return NextResponse.json({ task: parseTaskTags(createdTasks[0]), deletedDescriptions }, { status: 201 })
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

  // Pisa tareas que queden completamente cubiertas — solo para tareas completas
  if (endTime) {
    const { deletedDescriptions: dd } = adjustAdjacentTasksForEdit(params.id, '', effectiveStart, endTime)
    deletedDescriptions = dd
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

  mergeContiguousSpans(params.id)
  return NextResponse.json({ task: parseTaskTags(task), deletedDescriptions }, { status: 201 })
}
