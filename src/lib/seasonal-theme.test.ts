import { describe, expect, it } from 'vitest'
import { MANUAL_SEASONAL_THEMES, resolveSeasonalTheme, type SeasonalThemeSettings } from '@/lib/seasonal-theme'

const automatic: SeasonalThemeSettings = {
  seasonalThemeMode: 'automatic',
  manualSeasonalTheme: null,
  manualSeasonalThemeUntil: null,
}

describe('resolveSeasonalTheme', () => {
  it.each([
    ['2026-10-19T21:59:59.000Z', 'none'],
    ['2026-10-19T22:00:00.000Z', 'halloween'],
    ['2026-11-02T22:59:59.000Z', 'halloween'],
    ['2026-11-02T23:00:00.000Z', 'none'],
    ['2026-11-30T22:59:59.000Z', 'none'],
    ['2026-11-30T23:00:00.000Z', 'winter'],
    ['2026-12-31T23:00:00.000Z', 'winter'],
    ['2027-01-06T22:59:59.000Z', 'winter'],
    ['2027-01-06T23:00:00.000Z', 'winter'],
    ['2027-01-07T22:59:59.000Z', 'winter'],
    ['2027-01-07T23:00:00.000Z', 'none'],
    ['2027-03-19T22:59:59.000Z', 'none'],
    ['2027-03-19T23:00:00.000Z', 'spring'],
    ['2027-04-05T21:59:59.000Z', 'spring'],
    ['2027-04-05T22:00:00.000Z', 'none'],
    ['2027-06-20T21:59:59.000Z', 'none'],
    ['2027-06-20T22:00:00.000Z', 'summer'],
    ['2027-07-07T21:59:59.000Z', 'summer'],
    ['2027-07-07T22:00:00.000Z', 'none'],
  ] as const)('uses the configured automatic window on %s', (date, expected) => {
    expect(resolveSeasonalTheme(automatic, new Date(date))).toBe(expected)
  })

  it('always hides decorations when disabled', () => {
    expect(resolveSeasonalTheme({ ...automatic, seasonalThemeMode: 'disabled' }, new Date('2026-12-24T12:00:00.000Z'))).toBe('none')
  })

  it('uses a valid manual override before falling back to the automatic calendar', () => {
    const settings: SeasonalThemeSettings = {
      seasonalThemeMode: 'manual',
      manualSeasonalTheme: 'halloween',
      manualSeasonalThemeUntil: '2026-12-10T00:00:00.000Z',
    }

    expect(resolveSeasonalTheme(settings, new Date('2026-11-20T00:00:00.000Z'))).toBe('halloween')
    expect(resolveSeasonalTheme(settings, new Date('2026-12-24T00:00:00.000Z'))).toBe('winter')
    expect(resolveSeasonalTheme(settings, new Date(settings.manualSeasonalThemeUntil!))).toBe('winter')
  })

  it.each(MANUAL_SEASONAL_THEMES)('allows a temporary %s override', (theme) => {
    expect(resolveSeasonalTheme({
      seasonalThemeMode: 'manual', manualSeasonalTheme: theme, manualSeasonalThemeUntil: '2027-05-11T12:00:00Z',
    }, new Date('2027-05-10T12:00:00Z'))).toBe(theme)
  })

  it.each([null, 'not-a-date', '2025-01-01T00:00:00Z'])('ignores missing, invalid or expired override expiry (%s)', (until) => {
    expect(resolveSeasonalTheme({
      seasonalThemeMode: 'manual', manualSeasonalTheme: 'spring', manualSeasonalThemeUntil: until,
    }, new Date('2027-01-03T12:00:00Z'))).toBe('winter')
  })
})
