export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'
import { requireAdmin } from '@/lib/auth/session'
import { listInvitations, createInvitation } from '@/lib/db/queries/invitations'
import { env } from '@/lib/env'

export async function GET() {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return NextResponse.json(listInvitations())
}

export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const email = body.email as string | undefined

  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(
    Date.now() + env.INVITATION_EXPIRY_HOURS * 60 * 60 * 1000
  ).toISOString()

  const invitation = createInvitation({
    id: uuidv4(),
    token,
    email,
    createdBy: session.user.id,
    expiresAt,
  })

  const registrationUrl = `${env.BASE_URL}/register?token=${token}`
  return NextResponse.json({ ...invitation, registrationUrl }, { status: 201 })
}
