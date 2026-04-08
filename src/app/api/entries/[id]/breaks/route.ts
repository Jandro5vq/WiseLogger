export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getSession } from '@/lib/auth/session'
import { getEntryById } from '@/lib/db/queries/entries'
import { getEntryBreaks, createEntryBreak } from '@/lib/db/queries/entry-breaks'

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
    return NextResponse.json({ error: 'breakStart and durationMinutes are required' }, { status: 400 })
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

  return NextResponse.json(b, { status: 201 })
}
