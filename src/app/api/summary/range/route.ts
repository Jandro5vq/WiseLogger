export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { computeBalance } from '@/lib/business/balance'

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const from = sp.get('from')
  const to = sp.get('to')

  if (!from || !to) {
    return NextResponse.json({ error: 'from and to params required (YYYY-MM-DD)' }, { status: 400 })
  }

  const result = computeBalance(session.user.id, to)
  const rangeDays = result.days.filter((d) => d.date >= from && d.date <= to)

  return NextResponse.json({
    from,
    to,
    days: rangeDays,
    totalWorkedMinutes: rangeDays.reduce((s, d) => s + d.workedMinutes, 0),
    totalExpectedMinutes: rangeDays.reduce((s, d) => s + d.expectedMinutes, 0),
    rangeBalance: rangeDays.reduce((s, d) => s + d.dayBalance, 0),
    cumulativeBalance: result.cumulativeBalance,
  })
}
