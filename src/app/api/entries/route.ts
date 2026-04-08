export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getSession } from '@/lib/auth/session'
import { listEntries, createEntry, getEntryByDate } from '@/lib/db/queries/entries'
import { resolveExpectedMinutes } from '@/lib/business/schedule'

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') ?? undefined
  const to = searchParams.get('to') ?? undefined

  const result = listEntries(session.user.id, from, to)
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { date, notes } = body as { date: string; notes?: string }

  if (!date) return NextResponse.json({ error: 'date is required' }, { status: 400 })

  const existing = getEntryByDate(session.user.id, date)
  if (existing) return NextResponse.json({ error: 'Entry already exists for this date' }, { status: 409 })

  const expectedMinutes = resolveExpectedMinutes(session.user.id, date)
  const entry = createEntry({
    id: uuidv4(),
    userId: session.user.id,
    date,
    startTime: new Date().toISOString(),
    expectedMinutes,
    notes,
  })

  return NextResponse.json(entry, { status: 201 })
}
