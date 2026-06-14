export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getBreakRuleById, updateBreakRule, deleteBreakRule } from '@/lib/db/queries/break-rules'
import { parseBody } from '@/lib/api'
import { BreakRulePatchSchema } from '@/lib/validation'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rule = getBreakRuleById(params.id)
  if (!rule || rule.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const parsed = parseBody(BreakRulePatchSchema, await req.json())
  if (!parsed.ok) return parsed.response
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'No hay campos válidos que actualizar' }, { status: 400 })
  }

  const updated = updateBreakRule(params.id, parsed.data)
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(_req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rule = getBreakRuleById(params.id)
  if (!rule || rule.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  deleteBreakRule(params.id)
  return NextResponse.json({ ok: true })
}
