export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserByUsername } from '@/lib/db/queries/users'
import { verifyPassword, NEEDS_RESET_SENTINEL, DUMMY_HASH } from '@/lib/auth/password'
import { signToken } from '@/lib/auth/jwt'
import { setAuthCookie } from '@/lib/auth/cookies'
import { db } from '@/lib/db'
import { users } from '@db/schema'
import { eq } from 'drizzle-orm'
import { resetDemoData } from '@/lib/demo/reset'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { username, password } = body as { username: string; password: string }

  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password are required' }, { status: 400 })
  }

  const user = getUserByUsername(username)
  if (!user) {
    // Timing-safe: always run bcrypt to prevent username enumeration
    await verifyPassword(password, DUMMY_HASH)
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  if (!user.isActive) {
    return NextResponse.json({ error: 'Account suspended' }, { status: 403 })
  }

  // First login — admin needs to set password
  if (user.passwordHash === NEEDS_RESET_SENTINEL) {
    return NextResponse.json({ error: 'PASSWORD_NEEDS_RESET', userId: user.id }, { status: 403 })
  }

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  // Demo user: wipe and re-seed data on every login
  if (user.username.toLowerCase() === 'demo') {
    resetDemoData(user.id)
  }

  // Update last login
  db.update(users).set({ lastLoginAt: new Date().toISOString() }).where(eq(users.id, user.id)).run()

  const token = await signToken({ sub: user.id, username: user.username, role: user.role })
  const response = NextResponse.json({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
  })
  setAuthCookie(response, token)
  return response
}
