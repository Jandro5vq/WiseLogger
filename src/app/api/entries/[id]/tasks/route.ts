export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { z } from 'zod'
import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getSession } from '@/lib/auth/session'
import { getEntryById } from '@/lib/db/queries/entries'
import { getActiveTask, createTask, listTasksForEntry, getTaskById } from '@/lib/db/queries/tasks'
import { sqlite } from '@/lib/db'
import { getEntryBreaks } from '@/lib/db/queries/entry-breaks'
import { parseTaskTags } from '@/types/db'
import { breakToInterval, buildEntryIntervals, detectOverlap } from '@/lib/business/breaks'
import { adjustPrecedingTask, splitIntervalAroundBreaks, adjustAdjacentTasksForEdit, mergeContiguousSpans, splitEntryTasksAcrossMidnights } from '@/lib/business/spans'
import { stopTask } from '@/lib/business/stop'
import { WriteConflictError, hasInternalOverlap } from '@/lib/business/overlaps'
import { dateStringInTz } from '@/lib/tz'
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

  // The task must start on the calendar day this entry belongs to — every overlap
  // check downstream is scoped per-entry, so a startTime for a different day would
  // slip past them invisibly. Multi-day spans are still fine (splitEntryTasksAcrossMidnights
  // fans a completed task out across its own day-entries after creation).
  const startDate = dateStringInTz(new Date(effectiveStart), session.user.timezone)
  if (startDate !== entry.date) {
    return NextResponse.json(
      { error: 'La hora de inicio no corresponde al día de esta jornada' },
      { status: 400 }
    )
  }

  // Reject if task overlaps any break (breaks are immutable from this route)
  const entryBreaks = getEntryBreaks(params.id)
  const breakIntervals = entryBreaks.map((b) => {
    const { startIso, endIso } = breakToInterval(b, entry.date)
    return { start: new Date(startIso).getTime(), end: new Date(endIso).getTime() }
  })

  let deletedDescriptions: string[] = []
  let headTaskId: string

  try {
    if (endTime) {
      const tEnd = new Date(endTime).getTime()

      if (detectOverlap(breakIntervals, { start: tStart, end: tEnd })) {
        // Completed task overlaps break(s) → split into multiple segments
        const segments = splitIntervalAroundBreaks(tStart, tEnd, breakIntervals)
        if (segments.length === 0) {
          throw new WriteConflictError('El intervalo cae completamente dentro de una pausa', 400)
        }

        headTaskId = sqlite.transaction(() => {
          const { deletedDescriptions: dd } = adjustAdjacentTasksForEdit(params.id, '', effectiveStart, endTime)
          deletedDescriptions = dd

          adjustPrecedingTask(params.id, new Date(segments[0].start).toISOString())

          const createdTasks = segments.map((seg) =>
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

          splitEntryTasksAcrossMidnights(params.id, session.user.id, session.user.timezone)
          mergeContiguousSpans(params.id)

          const finalIntervals = buildEntryIntervals(params.id, entry.date, { includeActive: true })
          if (hasInternalOverlap(finalIntervals)) {
            throw new WriteConflictError('El intervalo se solapa con una tarea o pausa existente')
          }

          // Re-fetch: the split/merge above may have trimmed the first segment.
          return getTaskById(createdTasks[0].id)?.id ?? createdTasks[0].id
        })()
      } else {
        // No break overlap — carve adjacent tasks (including the active one) to
        // make room, then create.
        headTaskId = sqlite.transaction(() => {
          const { deletedDescriptions: dd } = adjustAdjacentTasksForEdit(params.id, '', effectiveStart, endTime)
          deletedDescriptions = dd

          adjustPrecedingTask(params.id, effectiveStart)

          const created = createTask({
            id: uuidv4(),
            entryId: params.id,
            userId: session.user.id,
            startTime: effectiveStart,
            endTime,
            description,
            tags: JSON.stringify(tags ?? []),
            notes: notes ?? null,
          })

          splitEntryTasksAcrossMidnights(params.id, session.user.id, session.user.timezone)
          mergeContiguousSpans(params.id)

          const finalIntervals = buildEntryIntervals(params.id, entry.date, { includeActive: true })
          if (hasInternalOverlap(finalIntervals)) {
            throw new WriteConflictError('El intervalo se solapa con una tarea o pausa existente')
          }

          return getTaskById(created.id)?.id ?? created.id
        })()
      }
    } else {
      // An open-ended (active) task only makes sense on today's entry — a past
      // day is by definition already over, so it can never legitimately have an
      // in-progress task "still running".
      if (entry.date !== dateStringInTz(new Date(), session.user.timezone)) {
        throw new WriteConflictError('No se puede dejar una tarea en curso en un día pasado; indica una hora de fin', 400)
      }

      // Active task: point-in-break check for startTime only (breaks are immutable here)
      const insideBreak = breakIntervals.some((iv) => tStart > iv.start && tStart < iv.end)
      if (insideBreak) {
        throw new WriteConflictError('La hora de inicio cae dentro de una pausa', 400)
      }

      headTaskId = sqlite.transaction(() => {
        adjustPrecedingTask(params.id, effectiveStart)

        // Closing the current active task at the new task's start must itself
        // respect any obstacle between them — reuse stopTask's clamp/reject logic
        // instead of writing endTime directly.
        const active = getActiveTask(session.user.id)
        if (active) {
          if (tStart <= new Date(active.startTime).getTime()) {
            throw new WriteConflictError('La hora de fin debe ser posterior a la de inicio', 400)
          }
          const stopped = stopTask(active.id, session.user.id, session.user.timezone, effectiveStart)
          if (!stopped.ok) {
            throw new WriteConflictError(stopped.error, stopped.status === 400 ? 400 : 409)
          }
        }

        const created = createTask({
          id: uuidv4(),
          entryId: params.id,
          userId: session.user.id,
          startTime: effectiveStart,
          description,
          tags: JSON.stringify(tags ?? []),
          notes: notes ?? null,
        })

        const finalIntervals = buildEntryIntervals(params.id, entry.date, { includeActive: true })
        if (hasInternalOverlap(finalIntervals)) {
          throw new WriteConflictError('El intervalo se solapa con una tarea o pausa existente')
        }

        return created.id
      })()
    }
  } catch (e) {
    if (e instanceof WriteConflictError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    throw e
  }

  const created = getTaskById(headTaskId)!
  return NextResponse.json({ task: parseTaskTags(created), deletedDescriptions }, { status: 201 })
}
