export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getTaskById, updateTask, deleteTask } from '@/lib/db/queries/tasks'
import { parseTaskTags } from '@/types/db'

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
