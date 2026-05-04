export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { z } from 'zod'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getTaskById, updateTask, deleteTask } from '@/lib/db/queries/tasks'
import { getEntryById } from '@/lib/db/queries/entries'
import { parseTaskTags } from '@/types/db'
import { breakToInterval, type Interval } from '@/lib/business/breaks'
import { getEntryBreaks } from '@/lib/db/queries/entry-breaks'
import { adjustAdjacentTasksForEdit, splitIntervalAroundBreaks, mergeContiguousSpans } from '@/lib/business/spans'
import { v4 as uuidv4 } from 'uuid'
import { createTask } from '@/lib/db/queries/tasks'
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

  // Validate and resolve overlaps when time fields changed
  const newStart = (updates.startTime as string | undefined) ?? task.startTime
  const newEnd = (updates.endTime as string | undefined) ?? task.endTime

  let deletedDescriptions: string[] = []

  if (newEnd) {
    const tStart = new Date(newStart).getTime()
    const tEnd = new Date(newEnd).getTime()
    if (tEnd <= tStart) {
      return NextResponse.json({ error: 'La hora de fin debe ser posterior a la de inicio' }, { status: 400 })
    }
    const entry = getEntryById(task.entryId)
    if (entry) {
      const entryBreaks = getEntryBreaks(task.entryId)
      const breakIntervals: Interval[] = entryBreaks.map((b) => {
        const { startIso, endIso } = breakToInterval(b, entry.date)
        return { start: new Date(startIso).getTime(), end: new Date(endIso).getTime() }
      })

      const overlappingBreak = breakIntervals.find((b) => tStart < b.end && tEnd > b.start)
      if (overlappingBreak) {
        // Edit crosses break(s) → split into segments, update this task + create extras
        const segments = splitIntervalAroundBreaks(tStart, tEnd, breakIntervals)
        if (segments.length === 0) {
          return NextResponse.json({ error: 'El intervalo cae completamente dentro de una pausa' }, { status: 400 })
        }
        const { deletedDescriptions: dd } = adjustAdjacentTasksForEdit(task.entryId, task.id, newStart, newEnd)
        deletedDescriptions = dd
        sqlite.transaction(() => {
          // Update current task to first segment
          updates.startTime = new Date(segments[0].start).toISOString()
          updates.endTime = new Date(segments[0].end).toISOString()
          updateTask(params.id, updates)
          // Create additional segments
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
        })()
        mergeContiguousSpans(task.entryId)
        const refreshed = parseTaskTags((await import('@/lib/db/queries/tasks')).getTaskById(params.id)!)
        return NextResponse.json({ task: refreshed, deletedDescriptions })
      }

      // No break overlap — auto-trim adjacent tasks
      const { deletedDescriptions: dd } = adjustAdjacentTasksForEdit(task.entryId, task.id, newStart, newEnd)
      deletedDescriptions = dd
    }
  }

  const updated = updateTask(params.id, updates)
  mergeContiguousSpans(task.entryId)
  return NextResponse.json({ task: parseTaskTags(updated!), deletedDescriptions })
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
