/**
 * Per-device palette for the task timeline (DayTimeline's Gantt chart). Same
 * storage pattern as the accent color (localStorage, applied client-side) —
 * see accent-provider.tsx — rather than a server-side per-user setting, since
 * nothing else in this app persists appearance prefs to the account.
 */

export const TASK_PALETTE_STORAGE_KEY = 'wl:task-palette'

export const DEFAULT_TASK_PALETTE: readonly string[] = [
  '#3b82f6', // blue
  '#a855f7', // purple
  '#f97316', // orange
  '#14b8a6', // teal
  '#ec4899', // pink
]

function isHex(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)
}

/** Reads the stored palette, falling back to defaults for missing/invalid slots. */
export function readTaskPalette(): string[] {
  if (typeof window === 'undefined') return [...DEFAULT_TASK_PALETTE]
  try {
    const raw = localStorage.getItem(TASK_PALETTE_STORAGE_KEY)
    if (!raw) return [...DEFAULT_TASK_PALETTE]
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length !== DEFAULT_TASK_PALETTE.length) {
      return [...DEFAULT_TASK_PALETTE]
    }
    return parsed.map((v, i) => (isHex(v) ? v : DEFAULT_TASK_PALETTE[i]))
  } catch {
    return [...DEFAULT_TASK_PALETTE]
  }
}

/** Sets one slot of the palette and persists the full array. Returns the updated palette. */
export function writeTaskPaletteColor(index: number, hex: string): string[] {
  const next = readTaskPalette()
  next[index] = hex
  localStorage.setItem(TASK_PALETTE_STORAGE_KEY, JSON.stringify(next))
  return next
}

/** Resets the palette to defaults. Returns the reset palette. */
export function resetTaskPalette(): string[] {
  const next = [...DEFAULT_TASK_PALETTE]
  localStorage.setItem(TASK_PALETTE_STORAGE_KEY, JSON.stringify(next))
  return next
}
