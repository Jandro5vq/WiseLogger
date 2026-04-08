export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/session'
import { revokeInvitation } from '@/lib/db/queries/invitations'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const revoked = revokeInvitation(params.id)
  if (!revoked) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
