export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getSession } from '@/lib/auth/session'
import { getEntryById } from '@/lib/db/queries/entries'
import { getEntryBreaks, createEntryBreak } from '@/lib/db/queries/entry-breaks'
import { breakToInterval, detectOverlap } from '@/lib/business/breaks'
import { splitTasksAroundBreak } from '@/lib/business/spans'

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

  const body = await req.json()
  const { breakStart, durationMinutes, label } = body

  if (!breakStart || durationMinutes == null) {
    return NextResponse.json({ error: 'breakStart y durationMinutes son obligatorios' }, { status: 400 })
  }

  const { startIso, endIso } = breakToInterval({ breakStart, durationMinutes }, entry.date)

  const candidate = { start: new Date(startIso).getTime(), end: new Date(endIso).getTime() }
  const breakOnlyIntervals = getEntryBreaks(params.id).map((b) => {
    const { startIso: s, endIso: e } = breakToInterval(b, entry.date)
    return { start: new Date(s).getTime(), end: new Date(e).getTime() }
  })
  if (detectOverlap(breakOnlyIntervals, candidate)) {
    return NextResponse.json({ error: 'La pausa se solapa con otra existente' }, { status: 409 })
  }

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

  return NextResponse.json({ break: b, affected }, { status: 201 })
}
