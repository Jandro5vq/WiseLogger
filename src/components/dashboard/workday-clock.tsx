'use client'

import { useEffect, useState } from 'react'
import { formatElapsed } from '@/lib/utils'
import { breakOverlapMs, type BreakInterval } from '@/lib/business/break-math'

interface WorkdayClockProps {
  /** ISO start of the workday (the entry's clock-in). */
  entryStartTime: string
  /** Today's breaks — time inside them doesn't count. */
  breaks: BreakInterval[]
}

/**
 * Time on the clock today: from the entry start to now, minus the breaks already
 * taken. Independent of the tasks logged — it only looks at clock-in and breaks.
 */
export function WorkdayClock({ entryStartTime, breaks }: WorkdayClockProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const startMs = new Date(entryStartTime).getTime()
  const workedMs = Math.max(0, now - startMs - breakOverlapMs(startMs, now, breaks))
  const inBreak = breaks.some((b) => {
    const s = new Date(b.startIso).getTime()
    return s <= now && now < new Date(b.endIso).getTime()
  })

  return (
    <p className="text-xs text-muted-foreground tabular-nums" title="Desde la hora de entrada, descontando las pausas">
      Jornada{' '}
      <span className="font-mono font-semibold text-foreground">{formatElapsed(workedMs)}</span>
      {inBreak && <span className="ml-1 text-amber-600 dark:text-amber-400">(en pausa)</span>}
    </p>
  )
}
