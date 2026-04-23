export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { computeBalance } from '@/lib/business/balance'

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date()
  const sp = new URL(req.url).searchParams
  const year = parseInt(sp.get('year') ?? String(now.getFullYear()), 10)
  const month = parseInt(sp.get('month') ?? String(now.getMonth() + 1), 10)

  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const result = computeBalance(session.user.id, to)
  const monthDays = result.days.filter((d) => d.date >= from && d.date <= to)

  return NextResponse.json({
    year,
    month,
    from,
    to,
    days: monthDays,
    totalWorkedMinutes: monthDays.reduce((s, d) => s + d.workedMinutes, 0),
    totalExpectedMinutes: monthDays.reduce((s, d) => s + d.expectedMinutes, 0),
    monthBalance: monthDays.reduce((s, d) => s + d.dayBalance, 0),
    cumulativeBalance: result.cumulativeBalance,
  }, {
    headers: { 'Cache-Control': 'private, max-age=60' },
  })
}
