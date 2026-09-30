export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'
import { getInvitationByToken, markInvitationUsed } from '@/lib/db/queries/invitations'
import { createUser } from '@/lib/db/queries/users'
import { hashPassword, validatePassword } from '@/lib/auth/password'
import { checkEmail, checkUsername } from '@/lib/business/user-identity'
import { createDefaultRules } from '@/lib/db/queries/schedule-rules'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { token, password } = body as { token: string; password: string }

  if (!token || !body.username || !body.email || !password) {
    return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
  }

  if (typeof password !== 'string') {
    return NextResponse.json({ error: 'Contraseña inválida' }, { status: 400 })
  }
  const pwError = validatePassword(password)
  if (pwError) {
    return NextResponse.json({ error: pwError }, { status: 400 })
  }

  const invitation = getInvitationByToken(token)
  if (!invitation) {
    return NextResponse.json({ error: 'Invalid invitation' }, { status: 400 })
  }

  if (invitation.usedAt) {
    return NextResponse.json({ error: 'Invitation already used' }, { status: 400 })
  }

  if (new Date(invitation.expiresAt) < new Date()) {
    return NextResponse.json({ error: 'Invitation expired' }, { status: 400 })
  }

  // Normalized: trimmed, first letter upper-cased, validated and unique (case-insensitive)
  const username = checkUsername(body.username)
  if (!username.ok) return NextResponse.json({ error: username.error }, { status: username.status })

  const email = checkEmail(body.email)
  if (!email.ok) return NextResponse.json({ error: email.error }, { status: email.status })

  if (invitation.email && invitation.email.trim().toLowerCase() !== email.value) {
    return NextResponse.json({ error: 'El email no coincide con el de la invitación' }, { status: 400 })
  }

  const passwordHash = await hashPassword(password)
  const rawApiKey = 'wl_' + crypto.randomBytes(32).toString('hex')
  const mcpApiKeyHash = crypto.createHash('sha256').update(rawApiKey).digest('hex')
  const now = new Date().toISOString()
  const userId = uuidv4()

  createUser({
    id: userId,
    username: username.value,
    email: email.value,
    passwordHash,
    role: 'user',
    mcpApiKeyHash,
    createdAt: now,
  })

  createDefaultRules(userId)
  markInvitationUsed(token, userId, now)

  return NextResponse.json(
    { message: 'Account created successfully', apiKey: rawApiKey, warning: 'Save this API key now. It cannot be retrieved later.' },
    { status: 201 }
  )
}
