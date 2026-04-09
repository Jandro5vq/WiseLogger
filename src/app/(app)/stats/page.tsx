'use client'

import { useEffect, useState } from 'react'
import { formatMinutes } from '@/lib/utils'
import { HoursBarChart } from '@/components/stats/hours-bar-chart'
import { BalanceLineChart } from '@/components/stats/balance-line-chart'
import { ActivityHeatmap } from '@/components/stats/activity-heatmap'
import type { DaySummary } from '@/lib/business/balance'

type Period = 'week' | 'month' | 'year'

export default function StatsPage() {
  const [period, setPeriod] = useState<Period>('month')
  const [data, setData] = useState<{
    days: DaySummary[]
    totalWorkedMinutes: number
    totalExpectedMinutes: number
    cumulativeBalance: number
  } | null>(null)
  const [allDays, setAllDays] = useState<DaySummary[]>([])

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    let url = ''
    if (period === 'week') {
      url = `/api/summary/week?date=${today}`
    } else if (period === 'month') {
      const d = new Date()
      url = `/api/summary/month?year=${d.getFullYear()}&month=${d.getMonth() + 1}`
    } else {
      const d = new Date()
      const from = `${d.getFullYear()}-01-01`
      url = `/api/summary/range?from=${from}&to=${today}`
    }

    fetch(url)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
  }, [period])

  useEffect(() => {
    fetch('/api/summary/balance')
      .then((r) => r.json())
      .then((d) => setAllDays(d.days ?? []))
      .catch(() => {})
  }, [])

  const periodBalance =
    data ? data.totalWorkedMinutes - data.totalExpectedMinutes : 0

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Estadísticas</h1>
        <div className="flex rounded-md border border-border overflow-hidden">
          {(['week', 'month', 'year'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-sm capitalize transition-colors ${
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

      {data && (
        <div className="grid grid-cols-3 gap-4">
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
      )}

      {data && data.days.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-medium mb-4">Horas por día</h2>
          <HoursBarChart days={data.days} />
        </div>
      )}

      {allDays.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-medium mb-4">Balance acumulado</h2>
          <BalanceLineChart days={allDays} />
        </div>
      )}

      {allDays.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-medium mb-4">Actividad</h2>
          <ActivityHeatmap days={allDays} />
        </div>
      )}

      {data && data.days.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-medium mb-3">Desglose diario</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Fecha</th>
                  <th className="pb-2 font-medium text-right">Trabajado</th>
                  <th className="pb-2 font-medium text-right">Esperado</th>
                  <th className="pb-2 font-medium text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.days.filter((d) => d.workedMinutes > 0 || d.expectedMinutes > 0).map((day) => {
                  const balance = day.workedMinutes - day.expectedMinutes
                  return (
                    <tr key={day.date} className="border-b border-border/50 last:border-0">
                      <td className="py-1.5 font-mono text-xs">{day.date}</td>
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
    </div>
  )
}
