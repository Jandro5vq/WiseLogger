export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { z } from 'zod'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getTaskById, updateTask, deleteTask, getActiveTask, createTask } from '@/lib/db/queries/tasks'
import { getEntryById } from '@/lib/db/queries/entries'
import { parseTaskTags } from '@/types/db'
import { breakToInterval, buildEntryIntervals, type Interval } from '@/lib/business/breaks'
import { getEntryBreaks } from '@/lib/db/queries/entry-breaks'
import { adjustAdjacentTasksForEdit, splitIntervalAroundBreaks, mergeContiguousSpans, splitEntryTasksAcrossMidnights } from '@/lib/business/spans'
import { WriteConflictError, hasInternalOverlap } from '@/lib/business/overlaps'
import { dateStringInTz } from '@/lib/tz'
import { v4 as uuidv4 } from 'uuid'
import { sqlite } from '@/lib/db'
import { parseBody } from '@/lib/api'

const PatchTaskSchema = z.object({
  description: z.string().min(1, 'La descripción no puede estar vacía').optional(),
  startTime: z.string().datetime({ message: 'startTime debe ser una fecha ISO válida' }).optional(),
  endTime: z.string().datetime({ message: 'endTime debe ser una fecha ISO válida' }).nullable().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().nullable().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const task = getTaskById(params.id)
  if (!task || task.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const raw = await req.json()
  const parsed = parseBody(PatchTaskSchema, raw)
  if (!parsed.ok) return parsed.response

  const body = raw as Record<string, unknown>
  const data = parsed.data
  const updates: Record<string, unknown> = {}
  if ('description' in body) updates.description = data.description
  if ('startTime' in body) updates.startTime = data.startTime
  if ('endTime' in body) updates.endTime = data.endTime
  if ('tags' in body) updates.tags = JSON.stringify(data.tags)
  if ('notes' in body) updates.notes = data.notes ?? null

  const entry = getEntryById(task.entryId)
  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const newStart = (updates.startTime as string | undefined) ?? task.startTime
  // 'endTime' in updates lets a client explicitly pass null to reactivate a
  // completed task — distinct from "not provided", which keeps the task's
  // current endTime (active stays active, completed stays completed).
  const newEndRaw = 'endTime' in updates ? (updates.endTime as string | null) : task.endTime
  const becomingActive = newEndRaw === null
  const timeFieldsChanged = 'startTime' in updates || 'endTime' in updates
  const tStart = new Date(newStart).getTime()

  if ('startTime' in updates) {
    const startDate = dateStringInTz(new Date(newStart), session.user.timezone)
    if (startDate !== entry.date) {
      return NextResponse.json(
        { error: 'La hora de inicio no corresponde al día de esta jornada' },
        { status: 400 }
      )
    }
  }

  let deletedDescriptions: string[] = []

  try {
    if (!becomingActive) {
      const newEnd = newEndRaw as string
      const tEnd = new Date(newEnd).getTime()
      if (tEnd <= tStart) {
        throw new WriteConflictError('La hora de fin debe ser posterior a la de inicio', 400)
      }

      const entryBreaks = getEntryBreaks(task.entryId)
      const breakIntervals: Interval[] = entryBreaks.map((b) => {
        const { startIso, endIso } = breakToInterval(b, entry.date)
        return { start: new Date(startIso).getTime(), end: new Date(endIso).getTime() }
      })
      const overlappingBreak = breakIntervals.find((b) => tStart < b.end && tEnd > b.start)

      sqlite.transaction(() => {
        if (overlappingBreak) {
          // Edit crosses break(s) → split into segments, update this task + create extras
          const segments = splitIntervalAroundBreaks(tStart, tEnd, breakIntervals)
          if (segments.length === 0) {
            throw new WriteConflictError('El intervalo cae completamente dentro de una pausa', 400)
          }
          const { deletedDescriptions: dd } = adjustAdjacentTasksForEdit(task.entryId, task.id, newStart, newEnd)
          deletedDescriptions = dd

          updates.startTime = new Date(segments[0].start).toISOString()
          updates.endTime = new Date(segments[0].end).toISOString()
          updateTask(params.id, updates)
          for (let i = 1; i < segments.length; i++) {
            createTask({
              id: uuidv4(),
              entryId: task.entryId,
              userId: task.userId,
              startTime: new Date(segments[i].start).toISOString(),
              endTime: new Date(segments[i].end).toISOString(),
              description: (updates.description as string | undefined) ?? task.description,
              tags: (updates.tags as string | undefined) ?? task.tags,
              notes: ('notes' in updates ? updates.notes : task.notes) as string | null,
            })
          }
        } else {
          const { deletedDescriptions: dd } = adjustAdjacentTasksForEdit(task.entryId, task.id, newStart, newEnd)
          deletedDescriptions = dd
          updateTask(params.id, updates)
        }

        // If the edit pushed the task across a local midnight, split it into
        // per-day segments — mirrors the stop endpoint so both writers keep
        // the day-split invariant.
        splitEntryTasksAcrossMidnights(task.entryId, session.user.id, session.user.timezone)
        mergeContiguousSpans(task.entryId)

        const finalIntervals = buildEntryIntervals(task.entryId, entry.date, { includeActive: true })
        if (hasInternalOverlap(finalIntervals)) {
          throw new WriteConflictError('El intervalo se solapa con una tarea o pausa existente')
        }
      })()
    } else if (timeFieldsChanged) {
      // Task will be active after this edit and its time range actually changed
      // (a new startTime, or an explicit endTime: null reactivating a completed
      // task) — validate and carve using its effective span [newStart, now).
      // An open-ended task only makes sense on today's entry — a past day can't
      // legitimately have a task "still running".
      if (entry.date !== dateStringInTz(new Date(), session.user.timezone)) {
        throw new WriteConflictError('No se puede dejar una tarea en curso en un día pasado', 400)
      }

      const otherActive = getActiveTask(session.user.id)
      if (otherActive && otherActive.id !== task.id) {
        throw new WriteConflictError('Ya hay otra tarea activa; detenla antes de reactivar esta', 409)
      }

      const now = Date.now()
      if (now <= tStart) {
        throw new WriteConflictError('La hora de inicio debe ser anterior al momento actual', 400)
      }

      const entryBreaks = getEntryBreaks(task.entryId)
      const breakIntervals: Interval[] = entryBreaks.map((b) => {
        const { startIso, endIso } = breakToInterval(b, entry.date)
        return { start: new Date(startIso).getTime(), end: new Date(endIso).getTime() }
      })
      const insideBreak = breakIntervals.some((iv) => tStart > iv.start && tStart < iv.end)
      if (insideBreak) {
        throw new WriteConflictError('La hora de inicio cae dentro de una pausa', 400)
      }

      sqlite.transaction(() => {
        const { deletedDescriptions: dd } = adjustAdjacentTasksForEdit(
          task.entryId,
          task.id,
          newStart,
          new Date(now).toISOString()
        )
        deletedDescriptions = dd

        updateTask(params.id, updates)

        const finalIntervals = buildEntryIntervals(task.entryId, entry.date, { includeActive: true })
        if (hasInternalOverlap(finalIntervals)) {
          throw new WriteConflictError('El intervalo se solapa con una tarea o pausa existente')
        }
      })()
    } else {
      // Active task, no time fields touched (e.g. renaming) — nothing to revalidate.
      updateTask(params.id, updates)
    }
  } catch (e) {
    if (e instanceof WriteConflictError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    throw e
  }

  const refreshed = getTaskById(params.id)
  return NextResponse.json({ task: parseTaskTags(refreshed!), deletedDescriptions })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(_req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const task = getTaskById(params.id)
  if (!task || task.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  deleteTask(params.id)
  mergeContiguousSpans(task.entryId)
  return NextResponse.json({ ok: true })
}
