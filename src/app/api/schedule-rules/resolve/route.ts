export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { resolveExpectedMinutes } from '@/lib/business/schedule'

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const date = new URL(req.url).searchParams.get('date')
  if (!date) return NextResponse.json({ error: 'date param required (YYYY-MM-DD)' }, { status: 400 })

  const minutes = resolveExpectedMinutes(session.user.id, date)
  return NextResponse.json({ date, expectedMinutes: minutes })
}
