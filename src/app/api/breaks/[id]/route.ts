export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getEntryBreakById, updateEntryBreak, deleteEntryBreak } from '@/lib/db/queries/entry-breaks'
import { getEntryById } from '@/lib/db/queries/entries'
import { buildEntryIntervals, detectOverlap, breakToInterval, UpdateBreakSchema } from '@/lib/business/breaks'
import { extendPreviousTaskOnBreakDelete, splitTasksAroundBreak, mergeContiguousSpans } from '@/lib/business/spans'
import { parseBody } from '@/lib/api'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const b = getEntryBreakById(params.id)
  if (!b || b.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const parsed = parseBody(UpdateBreakSchema, await req.json())
  if (!parsed.ok) return parsed.response
  const newBreakStart = parsed.data.breakStart ?? b.breakStart
  const newDuration = parsed.data.durationMinutes ?? b.durationMinutes

  // Whitelist the columns a client may change — never write the raw body, which
  // could otherwise reassign userId/entryId/fromRuleId.
  const updates: Record<string, unknown> = {}
  if (parsed.data.breakStart !== undefined) updates.breakStart = parsed.data.breakStart
  if (parsed.data.durationMinutes !== undefined) updates.durationMinutes = parsed.data.durationMinutes
  if (parsed.data.label !== undefined) updates.label = parsed.data.label

  // Validate overlap against other intervals (excluding this break)
  const entry = getEntryById(b.entryId)
  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { startIso: newStartIso, endIso: newEndIso } = breakToInterval(
    { breakStart: newBreakStart, durationMinutes: newDuration },
    entry.date
  )
  const existing = buildEntryIntervals(b.entryId, entry.date, { excludeBreakId: b.id })
  if (detectOverlap(existing, { start: new Date(newStartIso).getTime(), end: new Date(newEndIso).getTime() })) {
    return NextResponse.json(
      { error: 'La pausa se solapa con una tarea o pausa existente' },
      { status: 400 }
    )
  }

  // Capture old break interval before updating
  const { startIso: oldStart, endIso: oldEnd } = breakToInterval(b, entry.date)

  const updated = updateEntryBreak(params.id, updates)

  // Recompute: undo old break's effect on tasks, then apply new break's position
  extendPreviousTaskOnBreakDelete(b.entryId, oldStart, oldEnd)
  const affected = splitTasksAroundBreak(b.entryId, b.userId, newStartIso, newEndIso)
  mergeContiguousSpans(b.entryId)

  return NextResponse.json({ break: updated, deletedDescriptions: affected.deletedDescriptions })
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

  // Extend the task immediately before the break to cover the gap, then merge if same description
  extendPreviousTaskOnBreakDelete(b.entryId, startIso, endIso)
  mergeContiguousSpans(b.entryId)

  return NextResponse.json({ ok: true })
}
