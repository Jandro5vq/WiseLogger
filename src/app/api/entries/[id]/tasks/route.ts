export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getSession } from '@/lib/auth/session'
import { getEntryById } from '@/lib/db/queries/entries'
import { getActiveTask, createTask, updateTask, listTasksForEntry } from '@/lib/db/queries/tasks'
import { parseTaskTags } from '@/types/db'

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
  const { description, startTime, endTime, tags } = body as {
    description: string
    startTime?: string
    endTime?: string
    tags?: string[]
  }

  if (!description) return NextResponse.json({ error: 'description is required' }, { status: 400 })

  // If starting a new active task, auto-stop any existing active task
  if (!endTime) {
    const active = getActiveTask(session.user.id)
    if (active) {
      updateTask(active.id, { endTime: new Date().toISOString() })
    }
  }

  const task = createTask({
    id: uuidv4(),
    entryId: params.id,
    userId: session.user.id,
    startTime: startTime ?? new Date().toISOString(),
    endTime,
    description,
    tags: JSON.stringify(tags ?? []),
  })

  return NextResponse.json(parseTaskTags(task), { status: 201 })
}
