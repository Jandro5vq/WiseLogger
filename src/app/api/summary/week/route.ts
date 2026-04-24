export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { computeBalance } from '@/lib/business/balance'

function localDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getWeekBounds(dateStr: string): { from: string; to: string } {
  const d = new Date(dateStr + 'T00:00:00')
  const monday = new Date(d)
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { from: localDate(monday), to: localDate(sunday) }
}

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const date = new URL(req.url).searchParams.get('date') ?? new Date().toISOString().split('T')[0]
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
