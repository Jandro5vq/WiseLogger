export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { z } from 'zod'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getEntryById } from '@/lib/db/queries/entries'
import { listTasksForEntry } from '@/lib/db/queries/tasks'
import { parseTaskTags } from '@/types/db'
import { createTaskCarving } from '@/lib/business/create-task'
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

  const result = createTaskCarving({
    entry,
    userId: session.user.id,
    timezone: session.user.timezone,
    description,
    tags,
    notes,
    startIso: startTime ?? new Date().toISOString(),
    endIso: endTime,
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  const { task: created, deletedDescriptions } = result
  return NextResponse.json({ task: parseTaskTags(created), deletedDescriptions }, { status: 201 })
}
