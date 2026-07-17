export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getSession } from '@/lib/auth/session'
import { getEntryById } from '@/lib/db/queries/entries'
import { getEntryBreaks, createEntryBreak } from '@/lib/db/queries/entry-breaks'
import { breakToInterval, buildEntryIntervals, detectOverlap, toBreakStartIso, CreateBreakSchema } from '@/lib/business/breaks'
import { splitTasksAroundBreak, mergeContiguousSpans } from '@/lib/business/spans'
import { WriteConflictError, hasInternalOverlap } from '@/lib/business/overlaps'
import { sqlite } from '@/lib/db'
import { parseBody } from '@/lib/api'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(_req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const entry = getEntryById(params.id)
  if (!entry || entry.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(getEntryBreaks(params.id))
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const entry = getEntryById(params.id)
  if (!entry || entry.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const parsed = parseBody(CreateBreakSchema, await req.json())
  if (!parsed.ok) return parsed.response
  const { breakStart: rawBreakStart, durationMinutes, label } = parsed.data

  // Persist an absolute ISO instant so read-time interpretation never depends on
  // the server's timezone (legacy 'HH:MM' input resolves in the user's timezone).
  const breakStart = toBreakStartIso(rawBreakStart, entry.date, session.user.timezone)

  const { startIso, endIso } = breakToInterval({ breakStart, durationMinutes }, entry.date)

  const candidate = { start: new Date(startIso).getTime(), end: new Date(endIso).getTime() }
  const breakOnlyIntervals = getEntryBreaks(params.id).map((b) => {
    const { startIso: s, endIso: e } = breakToInterval(b, entry.date)
    return { start: new Date(s).getTime(), end: new Date(e).getTime() }
  })
  if (detectOverlap(breakOnlyIntervals, candidate)) {
    return NextResponse.json({ error: 'La pausa se solapa con otra existente' }, { status: 409 })
  }

  let deletedDescriptions: string[] = []
  let created: ReturnType<typeof createEntryBreak>

  try {
    created = sqlite.transaction(() => {
      const b = createEntryBreak({
        id: uuidv4(),
        entryId: params.id,
        userId: session.user.id,
        breakStart,
        durationMinutes,
        label: label ?? null,
        fromRuleId: null,
      })

      // Split/trim any tasks that overlap with the new break
      const affected = splitTasksAroundBreak(params.id, session.user.id, startIso, endIso)
      mergeContiguousSpans(params.id)
      deletedDescriptions = affected.deletedDescriptions

      const finalIntervals = buildEntryIntervals(params.id, entry.date, { includeActive: true })
      if (hasInternalOverlap(finalIntervals)) {
        throw new WriteConflictError('La pausa se solapa con una tarea o pausa existente')
      }

      return b
    })()
  } catch (e) {
    if (e instanceof WriteConflictError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    throw e
  }

  return NextResponse.json({ break: created, deletedDescriptions }, { status: 201 })
}
