export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { updateUser } from '@/lib/db/queries/users'
import { checkUsername } from '@/lib/business/user-identity'

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
    const username = checkUsername(body.username, session.user.id)
    if (!username.ok) return NextResponse.json({ error: username.error }, { status: username.status })
    updates.username = username.value
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
  if (!updated) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  // Never echo secrets back to the client
  return NextResponse.json({ ...updated, passwordHash: undefined, mcpApiKeyHash: undefined })
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
