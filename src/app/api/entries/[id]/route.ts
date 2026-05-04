export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getEntryById, updateEntry, deleteEntry } from '@/lib/db/queries/entries'
import { listTasksForEntry, updateTask } from '@/lib/db/queries/tasks'
import { resolveExpectedMinutes } from '@/lib/business/schedule'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(_req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const entry = getEntryById(params.id)
  if (!entry || entry.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(entry)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const entry = getEntryById(params.id)
  if (!entry || entry.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json()
  const allowed = ['startTime', 'endTime', 'expectedMinutes', 'notes']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if ('dayOff' in body) {
    if (body.dayOff === true) {
      updates.expectedMinutes = 0
      updates.endTime = entry.startTime ?? entry.date + 'T00:00:00.000Z'
    } else {
      updates.expectedMinutes = resolveExpectedMinutes(entry.userId, entry.date)
    }
  }

  const updated = updateEntry(params.id, updates)

  // Optionally adjust the first/last task to match the new workday boundaries
  const entryTasks = listTasksForEntry(params.id)
  if (body.adjustFirstTask && body.startTime && entryTasks.length > 0) {
    const first = entryTasks[0]
    const newStartMs = new Date(body.startTime).getTime()
    const firstEndMs = first.endTime ? new Date(first.endTime).getTime() : Infinity
    if (newStartMs < firstEndMs) {
      updateTask(first.id, { startTime: body.startTime })
    }
  }
  if (body.adjustLastTask && body.endTime && entryTasks.length > 0) {
    const last = entryTasks[entryTasks.length - 1]
    const newEndMs = new Date(body.endTime).getTime()
    const lastStartMs = new Date(last.startTime).getTime()
    if (newEndMs > lastStartMs) {
      updateTask(last.id, { endTime: body.endTime })
    }
  }

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(_req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const entry = getEntryById(params.id)
  if (!entry || entry.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  deleteEntry(params.id)
  return NextResponse.json({ ok: true })
}
