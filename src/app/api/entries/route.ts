export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { listEntries, updateEntry } from '@/lib/db/queries/entries'
import { createEntryForDate, todayDateString } from '@/lib/business/tasks'

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
  if (date > todayDateString(session.user.timezone)) {
    return NextResponse.json({ error: 'No se puede generar una jornada en el futuro' }, { status: 400 })
  }

  // createEntryForDate is idempotent (returns the existing entry), so retry-safe —
  // but this endpoint is specifically for the "generate a missing day" action, so
  // an existing entry means the caller's view of the day is stale.
  const before = listEntries(session.user.id, date, date)
  if (before.length > 0) {
    return NextResponse.json({ error: 'Entry already exists for this date' }, { status: 409 })
  }

  let entry = createEntryForDate(session.user.id, date)
  if (notes) entry = updateEntry(entry.id, { notes })

  return NextResponse.json(entry, { status: 201 })
}
