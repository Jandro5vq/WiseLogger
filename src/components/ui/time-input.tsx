'use client'

/**
 * TimeInput — always renders in 24h format using type="text".
 * value / onChange use "HH:MM" strings.
 * Parsing/normalization lives in TimeField (shared with DateTimeInput).
 */

import { TimeField } from '@/components/ui/time-field'

interface TimeInputProps {
  value: string
  onChange: (value: string) => void
  className?: string
  required?: boolean
  showNow?: boolean
}

export function TimeInput(props: TimeInputProps) {
  return <TimeField {...props} />
}
