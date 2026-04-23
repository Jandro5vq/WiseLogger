export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// First-run admin password setup — used when password_hash is NEEDS_RESET sentinel

import { NextRequest, NextResponse } from 'next/server'
import { getUserById, updateUser } from '@/lib/db/queries/users'
import { hashPassword, NEEDS_RESET_SENTINEL, validatePassword } from '@/lib/auth/password'
import { signToken } from '@/lib/auth/jwt'
import { setAuthCookie } from '@/lib/auth/cookies'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { userId, password } = body as { userId: string; password: string }

  if (!userId || !password) {
    return NextResponse.json({ error: 'userId and password are required' }, { status: 400 })
  }

  const pwError = validatePassword(password)
  if (pwError) {
    return NextResponse.json({ error: pwError }, { status: 400 })
  }

  const user = getUserById(userId)
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (user.passwordHash !== NEEDS_RESET_SENTINEL) {
    return NextResponse.json({ error: 'Password already set' }, { status: 400 })
  }

  // S7: Time-box setup — only allow within 24h of account creation
  const createdAt = new Date(user.createdAt).getTime()
  if (Date.now() - createdAt > 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: 'Setup link expired. Contact an admin.' }, { status: 403 })
  }

  const passwordHash = await hashPassword(password)
  const updated = updateUser(userId, {
    passwordHash,
    lastLoginAt: new Date().toISOString(),
  })

  if (!updated) {
    return NextResponse.json({ error: 'Failed to update password' }, { status: 500 })
  }

  const token = await signToken({ sub: updated.id, username: updated.username, role: updated.role })
  const response = NextResponse.json({
    id: updated.id,
    username: updated.username,
    role: updated.role,
  })
  setAuthCookie(response, token)
  return response
}
