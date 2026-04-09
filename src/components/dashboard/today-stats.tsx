'use client'

import { useEffect, useState } from 'react'
import { formatMinutes } from '@/lib/utils'

interface TodayStatsProps {
  entryStartTime: string           // fallback if no tasks yet
  firstTaskStartTime?: string      // drives the expectedEnd reference
  completedWorkedMinutes: number   // sum of finished tasks, breaks already subtracted (server value)
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
  completedWorkedMinutes,
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
  const remainingMs   = expectedEndMs - now          // negative = overtime
  const isOvertime    = remainingMs <= 0

  // ── worked (live, ticks with active task) ─────────────────────────────────
  const activeMs = activeTaskStartTime
    ? Math.max(0, now - new Date(activeTaskStartTime).getTime())
    : 0
  const liveWorkedMinutes = completedWorkedMinutes + activeMs / 60_000

  const dayBalance = liveWorkedMinutes - expectedMinutes
  const progress   = expectedMinutes > 0
    ? Math.min((liveWorkedMinutes / expectedMinutes) * 100, 100)
    : 0

  return (
    <div className="grid grid-cols-2 gap-4 mb-6">
      {/* worked today */}
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">Trabajado hoy</p>
        <p className="text-2xl font-bold mt-1 tabular-nums">{formatMinutes(liveWorkedMinutes)}</p>
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
            +{formatMinutes(Math.abs(remainingMs) / 60_000)} extra
          </p>
        )}
      </div>
    </div>
  )
}
