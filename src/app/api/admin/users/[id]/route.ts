export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/session'
import { getUserById, updateUser } from '@/lib/db/queries/users'
import { AdminUserPatchSchema } from '@/lib/validation'
import { checkEmail, checkUsername } from '@/lib/business/user-identity'
import { softDeleteUser } from '@/lib/business/user-lifecycle'
import type { users } from '@db/schema'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const user = getUserById(params.id)
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const parsed = AdminUserPatchSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  }
  const body = parsed.data
  const updates: Partial<typeof users.$inferInsert> = {}

  if (body.isActive !== undefined) updates.isActive = body.isActive

  if (body.username !== undefined) {
    const username = checkUsername(body.username, user.id)
    if (!username.ok) return NextResponse.json({ error: username.error }, { status: username.status })
    updates.username = username.value
  }

  if (body.email !== undefined) {
    const email = checkEmail(body.email, user.id)
    if (!email.ok) return NextResponse.json({ error: email.error }, { status: email.status })
    updates.email = email.value
  }

  const updated = updateUser(params.id, updates)!
  return NextResponse.json({
    id: updated.id,
    username: updated.username,
    email: updated.email,
    isActive: updated.isActive,
  })
}

/** Soft delete: the user goes to the trash and can be restored until purged. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  let session
  try {
    session = await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const result = softDeleteUser(params.id, session.user.id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
