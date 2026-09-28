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
 * Free-text parsing ("930" → 09:30) lives in TimeField, shared with TimeInput.
 */

import { TimeField } from '@/components/ui/time-field'

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
  // Drop seconds from a full "HH:MM:SS" value; anything else (raw invalid text) is kept.
  return { date, time: /^\d{2}:\d{2}:/.test(time) ? time.slice(0, 5) : time }
}

const base =
  'rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

export function DateTimeInput({ value, onChange, contextDate, className = '', required }: DateTimeInputProps) {
  const { date, time } = splitDateTime(value)

  return (
    <div className={className}>
      <TimeField
        value={time}
        // An emptied field is "no time" — emitting a bare "YYYY-MM-DDT" would look like a
        // value to callers and parse as an Invalid Date.
        onChange={(t) => onChange(t ? `${date || contextDate}T${t}` : '')}
        required={required}
        showNow
        className={`${base} w-24`}
      />
    </div>
  )
}
