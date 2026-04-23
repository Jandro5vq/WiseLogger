export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'
import { getInvitationByToken, markInvitationUsed } from '@/lib/db/queries/invitations'
import { getUserByUsername, getUserByEmail, createUser } from '@/lib/db/queries/users'
import { hashPassword, validatePassword } from '@/lib/auth/password'
import { createDefaultRules } from '@/lib/db/queries/schedule-rules'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { token, username, email, password } = body as {
    token: string
    username: string
    email: string
    password: string
  }

  if (!token || !username || !email || !password) {
    return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
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

  if (invitation.email && invitation.email.toLowerCase() !== email.toLowerCase()) {
    return NextResponse.json({ error: 'Email does not match invitation' }, { status: 400 })
  }

  if (getUserByUsername(username)) {
    return NextResponse.json({ error: 'Username already taken' }, { status: 409 })
  }

  if (getUserByEmail(email)) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
  }

  const passwordHash = await hashPassword(password)
  const rawApiKey = 'wl_' + crypto.randomBytes(32).toString('hex')
  const mcpApiKeyHash = crypto.createHash('sha256').update(rawApiKey).digest('hex')
  const now = new Date().toISOString()
  const userId = uuidv4()

  createUser({
    id: userId,
    username,
    email: email.toLowerCase(),
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
