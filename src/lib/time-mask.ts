/**
 * Parsing/validation for the 24h "HH:MM" time fields (TimeField, used by
 * TimeInput and DateTimeInput). Instead of rejecting keystrokes that don't fit a
 * strict mask, the field accepts free text and normalizes whatever the user
 * typed — "9" → 09:00, "930" → 09:30, "9.30"/"9h30" → 09:30, "14h" → 14:00.
 */

/**
 * Parses a free-form time into "HH:MM", or null if it isn't a valid time.
 *   - digits only: 1–2 → hour ("9" → 09:00), 3 → H MM ("930"), 4 → HH MM ("1430")
 *   - hour + separator (: . , h or space) + optional minutes: "9:5" → 09:05, "14h" → 14:00
 */
export function parseTimeInput(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null

  let h: string
  let m: string
  const digits = s.match(/^\d{1,4}$/)
  if (digits) {
    if (s.length <= 2) { h = s; m = '0' }
    else if (s.length === 3) { h = s.slice(0, 1); m = s.slice(1) }
    else { h = s.slice(0, 2); m = s.slice(2) }
  } else {
    const sep = s.match(/^(\d{1,2})\s*[:.,hH ]\s*(\d{0,2})$/)
    if (!sep) return null
    h = sep[1]
    m = sep[2] || '0'
  }

  const hours = Number(h)
  const minutes = Number(m)
  if (hours > 23 || minutes > 59) return null
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/** Shifts a valid "HH:MM" by `deltaMinutes`, wrapping around the 24h clock. */
export function shiftTime(hhmm: string, deltaMinutes: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = (((h * 60 + m + deltaMinutes) % 1440) + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Current local time as "HH:MM". */
export function nowHHMM(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Return true if string is a complete, valid HH:MM in 0-23 / 0-59 range */
export function isValidTime(t: string): boolean {
  const m = t.match(/^(\d{2}):(\d{2})$/)
  if (!m) return false
  return parseInt(m[1]) < 24 && parseInt(m[2]) < 60
}

/**
 * For a task form's "YYYY-MM-DDTHH:MM" start/end values: returns an error message
 * if a non-empty field holds an incomplete/invalid time, or null if both are fine.
 */
export function incompleteTimeError(start: string, end: string): string | null {
  const time = (v: string) => v.split('T')[1] ?? ''
  if (start && !isValidTime(time(start))) return 'La hora de inicio está incompleta (HH:MM)'
  if (end && !isValidTime(time(end))) return 'La hora de fin está incompleta (HH:MM)'
  return null
}
