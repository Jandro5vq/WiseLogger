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

  const body = await req.json()
  const updates: Record<string, unknown> = {}

  if ('username' in body) {
    const trimmed = (body.username ?? '').trim()
    if (!trimmed) return NextResponse.json({ error: 'Username is required' }, { status: 400 })
    const existing = getUserByUsername(trimmed)
    if (existing && existing.id !== session.user.id) {
      return NextResponse.json({ error: 'Username already taken' }, { status: 409 })
    }
    updates.username = trimmed
  }

  if ('timezone' in body) {
    const tz = String(body.timezone ?? '').trim()
    if (!isValidTimezone(tz)) {
      return NextResponse.json({ error: 'Zona horaria inválida' }, { status: 400 })
    }
    updates.timezone = tz
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No hay cambios que aplicar' }, { status: 400 })
  }

  const updated = updateUser(session.user.id, updates)
  return NextResponse.json(updated)
}

function isValidTimezone(tz: string): boolean {
  if (!tz) return false
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  } catch {
    return false
  }
}
