export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getEntryByDate, updateEntry } from '@/lib/db/queries/entries'
import { todayDateString } from '@/lib/business/tasks'

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = todayDateString()
  const entry = getEntryByDate(session.user.id, today)
  if (!entry) return NextResponse.json({ error: 'No entry for today' }, { status: 404 })

  if (entry.endTime) {
    return NextResponse.json({ error: 'Entry already closed' }, { status: 409 })
  }

  const updated = updateEntry(entry.id, { endTime: new Date().toISOString() })
  return NextResponse.json(updated)
}
