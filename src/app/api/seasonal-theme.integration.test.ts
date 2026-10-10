import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { NextRequest } from 'next/server'

vi.mock('@/lib/auth/session', () => ({ requireAdmin: vi.fn() }))

import { requireAdmin } from '@/lib/auth/session'
import { sqlite } from '@/lib/db'
import { GET, PATCH } from '@/app/api/admin/seasonal-theme/route'
import { MANUAL_SEASONAL_THEMES } from '@/lib/seasonal-theme'

function request(body: unknown): NextRequest {
  return new Request('http://localhost/api/admin/seasonal-theme', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

beforeAll(() => {
  process.env.DB_PATH = path.join(os.tmpdir(), `wl-seasonal-${process.pid}-${Date.now()}.db`)
  const migrations = path.join(process.cwd(), 'drizzle/migrations')
  for (const file of fs.readdirSync(migrations).filter((file) => file.endsWith('.sql')).sort()) {
    sqlite.exec(fs.readFileSync(path.join(migrations, file), 'utf8'))
  }
})

beforeEach(() => {
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: 'admin', role: 'admin' } } as Awaited<ReturnType<typeof requireAdmin>>)
  sqlite.prepare("UPDATE instance_settings SET seasonal_theme_mode = 'automatic', manual_seasonal_theme = NULL, manual_seasonal_theme_until = NULL").run()
})

describe('admin seasonal-theme API', () => {
  it.each(MANUAL_SEASONAL_THEMES)('persists and resolves the %s decoration', async (theme) => {
    const res = await PATCH(request({
      seasonalThemeMode: 'manual', manualSeasonalTheme: theme,
      manualSeasonalThemeUntil: new Date(Date.now() + 86_400_000).toISOString(),
    }))
    expect(res.status).toBe(200)
    const read = await GET()
    expect(read.headers.get('Cache-Control')).toBe('no-store')
    await expect(read.json()).resolves.toMatchObject({ manualSeasonalTheme: theme, activeTheme: theme })
  })

  it.each([
    { seasonalThemeMode: 'unknown' },
    { seasonalThemeMode: 'manual', manualSeasonalTheme: 'unknown' },
    { seasonalThemeMode: 'manual', manualSeasonalTheme: 'winter', manualSeasonalThemeUntil: '2020-01-01T00:00:00Z' },
    { seasonalThemeMode: 'manual', manualSeasonalTheme: 'reyes', manualSeasonalThemeUntil: '2099-01-01T00:00:00Z' },
  ])('rejects invalid settings without modifying the database', async (body) => {
    expect((await PATCH(request(body))).status).toBe(400)
    await expect((await GET()).json()).resolves.toMatchObject({ seasonalThemeMode: 'automatic', manualSeasonalTheme: null })
  })

  it('falls back to automatic mode for a previously saved Reyes override', async () => {
    sqlite.prepare("UPDATE instance_settings SET seasonal_theme_mode = 'manual', manual_seasonal_theme = 'reyes', manual_seasonal_theme_until = '2099-01-01T00:00:00Z'").run()
    await expect((await GET()).json()).resolves.toMatchObject({
      seasonalThemeMode: 'automatic', manualSeasonalTheme: null, manualSeasonalThemeUntil: null,
    })
  })

  it('saves a temporary manual override', async () => {
    const until = new Date(Date.now() + 86_400_000).toISOString()
    const res = await PATCH(request({
      seasonalThemeMode: 'manual',
      manualSeasonalTheme: 'halloween',
      manualSeasonalThemeUntil: until,
    }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      seasonalThemeMode: 'manual',
      manualSeasonalTheme: 'halloween',
      manualSeasonalThemeUntil: until,
    })
  })

  it('clears a manual override when switching modes', async () => {
    await PATCH(request({
      seasonalThemeMode: 'manual',
      manualSeasonalTheme: 'winter',
      manualSeasonalThemeUntil: new Date(Date.now() + 86_400_000).toISOString(),
    }))
    const res = await PATCH(request({ seasonalThemeMode: 'disabled' }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      seasonalThemeMode: 'disabled',
      manualSeasonalTheme: null,
      manualSeasonalThemeUntil: null,
      activeTheme: 'none',
    })
  })

  it('rejects incomplete manual settings and non-admin callers', async () => {
    expect((await PATCH(request({ seasonalThemeMode: 'manual' }))).status).toBe(400)
    vi.mocked(requireAdmin).mockRejectedValueOnce(new Error('Forbidden'))
    expect((await GET()).status).toBe(403)
    vi.mocked(requireAdmin).mockRejectedValueOnce(new Error('Forbidden'))
    expect((await PATCH(request({ seasonalThemeMode: 'disabled' }))).status).toBe(403)
  })
})
