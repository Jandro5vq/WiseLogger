export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/session'
import { getUserById, updateUser } from '@/lib/db/queries/users'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const user = getUserById(params.id)
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const now = new Date().toISOString()
  updateUser(params.id, { onboardingResetAt: now })

  return NextResponse.json({ onboardingResetAt: now })
}
