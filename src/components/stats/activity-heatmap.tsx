'use client'

import { useMemo, useState } from 'react'
import type { DaySummary } from '@/lib/business/balance'

export interface CellMeta {
  date: string
  minutes: number
  balance: number
  taskCount: number
}

interface ActivityHeatmapProps {
  days: DaySummary[]
  weeks?: number
  taskCountByDate?: Map<string, number>
  onCellClick?: (date: string) => void
}

const INTENSITY_STOPS: Array<{ max: number; alpha: number }> = [
  { max: 0,   alpha: 0 },       // no trabajo → muted
  { max: 120, alpha: 0.18 },    // <2h
  { max: 240, alpha: 0.38 },    // 2-4h
  { max: 360, alpha: 0.60 },    // 4-6h
  { max: Infinity, alpha: 0.88 }, // 6h+
]

function intensityAlpha(minutes: number): number {
  if (minutes <= 0) return 0
  for (const s of INTENSITY_STOPS) if (minutes < s.max || s.max === Infinity) return s.alpha
  return 0.88
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const days = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`
}

function fmtHours(minutes: number): string {
  if (minutes <= 0) return '0h'
  const h = Math.round(minutes / 6) / 10
  return `${h}h`
}

function fmtBalance(minutes: number): string {
  const h = Math.round(minutes / 6) / 10
  return `${h >= 0 ? '+' : ''}${h}h`
}

function localDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function ActivityHeatmap({
  days,
  weeks = 52,
  taskCountByDate,
  onCellClick,
}: ActivityHeatmapProps) {
  const [hover, setHover] = useState<{ cell: CellMeta; x: number; y: number } | null>(null)

  const grid = useMemo(() => {
    const map = new Map(days.map((d) => [d.date, d]))
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const totalDays = weeks * 7
    const start = new Date(today)
    start.setDate(today.getDate() - (totalDays - 1))
    // Align to Monday (0 = Monday … 6 = Sunday)
    const startDay = (start.getDay() + 6) % 7
    start.setDate(start.getDate() - startDay)

    const cols: Array<Array<CellMeta | null>> = []
    const cursor = new Date(start)
    const weekCount = weeks + 1
    for (let w = 0; w < weekCount; w++) {
      const week: Array<CellMeta | null> = []
      for (let d = 0; d < 7; d++) {
        const dateStr = localDateStr(cursor)
        const summary = map.get(dateStr)
        const minutes = summary?.workedMinutes ?? 0
        const balance = summary?.dayBalance ?? 0
        const taskCount = taskCountByDate?.get(dateStr) ?? 0
        const inFuture = cursor > today
        week.push(inFuture ? null : { date: dateStr, minutes, balance, taskCount })
        cursor.setDate(cursor.getDate() + 1)
      }
      cols.push(week)
    }
    return cols
  }, [days, weeks, taskCountByDate])

  function handleEnter(e: React.MouseEvent<HTMLButtonElement>, cell: CellMeta) {
    const rect = e.currentTarget.getBoundingClientRect()
    const parent = e.currentTarget.closest('[data-heatmap-root]') as HTMLElement | null
    const parentRect = parent?.getBoundingClientRect()
    setHover({
      cell,
      x: rect.left - (parentRect?.left ?? 0) + rect.width / 2,
      y: rect.top - (parentRect?.top ?? 0),
    })
  }

  return (
    <div data-heatmap-root className="relative">
      <div className="overflow-x-auto">
        <div className="flex gap-0.5 min-w-max">
          {grid.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-0.5">
              {week.map((cell, di) =>
                cell ? (
                  <button
                    key={di}
                    type="button"
                    onMouseEnter={(e) => handleEnter(e, cell)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={(e) => handleEnter(e as unknown as React.MouseEvent<HTMLButtonElement>, cell)}
                    onBlur={() => setHover(null)}
                    onClick={() => onCellClick?.(cell.date)}
                    aria-label={`${fmtDate(cell.date)}: ${fmtHours(cell.minutes)}, balance ${fmtBalance(cell.balance)}`}
                    title={`${cell.date}: ${fmtHours(cell.minutes)}`}
                    className="w-3 h-3 rounded-sm cursor-pointer hover:ring-1 hover:ring-primary/60 focus:outline-none focus:ring-1 focus:ring-primary"
                    style={{
                      backgroundColor:
                        cell.minutes <= 0
                          ? 'hsl(var(--muted))'
                          : `hsl(var(--primary) / ${intensityAlpha(cell.minutes)})`,
                    }}
                  />
                ) : (
                  <div key={di} className="w-3 h-3" />
                )
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
        <span>Menos</span>
        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'hsl(var(--muted))' }} />
        {INTENSITY_STOPS.slice(1).map((s, i) => (
          <div
            key={i}
            className="w-3 h-3 rounded-sm"
            style={{ backgroundColor: `hsl(var(--primary) / ${s.alpha})` }}
          />
        ))}
        <span>Más</span>
      </div>

      {/* Floating tooltip */}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-popover shadow-md px-2 py-1.5 text-[11px] leading-tight whitespace-nowrap"
          style={{ left: hover.x, top: hover.y - 6 }}
        >
          <p className="font-medium capitalize">{fmtDate(hover.cell.date)}</p>
          <p className="text-muted-foreground">
            {fmtHours(hover.cell.minutes)}
            <span className="mx-1">·</span>
            <span className={hover.cell.balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}>
              {fmtBalance(hover.cell.balance)}
            </span>
            {hover.cell.taskCount > 0 && (
              <>
                <span className="mx-1">·</span>
                {hover.cell.taskCount} tarea{hover.cell.taskCount === 1 ? '' : 's'}
              </>
            )}
          </p>
        </div>
      )}
    </div>
  )
}
