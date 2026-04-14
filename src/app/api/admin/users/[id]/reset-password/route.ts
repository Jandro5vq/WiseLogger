export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/session'
import { getUserById, updateUser } from '@/lib/db/queries/users'
import { hashPassword } from '@/lib/auth/password'
import crypto from 'crypto'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const user = getUserById(params.id)
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const tempPassword = crypto.randomBytes(8).toString('hex') // 16-char hex
  const passwordHash = await hashPassword(tempPassword)
  updateUser(params.id, { passwordHash, validSince: new Date().toISOString() })

  return NextResponse.json({ tempPassword })
}
