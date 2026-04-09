export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getTaskById, updateTask, deleteTask } from '@/lib/db/queries/tasks'
import { getEntryById } from '@/lib/db/queries/entries'
import { parseTaskTags } from '@/types/db'
import { buildEntryIntervals, detectOverlap } from '@/lib/business/breaks'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const task = getTaskById(params.id)
  if (!task || task.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json()
  const updates: Record<string, unknown> = {}
  if ('description' in body) updates.description = body.description
  if ('startTime' in body) updates.startTime = body.startTime
  if ('endTime' in body) updates.endTime = body.endTime
  if ('tags' in body) updates.tags = JSON.stringify(body.tags)

  // Validate overlap if time fields changed
  const newStart = (updates.startTime as string | undefined) ?? task.startTime
  const newEnd = (updates.endTime as string | undefined) ?? task.endTime

  if (newEnd) {
    const tStart = new Date(newStart).getTime()
    const tEnd = new Date(newEnd).getTime()
    if (tEnd <= tStart) {
      return NextResponse.json({ error: 'La hora de fin debe ser posterior a la de inicio' }, { status: 400 })
    }
    const entry = getEntryById(task.entryId)
    if (entry) {
      const existing = buildEntryIntervals(task.entryId, entry.date, { excludeTaskId: task.id })
      if (detectOverlap(existing, { start: tStart, end: tEnd })) {
        return NextResponse.json(
          { error: 'El intervalo se solapa con una tarea o pausa existente' },
          { status: 400 }
        )
      }
    }
  }

  const updated = updateTask(params.id, updates)
  return NextResponse.json(parseTaskTags(updated!))
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(_req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const task = getTaskById(params.id)
  if (!task || task.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  deleteTask(params.id)
  return NextResponse.json({ ok: true })
}
