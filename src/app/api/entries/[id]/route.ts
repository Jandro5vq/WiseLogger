export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { z } from 'zod'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getEntryById, updateEntry, deleteEntry } from '@/lib/db/queries/entries'
import { listTasksForEntry, updateTask } from '@/lib/db/queries/tasks'
import { resolveExpectedMinutes } from '@/lib/business/schedule'
import { parseBody } from '@/lib/api'

const PatchEntrySchema = z.object({
  startTime: z.string().datetime({ message: 'startTime debe ser una fecha ISO válida' }).optional(),
  endTime: z.string().datetime({ message: 'endTime debe ser una fecha ISO válida' }).optional(),
  expectedMinutes: z.number().int().min(0).optional(),
  notes: z.string().nullable().optional(),
  dayOff: z.boolean().optional(),
  adjustFirstTask: z.boolean().optional(),
  adjustLastTask: z.boolean().optional(),
})

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

  const raw = await req.json()
  const parsed = parseBody(PatchEntrySchema, raw)
  if (!parsed.ok) return parsed.response
  const data = parsed.data

  const updates: Record<string, unknown> = {}
  if ('startTime' in raw) updates.startTime = data.startTime
  if ('endTime' in raw) updates.endTime = data.endTime
  if ('expectedMinutes' in raw) updates.expectedMinutes = data.expectedMinutes
  if ('notes' in raw) updates.notes = data.notes ?? null

  if (data.dayOff === true) {
    updates.expectedMinutes = 0
    updates.endTime = entry.startTime ?? entry.date + 'T00:00:00.000Z'
  } else if (data.dayOff === false) {
    updates.expectedMinutes = resolveExpectedMinutes(entry.userId, entry.date)
    delete updates.endTime
  }

  const updated = updateEntry(params.id, updates)

  const entryTasks = listTasksForEntry(params.id)
  if (data.adjustFirstTask && data.startTime && entryTasks.length > 0) {
    const first = entryTasks[0]
    const newStartMs = new Date(data.startTime).getTime()
    const firstEndMs = first.endTime ? new Date(first.endTime).getTime() : Infinity
    if (newStartMs < firstEndMs) {
      updateTask(first.id, { startTime: data.startTime })
    }
  }
  if (data.adjustLastTask && data.endTime && entryTasks.length > 0) {
    const last = entryTasks[entryTasks.length - 1]
    const newEndMs = new Date(data.endTime).getTime()
    const lastStartMs = new Date(last.startTime).getTime()
    if (newEndMs > lastStartMs) {
      updateTask(last.id, { endTime: data.endTime })
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
