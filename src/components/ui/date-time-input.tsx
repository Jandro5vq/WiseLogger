'use client'

/**
 * DateTimeInput — text-based 24h time input for a task/pause field.
 * Uses type="text" to avoid the browser rendering AM/PM.
 * value / onChange use "YYYY-MM-DDTHH:MM" format (same as datetime-local) so
 * existing callers (new Date(value).toISOString(), etc.) don't need to change.
 *
 * There is deliberately no date picker: every task/pause always belongs to the
 * calendar day currently being viewed (today on the dashboard, or the specific
 * day in History) — the API rejects anything else — so letting the user pick a
 * different date here would only ever produce a confusing validation error.
 * `contextDate` supplies that day for the hidden date component.
 * Time masking/validation lives in @/lib/time-mask, shared with TimeInput.
 */

import { useState } from 'react'
import { applyTimeKeystroke, isValidTime } from '@/lib/time-mask'

interface DateTimeInputProps {
  value: string
  onChange: (value: string) => void
  /** Calendar day (YYYY-MM-DD) this field belongs to, used as the hidden date
   * component whenever `value` doesn't carry one yet. */
  contextDate: string
  className?: string
  required?: boolean
}

function splitDateTime(value: string): { date: string; time: string } {
  if (!value) return { date: '', time: '' }
  const [date = '', time = ''] = value.split('T')
  return { date, time: time.slice(0, 5) }
}

const base =
  'rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring'

export function DateTimeInput({ value, onChange, contextDate, className = '', required }: DateTimeInputProps) {
  const { date, time } = splitDateTime(value)
  // Shows an inline error when a blurred time is out of range, instead of the old
  // silent reset that discarded the user's input with no explanation.
  const [error, setError] = useState(false)

  function handleTime(rawInput: string) {
    const raw = applyTimeKeystroke(time, rawInput)
    if (raw === null) return // reject the keystroke — controlled value snaps back

    if (error && isValidTime(raw)) setError(false)
    onChange(`${date || contextDate}T${raw}`)
  }

  function handleTimeBlur(raw: string) {
    // Keep the (incomplete/invalid) value visible so the user can fix it; flag the error.
    setError(raw.length > 0 && !isValidTime(raw))
  }

  return (
    <div className={className}>
      <input
        type="text"
        value={time}
        onChange={(e) => handleTime(e.target.value)}
        onBlur={(e) => handleTimeBlur(e.target.value)}
        placeholder="HH:MM"
        maxLength={5}
        inputMode="numeric"
        pattern="[0-2][0-9]:[0-5][0-9]"
        required={required}
        aria-invalid={error}
        className={`${base} w-24 ${error ? 'border-destructive focus:ring-destructive' : ''}`}
      />
      {error && (
        <p className="mt-1 text-xs text-destructive">Hora no válida (HH:MM, 00:00–23:59)</p>
      )}
    </div>
  )
}
