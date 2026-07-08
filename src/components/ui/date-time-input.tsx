'use client'

/**
 * DateTimeInput — date + text-based 24h time input.
 * Uses type="text" for time to avoid the browser rendering AM/PM.
 * value / onChange use "YYYY-MM-DDTHH:MM" format (same as datetime-local).
 */

import { useState } from 'react'

interface DateTimeInputProps {
  value: string
  onChange: (value: string) => void
  className?: string
  required?: boolean
}

function splitDateTime(value: string): { date: string; time: string } {
  if (!value) return { date: '', time: '' }
  const [date = '', time = ''] = value.split('T')
  return { date, time: time.slice(0, 5) }
}

/** Auto-format raw keystroke sequence into HH:MM */
function coerceTime(raw: string): string {
  // Strip non-digits
  const digits = raw.replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}

/** Return true if string is a valid HH:MM in 0-23 / 0-59 range */
function isValidTime(t: string): boolean {
  const m = t.match(/^(\d{2}):(\d{2})$/)
  if (!m) return false
  return parseInt(m[1]) < 24 && parseInt(m[2]) < 60
}

const base =
  'rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

export function DateTimeInput({ value, onChange, className = '', required }: DateTimeInputProps) {
  const { date, time } = splitDateTime(value)
  // Shows an inline error when a blurred time is out of range, instead of the old
  // silent reset that discarded the user's input with no explanation.
  const [error, setError] = useState(false)

  function handleDate(d: string) {
    onChange(`${d}T${time || '00:00'}`)
  }

  function handleTime(raw: string) {
    const coerced = coerceTime(raw)
    // Always propagate so the input stays responsive; validated on blur.
    if (error && isValidTime(coerced)) setError(false)
    onChange(`${date || new Date().toISOString().split('T')[0]}T${coerced}`)
  }

  function handleTimeBlur(raw: string) {
    const coerced = coerceTime(raw)
    // Keep the (invalid) value visible so the user can fix it; flag the error.
    setError(coerced.length > 0 && !isValidTime(coerced))
  }

  return (
    <div className={className}>
      <div className="flex gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => handleDate(e.target.value)}
          required={required}
          className={base}
        />
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
          className={`${base} w-24 font-mono ${error ? 'border-destructive focus:ring-destructive' : ''}`}
        />
      </div>
      {error && (
        <p className="mt-1 text-xs text-destructive">Hora no válida (HH:MM, 00:00–23:59)</p>
      )}
    </div>
  )
}
