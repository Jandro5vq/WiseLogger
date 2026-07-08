export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { computeBalance } from '@/lib/business/balance'
import { getWeekBounds, dateStringInTz } from '@/lib/tz'

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Default to today in the user's timezone — the UTC date can be a day off.
  const date = new URL(req.url).searchParams.get('date') ?? dateStringInTz(new Date(), session.user.timezone)
  const { from, to } = getWeekBounds(date)
  const result = computeBalance(session.user.id, to)
  const weekDays = result.days.filter((d) => d.date >= from && d.date <= to)

  return NextResponse.json({
    from,
    to,
    days: weekDays,
    totalWorkedMinutes: weekDays.reduce((s, d) => s + d.workedMinutes, 0),
    totalExpectedMinutes: weekDays.reduce((s, d) => s + d.expectedMinutes, 0),
    weekBalance: weekDays.reduce((s, d) => s + d.dayBalance, 0),
    cumulativeBalance: result.cumulativeBalance,
  }, {
    headers: { 'Cache-Control': 'private, max-age=60' },
  })
}
