'use client'

import { cn } from '@/lib/utils'
import type { DaySummary } from '@/lib/business/balance'

function intensityClass(minutes: number): string {
  if (minutes === 0) return 'bg-muted'
  const hours = minutes / 60
  if (hours < 2) return 'bg-green-200 dark:bg-green-900'
  if (hours < 4) return 'bg-green-400 dark:bg-green-700'
  if (hours < 6) return 'bg-green-500 dark:bg-green-600'
  return 'bg-green-600 dark:bg-green-500'
}

export function ActivityHeatmap({ days }: { days: DaySummary[] }) {
  const dayMap = new Map(days.map((d) => [d.date, d]))

  // Build 52 weeks × 7 days grid starting from 364 days ago
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const startDate = new Date(today)
  startDate.setDate(today.getDate() - 363)
  // Align to Monday
  const startDay = (startDate.getDay() + 6) % 7
  startDate.setDate(startDate.getDate() - startDay)

  const weeks: Array<Array<{ date: string; minutes: number } | null>> = []
  const current = new Date(startDate)

  for (let w = 0; w < 53; w++) {
    const week: Array<{ date: string; minutes: number } | null> = []
    for (let d = 0; d < 7; d++) {
      const dateStr = current.toISOString().split('T')[0]
      const summary = dayMap.get(dateStr)
      week.push({ date: dateStr, minutes: summary?.workedMinutes ?? 0 })
      current.setDate(current.getDate() + 1)
    }
    weeks.push(week)
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-0.5 min-w-max">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-0.5">
            {week.map((cell, di) =>
              cell ? (
                <div
                  key={di}
                  title={`${cell.date}: ${Math.round(cell.minutes / 6) / 10}h`}
                  className={cn('w-3 h-3 rounded-sm', intensityClass(cell.minutes))}
                />
              ) : (
                <div key={di} className="w-3 h-3" />
              )
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
        <span>Less</span>
        {['bg-muted', 'bg-green-200 dark:bg-green-900', 'bg-green-400 dark:bg-green-700', 'bg-green-600 dark:bg-green-500'].map(
          (c, i) => (
            <div key={i} className={cn('w-3 h-3 rounded-sm', c)} />
          )
        )}
        <span>More</span>
      </div>
    </div>
  )
}
