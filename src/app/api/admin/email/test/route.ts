export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/session'
import { getUserById } from '@/lib/db/queries/users'
import { isEmailEnabled } from '@/lib/email/send'
import { sendTestEmail } from '@/lib/email/notifications'

/** Sends a test email to the calling admin, to check the Resend configuration. */
export async function POST() {
  let session
  try {
    session = await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!isEmailEnabled()) {
    return NextResponse.json({ error: 'El correo no está configurado' }, { status: 400 })
  }
  const admin = getUserById(session.user.id)
  if (!admin) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { ok } = await sendTestEmail(admin)
  if (!ok) {
    return NextResponse.json(
      { error: 'Resend no ha aceptado el email. Revisa RESEND_API_KEY, EMAIL_FROM y el dominio verificado.' },
      { status: 502 }
    )
  }
  return NextResponse.json({ ok: true, to: admin.email })
}
