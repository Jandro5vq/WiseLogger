export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { computeBalance } from '@/lib/business/balance'

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = new URL(req.url).searchParams
  const upToDate = params.get('upTo') ?? undefined
  const fromDate = params.get('from') ?? undefined
  const result = computeBalance(session.user.id, upToDate, fromDate)
  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'private, max-age=60' },
  })
}
