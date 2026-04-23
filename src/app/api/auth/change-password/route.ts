export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getUserById, updateUser } from '@/lib/db/queries/users'
import { verifyPassword, hashPassword, validatePassword } from '@/lib/auth/password'

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { oldPassword, newPassword } = await req.json()
  if (!oldPassword || !newPassword) {
    return NextResponse.json({ error: 'Both passwords are required' }, { status: 400 })
  }

  const pwError = validatePassword(newPassword)
  if (pwError) {
    return NextResponse.json({ error: pwError }, { status: 400 })
  }

  const user = getUserById(session.user.id)
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const valid = await verifyPassword(oldPassword, user.passwordHash)
  if (!valid) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 })

  const passwordHash = await hashPassword(newPassword)
  updateUser(session.user.id, { passwordHash, validSince: new Date().toISOString() })

  return NextResponse.json({ ok: true })
}
