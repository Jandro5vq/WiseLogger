export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getTaskById } from '@/lib/db/queries/tasks'
import { stopTask } from '@/lib/business/stop'
import { parseTaskTags } from '@/types/db'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const task = getTaskById(params.id)
  if (!task || task.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (task.endTime) {
    return NextResponse.json({ error: 'Task already stopped' }, { status: 409 })
  }

  // Allow caller to pass a specific endTime (e.g. the start time of the next task)
  let endTime: string | undefined
  try {
    const body = await req.json()
    if (body?.endTime) endTime = body.endTime
  } catch {
    // no body or not JSON — use now
  }

  const result = stopTask(params.id, session.user.id, session.user.timezone, endTime)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json(parseTaskTags(result.task))
}
