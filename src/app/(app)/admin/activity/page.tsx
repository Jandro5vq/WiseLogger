'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeftBox } from 'pixelarticons/react'
import { useToast } from '@/components/ui/toast'
import { getJson } from '@/lib/fetcher'
import { formatMinutes, localDateString, periodBounds, type Period } from '@/lib/utils'
import type { ActivitySummary } from '@/lib/business/admin-activity'

const DORMANT_DAYS = 14
const DAY_MS = 86_400_000

function relativeTime(iso: string | null): string {
  if (!iso) return 'Nunca'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Ahora'
  if (mins < 60) return `Hace ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Hace ${hours} h`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'Ayer' : `Hace ${days} días`
}

/** Every date in [from, to] with its active-user count (0 when nobody logged). */
function fillDays(from: string, to: string, perDay: ActivitySummary['perDay']) {
  const counts = new Map(perDay.map((d) => [d.date, d.activeUsers]))
  const out: { date: string; activeUsers: number }[] = []
  const cur = new Date(`${from}T12:00:00`)
  const end = new Date(`${to}T12:00:00`)
  while (cur <= end) {
    const date = localDateString(cur)
    out.push({ date, activeUsers: counts.get(date) ?? 0 })
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold mt-1 tabular-nums">{value}</p>
    </div>
  )
}

export default function AdminActivityPage() {
  const router = useRouter()
  const toast = useToast()
  const [period, setPeriod] = useState<Period>('month')
  const [data, setData] = useState<ActivitySummary | null>(null)
  const lastPeriodRef = useRef<Period | null>(null)

  useEffect(() => {
    if (lastPeriodRef.current !== period) {
      lastPeriodRef.current = period
      setData(null)
    }
    const { from, to } = periodBounds(period)
    getJson<ActivitySummary>(`/api/admin/activity?from=${from}&to=${to}`)
      .then(setData)
      .catch(() => toast.error('Error al cargar la actividad'))
  }, [period, toast])

  const days = useMemo(() => (data ? fillDays(data.from, data.to, data.perDay) : []), [data])
  const maxActive = Math.max(1, ...days.map((d) => d.activeUsers))

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <ArrowLeftBox width={20} height={20} />
            Back
          </button>
          <h1 className="text-2xl font-bold">Actividad</h1>
        </div>
        <div className="flex rounded-md border border-border overflow-hidden" role="tablist" aria-label="Periodo">
          {(['week', 'month', 'year'] as Period[]).map((p) => (
            <button
              key={p}
              role="tab"
              aria-selected={period === p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-sm transition-colors ${
                period === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              {p === 'week' ? '7 días' : p === 'month' ? 'Mes' : 'Año'}
            </button>
          ))}
        </div>
      </div>

      {!data ? (
        <div className="space-y-4">
          <div className="rounded-lg bg-muted animate-pulse h-24" />
          <div className="rounded-lg bg-muted animate-pulse h-40" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <Tile label="Usuarios activos" value={`${data.totals.activeUsers} / ${data.totals.users}`} />
            <Tile label="Días registrados" value={String(data.totals.activeDays)} />
            <Tile label="Tareas registradas" value={String(data.totals.tasks)} />
            <Tile label="Horas totales" value={formatMinutes(data.totals.workedMinutes)} />
            <Tile label="Tareas en curso" value={String(data.totals.runningTasks)} />
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm font-medium mb-3">Usuarios activos por día</p>
            <div className="flex items-end gap-px h-24" role="img" aria-label="Usuarios activos por día">
              {days.map((d) => (
                <div
                  key={d.date}
                  title={`${d.date}: ${d.activeUsers} usuario${d.activeUsers === 1 ? '' : 's'}`}
                  className={`flex-1 min-w-0 rounded-sm ${d.activeUsers ? 'bg-primary/70' : 'bg-muted'}`}
                  style={{ height: d.activeUsers ? `${(d.activeUsers / maxActive) * 100}%` : '2px' }}
                />
              ))}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>{data.from}</span>
              <span>{data.to}</span>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Usuario</th>
                  <th className="text-left p-3 font-medium">Último login</th>
                  <th className="text-left p-3 font-medium">Última actividad</th>
                  <th className="text-right p-3 font-medium">Días activos</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => {
                  const dormant =
                    u.isActive &&
                    (!u.lastActivityAt || Date.now() - new Date(u.lastActivityAt).getTime() > DORMANT_DAYS * DAY_MS)
                  return (
                    <tr key={u.id} className="border-t border-border">
                      <td className="p-3">
                        <span className="font-medium">{u.username}</span>
                        {!u.isActive && (
                          <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
                            Suspendido
                          </span>
                        )}
                        {dormant && (
                          <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            Inactivo +{DORMANT_DAYS} días
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground">{relativeTime(u.lastLoginAt)}</td>
                      <td className="p-3 text-muted-foreground">{relativeTime(u.lastActivityAt)}</td>
                      <td className="p-3 text-right tabular-nums">{u.activeDays}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
