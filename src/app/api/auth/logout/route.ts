export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { clearAuthCookie } from '@/lib/auth/cookies'
import { getSession } from '@/lib/auth/session'
import { updateUser } from '@/lib/db/queries/users'

export async function POST(req: NextRequest) {
  // Revoke all existing tokens before clearing cookie
  const session = await getSession(req)
  if (session) {
    updateUser(session.user.id, { validSince: new Date().toISOString() })
  }

  const response = NextResponse.json({ ok: true })
  clearAuthCookie(response)
  return response
}
