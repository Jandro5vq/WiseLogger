'use client'

/**
 * TimeInput — always renders in 24h format using type="text".
 * value / onChange use "HH:MM" strings.
 * Masking/validation lives in @/lib/time-mask, shared with DateTimeInput.
 */

import { useState } from 'react'
import { applyTimeKeystroke, isValidTime } from '@/lib/time-mask'

interface TimeInputProps {
  value: string
  onChange: (value: string) => void
  className?: string
  required?: boolean
}

export function TimeInput({ value, onChange, className = '', required }: TimeInputProps) {
  // Shows an inline error when a blurred time is out of range, instead of the old
  // silent revert that discarded the user's input with no explanation.
  const [error, setError] = useState(false)

  function handleChange(rawInput: string) {
    const raw = applyTimeKeystroke(value, rawInput)
    if (raw === null) return // reject the keystroke — controlled value snaps back
    if (error && isValidTime(raw)) setError(false)
    onChange(raw)
  }

  function handleBlur(raw: string) {
    setError(raw.length > 0 && !isValidTime(raw))
  }

  return (
    <div>
      <input
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={(e) => handleBlur(e.target.value)}
        placeholder="HH:MM"
        maxLength={5}
        inputMode="numeric"
        pattern="[0-2][0-9]:[0-5][0-9]"
        required={required}
        aria-invalid={error}
        className={`font-mono ${error ? 'border-destructive focus:ring-destructive' : ''} ${className}`}
      />
      {error && (
        <p className="mt-1 text-xs text-destructive">Hora no válida (HH:MM, 00:00–23:59)</p>
      )}
    </div>
  )
}
