export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requestPasswordReset } from '@/lib/business/password-reset'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const identifier = typeof body.identifier === 'string' ? body.identifier : ''
  if (!identifier.trim()) {
    return NextResponse.json({ error: 'Indica tu usuario o email' }, { status: 400 })
  }

  requestPasswordReset(identifier)
  // Same answer whether or not the account exists (no enumeration)
  return NextResponse.json({
    message: 'Si la cuenta existe, un administrador te hará llegar un enlace para restablecer la contraseña.',
  })
}
