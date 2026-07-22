/**
 * Shared masking/validation for the 24h "HH:MM" text inputs (DateTimeInput and
 * TimeInput). Validates progressively as the user types — each keystroke is
 * checked against the partial HH:MM pattern before it's accepted, instead of
 * accepting anything and reformatting/resetting after the fact — modeled on
 * https://github.com/dima-bu/react-time-input. This keeps native caret/backspace
 * behavior intact: we only ever append or trim a single character at the point
 * the user is typing, never rebuild the string from a raw digit stream.
 */

/** True if `val` could still become a valid "HH:MM" by typing more digits. */
export function isValidPartialTime(val: string): boolean {
  if (!/^\d{0,2}:?\d{0,2}$/.test(val)) return false

  const [hoursStr, minutesStr] = val.split(':')

  if (hoursStr && hoursStr.length > 0) {
    const hours = Number(hoursStr)
    if (!(hours >= 0 && hours <= 23)) return false
  }

  if (minutesStr !== undefined && minutesStr.length > 0) {
    const minutes = Number(minutesStr)
    if (!(minutes >= 0 && minutes <= 59)) return false
    // A single minute digit above 5 can never lead to a valid two-digit minute.
    if (minutesStr.length === 1 && minutes > 5) return false
  }

  return true
}

/** Return true if string is a complete, valid HH:MM in 0-23 / 0-59 range */
export function isValidTime(t: string): boolean {
  const m = t.match(/^(\d{2}):(\d{2})$/)
  if (!m) return false
  return parseInt(m[1]) < 24 && parseInt(m[2]) < 60
}

/**
 * Applies one keystroke's raw input on top of the previously committed value.
 * Returns the new value to commit, or null if the keystroke should be rejected
 * (the controlled input then just snaps back to the previous value).
 */
export function applyTimeKeystroke(prevValue: string, rawInput: string): string | null {
  let raw = rawInput

  // Support pasting a raw digit sequence (e.g. "0930") by inserting the ':' up
  // front, since isValidPartialTime otherwise only recognizes the colon-separated form.
  if (!raw.includes(':') && raw.length > 2) {
    raw = `${raw.slice(0, 2)}:${raw.slice(2)}`
  }
  if (raw.length > 5) return null
  if (!isValidPartialTime(raw)) return null

  if (raw.length === 2 && raw.indexOf(':') === -1) {
    if (prevValue.length === 3) {
      // The 3rd char just deleted was the auto-inserted ':' (native backspace
      // right after it) — treat the ':' as transparent and drop the digit
      // before it too, instead of silently reappending the same ':' back.
      raw = raw.slice(0, 1)
    } else {
      raw = raw + ':'
    }
  }

  return raw
}
