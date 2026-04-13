export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getEntryBreakById, updateEntryBreak, deleteEntryBreak } from '@/lib/db/queries/entry-breaks'
import { getEntryById } from '@/lib/db/queries/entries'
import { buildEntryIntervals, detectOverlap, breakToInterval } from '@/lib/business/breaks'
import { extendPreviousTaskOnBreakDelete } from '@/lib/business/spans'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const b = getEntryBreakById(params.id)
  if (!b || b.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json()
  const newBreakStart = body.breakStart ?? b.breakStart
  const newDuration = body.durationMinutes ?? b.durationMinutes

  // Validate overlap against other intervals (excluding this break)
  const entry = getEntryById(b.entryId)
  if (entry) {
    const { startIso, endIso } = breakToInterval({ breakStart: newBreakStart, durationMinutes: newDuration }, entry.date)
    const existing = buildEntryIntervals(b.entryId, entry.date, { excludeBreakId: b.id })
    if (detectOverlap(existing, { start: new Date(startIso).getTime(), end: new Date(endIso).getTime() })) {
      return NextResponse.json(
        { error: 'La pausa se solapa con una tarea o pausa existente' },
        { status: 400 }
      )
    }
  }

  const updated = updateEntryBreak(params.id, body)
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(_req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const b = getEntryBreakById(params.id)
  if (!b || b.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const entry = getEntryById(b.entryId)
  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { startIso, endIso } = breakToInterval(b, entry.date)

  deleteEntryBreak(params.id)

  // Extend the task immediately before the break to cover the gap, then auto-merge if same description
  extendPreviousTaskOnBreakDelete(b.entryId, startIso, endIso)

  return NextResponse.json({ ok: true })
}
