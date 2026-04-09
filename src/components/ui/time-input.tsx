'use client'

/**
 * TimeInput — always renders in 24h format using type="text".
 * value / onChange use "HH:MM" strings.
 */

interface TimeInputProps {
  value: string
  onChange: (value: string) => void
  className?: string
  required?: boolean
}

function coerceTime(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}

function isValidTime(t: string): boolean {
  const m = t.match(/^(\d{2}):(\d{2})$/)
  if (!m) return false
  return parseInt(m[1]) < 24 && parseInt(m[2]) < 60
}

export function TimeInput({ value, onChange, className = '', required }: TimeInputProps) {
  function handleChange(raw: string) {
    onChange(coerceTime(raw))
  }

  function handleBlur(raw: string) {
    const coerced = coerceTime(raw)
    if (!isValidTime(coerced)) onChange(value) // revert to last valid
  }

  return (
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
      className={`font-mono ${className}`}
    />
  )
}
