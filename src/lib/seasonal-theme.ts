export const SEASONAL_THEME_MODES = ['disabled', 'automatic', 'manual'] as const
export type SeasonalThemeMode = typeof SEASONAL_THEME_MODES[number]

export const MANUAL_SEASONAL_THEMES = ['halloween', 'winter', 'spring', 'summer'] as const
export type ManualSeasonalTheme = typeof MANUAL_SEASONAL_THEMES[number]
export type ActiveSeasonalTheme = ManualSeasonalTheme | 'none'

export interface SeasonalThemeSettings {
  seasonalThemeMode: SeasonalThemeMode
  manualSeasonalTheme: ManualSeasonalTheme | null
  manualSeasonalThemeUntil: string | null
}

export const SEASONAL_THEME_LABELS: Record<ManualSeasonalTheme, string> = {
  halloween: 'Halloween',
  winter: 'Navidad / invierno',
  spring: 'Primavera',
  summer: 'Verano',
}

// Short recurring windows keep decorations occasional, rather than a permanent theme.
export const SEASONAL_CALENDAR: ReadonlyArray<{
  theme: ManualSeasonalTheme
  start: string
  end: string
  dates: string
  details: string
}> = [
  { theme: 'spring', start: '03-20', end: '04-05', dates: '20 marzo–5 abril', details: 'Flores y una pequeña mariposa' },
  { theme: 'summer', start: '06-21', end: '07-07', dates: '21 junio–7 julio', details: 'Sol, olas y sombrilla' },
  { theme: 'halloween', start: '10-20', end: '11-02', dates: '20 octubre–2 noviembre', details: 'Calabaza iluminada, telaraña y murciélagos' },
  { theme: 'winter', start: '12-01', end: '01-07', dates: '1 diciembre–7 enero', details: 'Guirnalda de luces y árbol con regalos' },
]

function automaticTheme(date: Date): ActiveSeasonalTheme {
  if (!Number.isFinite(date.getTime())) return 'none'
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Madrid', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const day = `${parts.find((part) => part.type === 'month')!.value}-${parts.find((part) => part.type === 'day')!.value}`
  return SEASONAL_CALENDAR.find(({ start, end }) => start <= end
    ? day >= start && day <= end
    : day >= start || day <= end)?.theme ?? 'none'
}

/** Resolves the instance decoration without affecting users' light/dark or accent preference. */
export function resolveSeasonalTheme(settings: SeasonalThemeSettings, now = new Date()): ActiveSeasonalTheme {
  if (settings.seasonalThemeMode === 'disabled') return 'none'

  if (
    settings.seasonalThemeMode === 'manual' &&
    settings.manualSeasonalTheme &&
    MANUAL_SEASONAL_THEMES.includes(settings.manualSeasonalTheme) &&
    settings.manualSeasonalThemeUntil &&
    new Date(settings.manualSeasonalThemeUntil).getTime() > now.getTime()
  ) {
    return settings.manualSeasonalTheme
  }

  return automaticTheme(now)
}
