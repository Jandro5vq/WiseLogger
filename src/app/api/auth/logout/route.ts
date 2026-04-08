export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { clearAuthCookie } from '@/lib/auth/cookies'

export function POST() {
  const response = NextResponse.json({ ok: true })
  clearAuthCookie(response)
  return response
}
