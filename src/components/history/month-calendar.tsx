'use client'

import Link from 'next/link'
import { cn, formatMinutes } from '@/lib/utils'
import type { DaySummary } from '@/lib/business/balance'

interface MonthCalendarProps {
  year: number
  month: number
  days: DaySummary[]
  onNavigate: (year: number, month: number) => void
}

function cellColor(day: DaySummary): string {
  if (day.expectedMinutes === 0) return 'bg-muted text-muted-foreground'
  const ratio = day.workedMinutes / day.expectedMinutes
  if (ratio >= 1) return 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
  if (ratio >= 0.5) return 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
  return 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function MonthCalendar({ year, month, days, onNavigate }: MonthCalendarProps) {
  const dayMap = new Map(days.map((d) => [d.date, d]))
  const firstDay = new Date(year, month - 1, 1)
  const startOffset = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, month, 0).getDate()
  const monthName = firstDay.toLocaleString('default', { month: 'long', year: 'numeric' })

  const cells: Array<{ date: string | null; day: number | null }> = []
  for (let i = 0; i < startOffset; i++) cells.push({ date: null, day: null })
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({ date: dateStr, day: d })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => onNavigate(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1)}
          className="rounded-md p-2 hover:bg-accent transition-colors"
        >
          ←
        </button>
        <h2 className="font-semibold capitalize">{monthName}</h2>
        <button
          onClick={() => onNavigate(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1)}
          className="rounded-md p-2 hover:bg-accent transition-colors"
        >
          →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">
            {d}
          </div>
        ))}

        {cells.map((cell, i) => {
          if (!cell.date || !cell.day) return <div key={`empty-${i}`} />

          const summary = dayMap.get(cell.date)

          return (
            <Link
              key={cell.date}
              href={`/history/${cell.date}`}
              className={cn(
                'rounded-md p-1.5 text-center transition-colors hover:opacity-80 min-h-[3.5rem] flex flex-col items-center justify-start gap-0.5',
                summary ? cellColor(summary) : 'hover:bg-accent text-foreground'
              )}
            >
              <span className="text-sm font-medium">{cell.day}</span>
              {summary && summary.workedMinutes > 0 && (
                <span className="text-[10px] leading-tight opacity-80 font-mono">
                  {formatMinutes(summary.workedMinutes)}
                </span>
              )}
            </Link>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-green-100 dark:bg-green-900" />
          <span>≥ target</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-yellow-100 dark:bg-yellow-900" />
          <span>partial</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-red-100 dark:bg-red-900" />
          <span>low</span>
        </div>
      </div>
    </div>
  )
}
