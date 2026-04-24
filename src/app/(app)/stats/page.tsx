'use client'

import { useEffect, useMemo, useState } from 'react'
import { useToast } from '@/components/ui/toast'
import { formatMinutes } from '@/lib/utils'
import { HoursBarChart } from '@/components/stats/hours-bar-chart'
import { BalanceLineChart } from '@/components/stats/balance-line-chart'
import { ActivityHeatmap } from '@/components/stats/activity-heatmap'
import { TopTasksList, type TopTask } from '@/components/stats/top-tasks-list'
import { WeekdayPatternChart } from '@/components/stats/weekday-pattern-chart'
import { DayDetailDrawer } from '@/components/stats/day-detail-drawer'
import type { DaySummary } from '@/lib/business/balance'

type Period = 'week' | 'month' | 'year'
type HeatmapPeriod = '3m' | '6m' | '1a'

const HEATMAP_WEEKS: Record<HeatmapPeriod, number> = { '3m': 13, '6m': 26, '1a': 52 }

function localDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function periodBounds(period: Period): { from: string; to: string } {
  const today = new Date()
  const to = localDateStr(today)
  if (period === 'week') {
    const from = new Date(today)
    from.setDate(today.getDate() - 6)
    return { from: localDateStr(from), to }
  }
  if (period === 'month') {
    const from = new Date(today.getFullYear(), today.getMonth(), 1)
    return { from: localDateStr(from), to }
  }
  const from = new Date(today.getFullYear(), 0, 1)
  return { from: localDateStr(from), to }
}

function heatmapFromDate(weeks: number): string {
  const d = new Date()
  d.setDate(d.getDate() - (weeks * 7 - 1))
  return localDateStr(d)
}

function Skeleton({ height = 96 }: { height?: number }) {
  return <div className="rounded-lg bg-muted animate-pulse" style={{ height }} />
}

export default function StatsPage() {
  const toast = useToast()
  const [period, setPeriod] = useState<Period>('month')
  const [heatmapPeriod, setHeatmapPeriod] = useState<HeatmapPeriod>('1a')
  const [data, setData] = useState<{
    days: DaySummary[]
    totalWorkedMinutes: number
    totalExpectedMinutes: number
    cumulativeBalance: number
  } | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [heatmapDays, setHeatmapDays] = useState<DaySummary[]>([])
  const [loadingHeatmap, setLoadingHeatmap] = useState(true)
  const [topTasks, setTopTasks] = useState<TopTask[]>([])
  const [loadingTopTasks, setLoadingTopTasks] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // Period-dependent: KPIs + hours bar + weekday pattern + top tasks + breakdown
  useEffect(() => {
    setLoadingData(true)
    setLoadingTopTasks(true)
    const { from, to } = periodBounds(period)

    const summaryUrl =
      period === 'week'
        ? `/api/summary/week?date=${to}`
        : period === 'month'
          ? (() => { const d = new Date(); return `/api/summary/month?year=${d.getFullYear()}&month=${d.getMonth() + 1}` })()
          : `/api/summary/range?from=${from}&to=${to}`

    fetch(summaryUrl)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoadingData(false) })
      .catch(() => { setLoadingData(false); toast.error('Error al cargar estadísticas') })

    fetch(`/api/summary/tasks-agg?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((d) => { setTopTasks(d.tasks ?? []); setLoadingTopTasks(false) })
      .catch(() => { setLoadingTopTasks(false); toast.error('Error al cargar tareas') })
  }, [period, toast])

  // Heatmap + cumulative line: bounded to heatmap period
  useEffect(() => {
    setLoadingHeatmap(true)
    const from = heatmapFromDate(HEATMAP_WEEKS[heatmapPeriod])
    fetch(`/api/summary/balance?from=${from}`)
      .then((r) => r.json())
      .then((d) => { setHeatmapDays(d.days ?? []); setLoadingHeatmap(false) })
      .catch(() => { setLoadingHeatmap(false); toast.error('Error al cargar el balance') })
  }, [heatmapPeriod, toast])

  const periodBalance = data ? data.totalWorkedMinutes - data.totalExpectedMinutes : 0

  const taskCountByDate = useMemo(() => {
    // DaySummary doesn't carry task counts; left empty for now so the heatmap
    // tooltip omits the "N tareas" line unless we add counts server-side later.
    return new Map<string, number>()
  }, [])

  return (
    <div data-tour="stats-main" className="max-w-6xl mx-auto space-y-6">
      {/* Header + period toggle */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Estadísticas</h1>
        <div className="flex rounded-md border border-border overflow-hidden" role="tablist" aria-label="Periodo">
          {(['week', 'month', 'year'] as Period[]).map((p) => (
            <button
              key={p}
              role="tab"
              aria-selected={period === p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-sm transition-colors ${
                period === p
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              {p === 'week' ? 'Semana' : p === 'month' ? 'Mes' : 'Año'}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      {loadingData ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Skeleton height={76} />
          <Skeleton height={76} />
          <Skeleton height={76} />
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Trabajado</p>
            <p className="text-xl font-bold">{formatMinutes(data.totalWorkedMinutes)}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Esperado</p>
            <p className="text-xl font-bold">{formatMinutes(data.totalExpectedMinutes)}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Balance</p>
            <p className={`text-xl font-bold ${periodBalance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {periodBalance >= 0 ? '+' : ''}{formatMinutes(periodBalance)}
            </p>
          </div>
        </div>
      ) : null}

      {/* Hours bar chart */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium mb-4">Horas por día</h2>
        {loadingData ? (
          <Skeleton height={240} />
        ) : data && data.days.length > 0 ? (
          <HoursBarChart days={data.days} />
        ) : (
          <p className="text-sm text-muted-foreground text-center py-10">Sin datos para este periodo.</p>
        )}
      </div>

      {/* Top tasks */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium mb-3">Top tareas del periodo</h2>
        {loadingTopTasks ? (
          <div className="space-y-2">
            <Skeleton height={24} />
            <Skeleton height={24} />
            <Skeleton height={24} />
          </div>
        ) : (
          <TopTasksList tasks={topTasks} />
        )}
      </div>

      {/* Weekday pattern */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium mb-3">Patrón por día de la semana</h2>
        {loadingData ? (
          <Skeleton height={192} />
        ) : data && data.days.length > 0 ? (
          <WeekdayPatternChart days={data.days} />
        ) : (
          <p className="text-sm text-muted-foreground text-center py-10">Sin datos para este periodo.</p>
        )}
      </div>

      {/* Cumulative balance */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium mb-4">Balance acumulado</h2>
        {loadingHeatmap ? (
          <Skeleton height={240} />
        ) : heatmapDays.length > 0 ? (
          <BalanceLineChart days={heatmapDays} />
        ) : (
          <p className="text-sm text-muted-foreground text-center py-10">Sin datos todavía.</p>
        )}
      </div>

      {/* Activity heatmap */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium">Actividad</h2>
          <div className="flex rounded-md border border-border overflow-hidden text-xs" role="tablist" aria-label="Rango del heatmap">
            {(['3m', '6m', '1a'] as HeatmapPeriod[]).map((p) => (
              <button
                key={p}
                role="tab"
                aria-selected={heatmapPeriod === p}
                onClick={() => setHeatmapPeriod(p)}
                className={`px-2.5 py-1 transition-colors ${
                  heatmapPeriod === p
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                {p === '3m' ? '3 meses' : p === '6m' ? '6 meses' : '1 año'}
              </button>
            ))}
          </div>
        </div>
        {loadingHeatmap ? (
          <Skeleton height={130} />
        ) : (
          <ActivityHeatmap
            days={heatmapDays}
            weeks={HEATMAP_WEEKS[heatmapPeriod]}
            taskCountByDate={taskCountByDate}
            onCellClick={(date) => setSelectedDate(date)}
          />
        )}
      </div>

      {/* Daily breakdown */}
      {data && data.days.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-medium mb-3">Desglose diario</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th scope="col" className="pb-2 font-medium">Fecha</th>
                  <th scope="col" className="pb-2 font-medium text-right">Trabajado</th>
                  <th scope="col" className="pb-2 font-medium text-right">Esperado</th>
                  <th scope="col" className="pb-2 font-medium text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.days
                  .filter((d) => d.workedMinutes > 0 || d.expectedMinutes > 0)
                  .map((day) => {
                    const balance = day.workedMinutes - day.expectedMinutes
                    return (
                      <tr key={day.date} className="border-b border-border/50 last:border-0">
                        <td className="py-1.5 font-mono text-xs">
                          <button
                            type="button"
                            onClick={() => setSelectedDate(day.date)}
                            className="hover:text-primary transition-colors"
                          >
                            {day.date}
                          </button>
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{formatMinutes(day.workedMinutes)}</td>
                        <td className="py-1.5 text-right tabular-nums text-muted-foreground">{formatMinutes(day.expectedMinutes)}</td>
                        <td className={`py-1.5 text-right tabular-nums font-medium ${balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {balance >= 0 ? '+' : ''}{formatMinutes(balance)}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Export */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium mb-3">Exportar</h2>
        <div className="flex gap-2">
          <a
            href="/api/export/csv"
            download
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent transition-colors"
          >
            Descargar CSV
          </a>
          <a
            href="/api/export/json"
            download
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent transition-colors"
          >
            Descargar JSON
          </a>
        </div>
      </div>

      <DayDetailDrawer date={selectedDate} onClose={() => setSelectedDate(null)} />
    </div>
  )
}
