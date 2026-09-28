'use client'

import { useEffect, useState } from 'react'
import { formatMinutes } from '@/lib/utils'
import { breakOverlapMs, type BreakInterval } from '@/lib/business/break-math'

interface TodayStatsProps {
  entryStartTime: string           // fallback if no tasks yet
  firstTaskStartTime?: string      // drives the expectedEnd reference
  completedTaskMinutes: number     // net worked minutes of finished tasks (rounded per segment)
  expectedMinutes: number
  totalBreakMinutes: number        // sum of today's breaks (shifts expectedEnd)
  activeTaskStartTime?: string     // ISO — for live "worked" ticking
  breaks?: BreakInterval[]         // today's breaks, to keep live time net
  entryEndTime?: string            // set once the day is closed — shown instead of the forecast
  stacked?: boolean                // one column on wide screens (when sharing a row)
}

function fmtHHMM(ms: number): string {
  const d = new Date(ms)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

export function TodayStats({
  entryStartTime,
  firstTaskStartTime,
  completedTaskMinutes,
  expectedMinutes,
  totalBreakMinutes,
  activeTaskStartTime,
  breaks = [],
  entryEndTime,
  stacked = false,
}: TodayStatsProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // ── workday clock — anchored to first task (or entry start as fallback) ──────
  const refMs = firstTaskStartTime
    ? new Date(firstTaskStartTime).getTime()
    : new Date(entryStartTime).getTime()
  const expectedEndMs = refMs + (expectedMinutes + totalBreakMinutes) * 60_000

  // ── task time (live, ticks with active task) — net durations, break time subtracted ──
  const activeStartMs = activeTaskStartTime ? new Date(activeTaskStartTime).getTime() : 0
  const activeMs = activeTaskStartTime
    ? Math.max(0, now - activeStartMs - breakOverlapMs(activeStartMs, now, breaks))
    : 0
  const liveTaskMinutes = completedTaskMinutes + activeMs / 60_000

  const dayBalance = liveTaskMinutes - expectedMinutes
  const progress   = expectedMinutes > 0
    ? Math.min((liveTaskMinutes / expectedMinutes) * 100, 100)
    : 0

  // Overtime logic:
  // - Active task present → clock-based (did we pass the expected end time?)
  // - No active task → task-balance-based (did we log more minutes than expected?)
  // This prevents showing stale "extra" time when the user finished hours ago.
  const isOvertime = activeTaskStartTime
    ? now >= expectedEndMs
    : dayBalance > 0
  const overtimeMinutes = activeTaskStartTime
    ? (now - expectedEndMs) / 60_000
    : dayBalance

  const isClosed = !!entryEndTime
  const remainingTaskMinutes = Math.max(0, -dayBalance)
  const remainingClockMinutes = Math.max(0, (expectedEndMs - now) / 60_000)

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${stacked ? 'lg:grid-cols-1' : ''}`}>
      {/* task time */}
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">Tiempo en tareas</p>
        <p className="text-2xl font-bold mt-1 tabular-nums">{formatMinutes(liveTaskMinutes)}</p>
        <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-1.5 rounded-full transition-all ${dayBalance >= 0 ? 'bg-green-500' : 'bg-primary'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1 tabular-nums">
          de {formatMinutes(expectedMinutes)}
          {remainingTaskMinutes > 0 && <> · faltan <span className="font-medium text-foreground">{formatMinutes(remainingTaskMinutes)}</span></>}
        </p>
      </div>

      {/* expected end — fixed clock, remaining countdown */}
      <div className={`rounded-lg border bg-card p-4 ${isOvertime ? 'border-green-500/50' : 'border-border'}`}>
        <p className="text-xs text-muted-foreground uppercase tracking-wide">
          Fin de jornada {!isClosed && <span className="normal-case tracking-normal opacity-70">(previsto)</span>}
        </p>
        <p className="text-2xl font-bold mt-1 tabular-nums">
          {fmtHHMM(entryEndTime ? new Date(entryEndTime).getTime() : expectedEndMs)}
        </p>
        {isClosed ? (
          <p className="text-xs text-muted-foreground mt-1 tabular-nums">
            Previsto a las {fmtHHMM(expectedEndMs)}
            {isOvertime && <span className="text-green-600 dark:text-green-400 font-medium"> · +{formatMinutes(overtimeMinutes)} extra</span>}
          </p>
        ) : isOvertime ? (
          <p className="text-xs text-green-600 dark:text-green-400 mt-1 font-medium tabular-nums">
            +{formatMinutes(overtimeMinutes)} extra
          </p>
        ) : activeTaskStartTime ? (
          <p className="text-xs text-muted-foreground mt-1 tabular-nums">
            en {formatMinutes(remainingClockMinutes)}
          </p>
        ) : null}
      </div>
    </div>
  )
}
