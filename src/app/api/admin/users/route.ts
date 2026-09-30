export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/session'
import { listUsers } from '@/lib/db/queries/users'
import { purgeDateFor } from '@/lib/business/user-lifecycle'

export async function GET() {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const all = listUsers()
  return NextResponse.json(
    all.map((u) => ({
      ...u,
      passwordHash: undefined,
      mcpApiKeyHash: undefined,
      // When a user in the trash gets permanently removed
      purgeAt: u.deletedAt ? purgeDateFor(u.deletedAt).toISOString() : null,
    }))
  )
}
