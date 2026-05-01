export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getBilledForUser, upsertBilled, deleteBilled } from '@/lib/db/queries/billed'
import { v4 as uuidv4 } from 'uuid'

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = getBilledForUser(session.user.id)
  return NextResponse.json(
    rows.map((r) => ({ date: r.date, description: r.description, signature: r.signature }))
  )
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { date, description, signature } = body
  if (!date || !description || !signature) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  upsertBilled({ id: uuidv4(), userId: session.user.id, date, description, signature, billedAt: Date.now() })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { date, description } = body
  if (!date || !description) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  deleteBilled(session.user.id, date, description)
  return NextResponse.json({ ok: true })
}
