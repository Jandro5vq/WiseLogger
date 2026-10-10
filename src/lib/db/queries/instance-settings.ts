import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { instanceSettings } from '@db/schema'
import type { ManualSeasonalTheme, SeasonalThemeMode, SeasonalThemeSettings } from '@/lib/seasonal-theme'
import { MANUAL_SEASONAL_THEMES } from '@/lib/seasonal-theme'

const SETTINGS_ID = 1

export function getSeasonalThemeSettings(): SeasonalThemeSettings {
  const settings = db
    .select({
      seasonalThemeMode: instanceSettings.seasonalThemeMode,
      manualSeasonalTheme: instanceSettings.manualSeasonalTheme,
      manualSeasonalThemeUntil: instanceSettings.manualSeasonalThemeUntil,
    })
    .from(instanceSettings)
    .where(eq(instanceSettings.id, SETTINGS_ID))
    .get()

  // Removed decorations may remain in an older database; resume the calendar safely.
  if (settings?.manualSeasonalTheme && !MANUAL_SEASONAL_THEMES.includes(settings.manualSeasonalTheme)) {
    return {
      seasonalThemeMode: settings.seasonalThemeMode === 'manual' ? 'automatic' : settings.seasonalThemeMode,
      manualSeasonalTheme: null,
      manualSeasonalThemeUntil: null,
    }
  }

  return settings ?? {
    seasonalThemeMode: 'automatic',
    manualSeasonalTheme: null,
    manualSeasonalThemeUntil: null,
  }
}

export function updateSeasonalThemeSettings(data: {
  seasonalThemeMode: SeasonalThemeMode
  manualSeasonalTheme: ManualSeasonalTheme | null
  manualSeasonalThemeUntil: string | null
}): SeasonalThemeSettings {
  const isManual = data.seasonalThemeMode === 'manual'
  const updated = db
    .update(instanceSettings)
    .set({
      seasonalThemeMode: data.seasonalThemeMode,
      manualSeasonalTheme: isManual ? data.manualSeasonalTheme : null,
      manualSeasonalThemeUntil: isManual ? data.manualSeasonalThemeUntil : null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(instanceSettings.id, SETTINGS_ID))
    .returning({
      seasonalThemeMode: instanceSettings.seasonalThemeMode,
      manualSeasonalTheme: instanceSettings.manualSeasonalTheme,
      manualSeasonalThemeUntil: instanceSettings.manualSeasonalThemeUntil,
    })
    .get()

  if (!updated) throw new Error('No se encontró la configuración de instancia')
  return updated
}
