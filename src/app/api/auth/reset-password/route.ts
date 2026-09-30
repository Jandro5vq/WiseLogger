export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resetPasswordWithToken } from '@/lib/business/password-reset'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const token = typeof body.token === 'string' ? body.token : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!token || !password) {
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
  }

  const result = await resetPasswordWithToken(token, password)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
