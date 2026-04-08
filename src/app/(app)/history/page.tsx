'use client'

import { useState, useEffect } from 'react'
import { MonthCalendar } from '@/components/history/month-calendar'
import { WeekView } from '@/components/history/week-view'
import type { DaySummary } from '@/lib/business/balance'

type View = 'week' | 'month'

export default function HistoryPage() {
  const now = new Date()
  const [view, setView] = useState<View>('week')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [days, setDays] = useState<DaySummary[]>([])

  useEffect(() => {
    if (view !== 'month') return
    fetch(`/api/summary/month?year=${year}&month=${month}`)
      .then((r) => r.json())
      .then((data) => setDays(data.days ?? []))
      .catch(() => {})
  }, [year, month, view])

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">History</h1>
        <div className="flex rounded-md border border-border overflow-hidden">
          {(['week', 'month'] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-1.5 text-sm capitalize transition-colors ${
                view === v
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === 'week' && <WeekView />}

      {view === 'month' && (
        <div className="rounded-lg border border-border bg-card p-6">
          <MonthCalendar year={year} month={month} days={days} onNavigate={(y, m) => { setYear(y); setMonth(m) }} />
        </div>
      )}
    </div>
  )
}
