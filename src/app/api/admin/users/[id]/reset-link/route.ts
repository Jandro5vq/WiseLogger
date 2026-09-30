export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/session'
import { getUserById } from '@/lib/db/queries/users'
import { issueResetLink } from '@/lib/business/password-reset'

/** Issues a single-use password reset link for the user; the admin passes it on. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  let session
  try {
    session = await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const user = getUserById(params.id)
  if (!user || user.deletedAt) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  return NextResponse.json(issueResetLink(user.id, session.user.id))
}
