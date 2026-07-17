export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getEntryBreakById, updateEntryBreak, deleteEntryBreak, getEntryBreaks } from '@/lib/db/queries/entry-breaks'
import { getEntryById } from '@/lib/db/queries/entries'
import { buildEntryIntervals, detectOverlap, breakToInterval, toBreakStartIso, UpdateBreakSchema } from '@/lib/business/breaks'
import { extendPreviousTaskOnBreakDelete, splitTasksAroundBreak, mergeContiguousSpans } from '@/lib/business/spans'
import { WriteConflictError, hasInternalOverlap } from '@/lib/business/overlaps'
import { sqlite } from '@/lib/db'
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

  const entry = getEntryById(b.entryId)
  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Persist an absolute ISO instant so read-time interpretation never depends on
  // the server's timezone (legacy 'HH:MM' input resolves in the user's timezone).
  const newBreakStart = parsed.data.breakStart !== undefined
    ? toBreakStartIso(parsed.data.breakStart, entry.date, session.user.timezone)
    : b.breakStart
  const newDuration = parsed.data.durationMinutes ?? b.durationMinutes

  // Whitelist the columns a client may change — never write the raw body, which
  // could otherwise reassign userId/entryId/fromRuleId.
  const updates: Record<string, unknown> = {}
  if (parsed.data.breakStart !== undefined) updates.breakStart = newBreakStart
  if (parsed.data.durationMinutes !== undefined) updates.durationMinutes = parsed.data.durationMinutes
  if (parsed.data.label !== undefined) updates.label = parsed.data.label

  const { startIso: newStartIso, endIso: newEndIso } = breakToInterval(
    { breakStart: newBreakStart, durationMinutes: newDuration },
    entry.date
  )

  // Only reject on overlap with ANOTHER break — moving a break onto tasks is
  // allowed, same as creating one: splitTasksAroundBreak carves them below.
  const breakOnlyIntervals = getEntryBreaks(b.entryId)
    .filter((other) => other.id !== b.id)
    .map((other) => {
      const { startIso: s, endIso: e } = breakToInterval(other, entry.date)
      return { start: new Date(s).getTime(), end: new Date(e).getTime() }
    })
  if (detectOverlap(breakOnlyIntervals, { start: new Date(newStartIso).getTime(), end: new Date(newEndIso).getTime() })) {
    return NextResponse.json({ error: 'La pausa se solapa con otra existente' }, { status: 409 })
  }

  // Capture old break interval before updating
  const { startIso: oldStart, endIso: oldEnd } = breakToInterval(b, entry.date)

  let deletedDescriptions: string[] = []

  try {
    sqlite.transaction(() => {
      updateEntryBreak(params.id, updates)

      // Recompute: undo old break's effect on tasks, then apply new break's position
      extendPreviousTaskOnBreakDelete(b.entryId, oldStart, oldEnd)
      const affected = splitTasksAroundBreak(b.entryId, b.userId, newStartIso, newEndIso)
      mergeContiguousSpans(b.entryId)
      deletedDescriptions = affected.deletedDescriptions

      const finalIntervals = buildEntryIntervals(b.entryId, entry.date, { includeActive: true })
      if (hasInternalOverlap(finalIntervals)) {
        throw new WriteConflictError('La pausa se solapa con una tarea o pausa existente')
      }
    })()
  } catch (e) {
    if (e instanceof WriteConflictError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    throw e
  }

  const updated = getEntryBreakById(params.id)
  return NextResponse.json({ break: updated, deletedDescriptions })
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

  try {
    sqlite.transaction(() => {
      deleteEntryBreak(params.id)

      // Extend the task immediately before the break to cover the gap, then merge if same description
      extendPreviousTaskOnBreakDelete(b.entryId, startIso, endIso)
      mergeContiguousSpans(b.entryId)

      const finalIntervals = buildEntryIntervals(b.entryId, entry.date, { includeActive: true })
      if (hasInternalOverlap(finalIntervals)) {
        throw new WriteConflictError('No se pudo eliminar la pausa sin dejar un solape')
      }
    })()
  } catch (e) {
    if (e instanceof WriteConflictError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    throw e
  }

  return NextResponse.json({ ok: true })
}
