export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/session'
import { parseBody } from '@/lib/api'
import { SeasonalThemeSettingsSchema } from '@/lib/validation'
import { getSeasonalThemeSettings, updateSeasonalThemeSettings } from '@/lib/db/queries/instance-settings'
import { resolveSeasonalTheme } from '@/lib/seasonal-theme'

function responseBody() {
  const settings = getSeasonalThemeSettings()
  return { ...settings, activeTheme: resolveSeasonalTheme(settings) }
}

export async function GET() {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json(responseBody(), { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = parseBody(SeasonalThemeSettingsSchema, body)
  if (!parsed.ok) return parsed.response

  const data = parsed.data
  updateSeasonalThemeSettings({
    seasonalThemeMode: data.seasonalThemeMode,
    manualSeasonalTheme: data.manualSeasonalTheme ?? null,
    manualSeasonalThemeUntil: data.manualSeasonalThemeUntil ?? null,
  })

  return NextResponse.json(responseBody())
}
