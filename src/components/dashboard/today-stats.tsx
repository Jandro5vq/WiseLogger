'use client'

import { useEffect, useState } from 'react'
import { formatMinutes } from '@/lib/utils'

interface TodayStatsProps {
  entryStartTime: string           // fallback if no tasks yet
  firstTaskStartTime?: string      // drives the expectedEnd reference
  completedTaskMinutes: number     // raw sum of finished task durations (no break subtraction)
  expectedMinutes: number
  totalBreakMinutes: number        // sum of today's breaks (shifts expectedEnd)
  activeTaskStartTime?: string     // ISO — for live "worked" ticking
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

  // ── task time (live, ticks with active task) — raw durations, no break deduction ──
  const activeMs = activeTaskStartTime
    ? Math.max(0, now - new Date(activeTaskStartTime).getTime())
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

  return (
    <div className="grid grid-cols-2 gap-4 mb-6">
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
        <p className="text-xs text-muted-foreground mt-1">de {formatMinutes(expectedMinutes)}</p>
      </div>

      {/* expected end — fixed clock, remaining countdown */}
      <div className={`rounded-lg border bg-card p-4 ${isOvertime ? 'border-green-500/50' : 'border-border'}`}>
        <p className="text-xs text-muted-foreground uppercase tracking-wide">Fin de jornada</p>
        <p className="text-2xl font-bold mt-1 tabular-nums">{fmtHHMM(expectedEndMs)}</p>
        {isOvertime && (
          <p className="text-xs text-green-600 dark:text-green-400 mt-1 font-medium tabular-nums">
            +{formatMinutes(overtimeMinutes)} extra
          </p>
        )}
      </div>
    </div>
  )
}
