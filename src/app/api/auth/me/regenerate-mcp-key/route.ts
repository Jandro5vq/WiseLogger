export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { getSession } from '@/lib/auth/session'
import { updateUser } from '@/lib/db/queries/users'

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rawApiKey = 'wl_' + crypto.randomBytes(32).toString('hex')
  const mcpApiKeyHash = crypto.createHash('sha256').update(rawApiKey).digest('hex')

  updateUser(session.user.id, { mcpApiKeyHash })

  return NextResponse.json({ apiKey: rawApiKey })
}
