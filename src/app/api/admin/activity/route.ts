export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/session'
import { computeActivitySummary } from '@/lib/business/admin-activity'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req)
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sp = new URL(req.url).searchParams
  const from = sp.get('from')
  const to = sp.get('to')
  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to) || from > to) {
    return NextResponse.json({ error: 'from and to params required (YYYY-MM-DD, from <= to)' }, { status: 400 })
  }

  return NextResponse.json(computeActivitySummary(from, to), {
    headers: { 'Cache-Control': 'no-store' },
  })
}
