/**
 * Pure timezone helpers — no DB / no Node-only imports, safe on client and server.
 * The app stores per-user IANA timezones; these convert between a user's local
 * civil time and absolute UTC instants so client and server agree on "which day".
 */

/**
 * The timezone's UTC offset (in ms) at a given instant: localCivil(instant) − instant.
 * Positive for zones ahead of UTC, negative for zones behind.
 */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)
  const p: Record<string, number> = {}
  for (const { type, value } of parts) if (type !== 'literal') p[type] = parseInt(value)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second)
  return asUtc - instant.getTime()
}

/**
 * Convert a local HH:MM on a given YYYY-MM-DD date to a UTC ISO string,
 * using the provided IANA timezone. Handles day-boundary wraps and any offset.
 * Falls back to treating HH:MM as the host's local time if the timezone is invalid.
 */
export function hhmmToUTC(dateStr: string, timeStr: string, timezone: string): string {
  try {
    // Treat the desired civil time as if it were UTC, then correct by the zone offset.
    const naiveMs = Date.parse(`${dateStr}T${timeStr}:00Z`)
    const offset = tzOffsetMs(new Date(naiveMs), timezone)
    return new Date(naiveMs - offset).toISOString()
  } catch (e) {
    console.error('hhmmToUTC: invalid timezone or date, falling back to host local time', { dateStr, timeStr, timezone }, e)
    return new Date(`${dateStr}T${timeStr}:00`).toISOString()
  }
}

/** The YYYY-MM-DD calendar date that `instant` falls on in the given timezone. */
export function dateStringInTz(instant: Date, timeZone = 'UTC'): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(instant)
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(instant)
  }
}

/** Add `n` days to a YYYY-MM-DD string (calendar arithmetic, UTC-anchored). */
export function addDateStr(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** UTC epoch ms of the start (00:00) of local `dateStr` in the given timezone. */
export function localMidnightUtcMs(dateStr: string, timeZone = 'UTC'): number {
  return new Date(hhmmToUTC(dateStr, '00:00', timeZone)).getTime()
}

/** A piece of a task that falls within a single local calendar day. */
export interface DaySegment {
  dateStr: string // local YYYY-MM-DD the segment belongs to
  startIso: string
  endIso: string
}

/**
 * Split [startIso, endIso) at every local midnight in the given timezone, so each
 * returned segment belongs to exactly one local calendar day. A task that does not
 * cross midnight yields a single segment. Returns [] if end <= start.
 */
export function splitAtMidnights(startIso: string, endIso: string, timeZone = 'UTC'): DaySegment[] {
  const startMs = Date.parse(startIso)
  const endMs = Date.parse(endIso)
  if (!(endMs > startMs)) return []

  const segments: DaySegment[] = []
  let curMs = startMs
  // Hard cap guards against any pathological timezone arithmetic (≈ a year of days).
  for (let i = 0; curMs < endMs && i < 400; i++) {
    const dateStr = dateStringInTz(new Date(curMs), timeZone)
    const nextMidnight = localMidnightUtcMs(addDateStr(dateStr, 1), timeZone)
    const segEndMs = Math.min(nextMidnight, endMs)
    segments.push({
      dateStr,
      startIso: new Date(curMs).toISOString(),
      endIso: new Date(segEndMs).toISOString(),
    })
    curMs = segEndMs
  }
  return segments
}
