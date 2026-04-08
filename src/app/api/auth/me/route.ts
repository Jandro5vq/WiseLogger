export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { updateUser, getUserByUsername } from '@/lib/db/queries/users'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(session.user)
}

export async function PATCH(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { username } = await req.json()
  if (!username?.trim()) return NextResponse.json({ error: 'Username is required' }, { status: 400 })

  const trimmed = username.trim()

  // Check uniqueness (exclude self)
  const existing = getUserByUsername(trimmed)
  if (existing && existing.id !== session.user.id) {
    return NextResponse.json({ error: 'Username already taken' }, { status: 409 })
  }

  const updated = updateUser(session.user.id, { username: trimmed })
  return NextResponse.json(updated)
}
