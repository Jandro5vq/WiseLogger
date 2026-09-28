'use client'

/**
 * TimeField — free-text 24h "HH:MM" field shared by TimeInput and DateTimeInput.
 *
 * Accepts whatever the user types and normalizes it (see parseTimeInput):
 * "9" → 09:00, "930" → 09:30, "9.30"/"9h30" → 09:30. The parsed value is emitted
 * on every keystroke (so submitting with Enter never sends a stale value); the
 * visible text is rewritten to HH:MM on blur/Enter. Unparseable text is emitted
 * as-is and marked invalid via setCustomValidity, which blocks the surrounding
 * form's submit natively.
 *
 * Keys: ↑/↓ ±1 min, Shift+↑/↓ ±15 min (starting from now when empty).
 */

import { useEffect, useRef, useState } from 'react'
import { nowHHMM, parseTimeInput, shiftTime } from '@/lib/time-mask'

interface TimeFieldProps {
  /** "HH:MM", '' when empty, or the raw text of an invalid entry. */
  value: string
  onChange: (value: string) => void
  className?: string
  required?: boolean
  /** Shows an "Ahora" button that fills in the current local time. */
  showNow?: boolean
}

const INVALID_MSG = 'Hora no válida (HH:MM, 00:00–23:59)'

export function TimeField({ value, onChange, className = '', required, showNow }: TimeFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(value)
  const [focused, setFocused] = useState(false)
  const [error, setError] = useState(false)
  // Clicking into the field selects its content; skip the mouseup that would
  // otherwise immediately collapse that selection.
  const skipMouseUp = useRef(false)

  // Follow external value changes (reset, "Ahora", parent edits) while not typing.
  useEffect(() => {
    if (!focused) setText(value)
  }, [value, focused])

  const invalid = text.trim() !== '' && parseTimeInput(text) === null

  useEffect(() => {
    inputRef.current?.setCustomValidity(invalid ? INVALID_MSG : '')
    if (!invalid) setError(false)
  }, [invalid])

  function emit(raw: string) {
    setText(raw)
    onChange(raw.trim() === '' ? '' : (parseTimeInput(raw) ?? raw))
  }

  function normalize() {
    const parsed = parseTimeInput(text)
    if (parsed) setText(parsed)
    setError(invalid)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const step = (e.shiftKey ? 15 : 1) * (e.key === 'ArrowUp' ? 1 : -1)
      emit(shiftTime(parseTimeInput(text) ?? nowHHMM(), step))
    } else if (e.key === 'Enter') {
      normalize() // the form still submits — the parsed value was already emitted
    }
  }

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => emit(e.target.value)}
          onFocus={(e) => {
            setFocused(true)
            e.target.select()
            skipMouseUp.current = true
          }}
          onMouseUp={(e) => {
            if (skipMouseUp.current) e.preventDefault()
            skipMouseUp.current = false
          }}
          onBlur={() => {
            setFocused(false)
            normalize()
          }}
          onKeyDown={handleKeyDown}
          placeholder="HH:MM"
          maxLength={6}
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          required={required}
          aria-invalid={error}
          title="Ej.: 9, 930, 9:30, 14h — ↑/↓ ±1 min, Shift ±15"
          className={`font-mono ${error ? 'border-destructive focus:ring-destructive' : ''} ${className}`}
        />
        {showNow && (
          <button
            type="button"
            onClick={() => emit(nowHHMM())}
            className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            Ahora
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{INVALID_MSG}</p>}
    </div>
  )
}
