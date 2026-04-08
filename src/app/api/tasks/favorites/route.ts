export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getFavorites } from '@/lib/db/queries/tasks'

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const favorites = getFavorites(session.user.id, 10)
  return NextResponse.json(
    favorites.map((f) => ({
      description: f.description,
      tags: JSON.parse(f.tags || '[]') as string[],
      uses: f.uses,
    }))
  )
}
